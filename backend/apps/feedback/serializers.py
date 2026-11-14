from rest_framework import serializers

from apps.campaigns.models import SHORT_MARKDOWN_MAX_LENGTH, TestTask
from apps.catalog.models import Platform
from apps.catalog.serializers import CatalogItemSerializer

from . import policies
from .models import DESCRIPTION_MAX_LENGTH, Feedback

K = Feedback.Kind
# Type-specific fields (ADR 0024): what each kind may have, and what it must have.
KIND_FIELDS = {
    K.BUG: {"steps", "expected", "actual", "platform", "version"},
    K.UX: {"location", "suggestion"},
    K.FEATURE: {"solution"},
    K.COMPATIBILITY: {"platform", "environment", "result", "version"},
    K.GENERAL: set(),
}
REQUIRED_FIELDS = {
    K.BUG: ("steps", "expected", "actual"),
    K.FEATURE: ("solution",),
    K.COMPATIBILITY: ("platform", "result"),
}
TEXT_FIELDS = ("steps", "expected", "actual", "location", "suggestion", "solution", "environment")
OPTIONAL_FIELDS = (*TEXT_FIELDS, "result", "platform", "version")


def _text(max_length: int):
    return serializers.CharField(max_length=max_length, required=False, allow_blank=True)


class FeedbackWriteSerializer(serializers.Serializer):
    """Create and change (while "New"). Fields that do not belong to the kind are cleared."""

    kind = serializers.ChoiceField(choices=Feedback.Kind.choices)
    title = serializers.CharField(max_length=120)
    description = serializers.CharField(max_length=DESCRIPTION_MAX_LENGTH)
    steps = _text(SHORT_MARKDOWN_MAX_LENGTH)
    expected = _text(SHORT_MARKDOWN_MAX_LENGTH)
    actual = _text(SHORT_MARKDOWN_MAX_LENGTH)
    location = _text(200)
    suggestion = _text(SHORT_MARKDOWN_MAX_LENGTH)
    solution = _text(SHORT_MARKDOWN_MAX_LENGTH)
    environment = _text(300)
    result = serializers.ChoiceField(
        choices=Feedback.Result.choices, required=False, allow_blank=True
    )
    platform = serializers.SlugRelatedField(
        slug_field="slug", queryset=Platform.objects.all(), required=False, allow_null=True
    )
    version = _text(50)
    task = serializers.UUIDField(required=False, allow_null=True)

    def validate_title(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter a title.", code="blank")
        return value

    def validate_description(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Describe your feedback.", code="blank")
        return value

    def validate_task(self, value):
        if value is None:
            return None
        task = TestTask.objects.filter(
            campaign=self.context["campaign"], pk=value, hidden_at__isnull=True
        ).first()
        if task is None:
            raise serializers.ValidationError("Choose a task of this campaign.", code="invalid")
        return task

    def _current(self, attrs: dict, key: str):
        if key in attrs:
            return attrs[key]
        return getattr(self.instance, key) if self.instance is not None else None

    def validate(self, attrs: dict) -> dict:
        for key in (*TEXT_FIELDS, "version"):
            if isinstance(attrs.get(key), str):
                attrs[key] = attrs[key].strip()
        kind = self._current(attrs, "kind")
        allowed = KIND_FIELDS[kind]
        for key in OPTIONAL_FIELDS:
            if key not in allowed:
                attrs[key] = None if key == "platform" else ""
        missing = {
            key: serializers.ErrorDetail("This field is required.", code="required")
            for key in REQUIRED_FIELDS.get(kind, ())
            if not self._current(attrs, key)
        }
        if missing:
            raise serializers.ValidationError({key: [error] for key, error in missing.items()})
        if "version" in allowed and not self._current(attrs, "version"):
            attrs["version"] = self.context["campaign"].version
        return attrs


class FeedbackSerializer(serializers.Serializer):
    """Read view. ``author`` only for the team and the author; others see null ("a tester")."""

    id = serializers.UUIDField()
    kind = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    steps = serializers.CharField()
    expected = serializers.CharField()
    actual = serializers.CharField()
    location = serializers.CharField()
    suggestion = serializers.CharField()
    solution = serializers.CharField()
    environment = serializers.CharField()
    result = serializers.CharField()
    platform = CatalogItemSerializer(allow_null=True)
    version = serializers.CharField()
    task = serializers.SerializerMethodField()
    status = serializers.ChoiceField(choices=Feedback.Status.choices)
    duplicate_of = serializers.SerializerMethodField()
    author = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()
    published = serializers.SerializerMethodField()
    publish_proposed = serializers.SerializerMethodField()
    author_consented = serializers.SerializerMethodField()
    can_change = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()
    can_verify = serializers.SerializerMethodField()
    attachments = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()

    def _user(self):
        return self.context["request"].user

    def get_task(self, feedback) -> dict | None:
        task = feedback.task
        return {"id": str(task.pk), "title": task.title} if task else None

    def get_duplicate_of(self, feedback) -> dict | None:
        original = feedback.duplicate_of
        return {"id": str(original.pk), "title": original.title} if original else None

    def get_author(self, feedback) -> str | None:
        if feedback.author is None or not policies.can_see_author(self._user(), feedback):
            return None
        return feedback.author.username

    def get_is_mine(self, feedback) -> bool:
        return policies.is_author(self._user(), feedback)

    def get_published(self, feedback) -> bool:
        return feedback.published_at is not None

    def get_publish_proposed(self, feedback) -> bool:
        return feedback.publish_proposed_at is not None

    def get_author_consented(self, feedback) -> bool:
        return feedback.author_consented_at is not None

    def get_can_change(self, feedback) -> bool:
        return self.get_is_mine(feedback) and feedback.status == Feedback.Status.NEW

    def get_can_manage(self, feedback) -> bool:
        return policies.is_team(self._user(), feedback.campaign)

    def get_attachments(self, feedback) -> list[dict]:
        """Only for the team and the author; everyone else gets an empty list (ADR 0024)."""
        if not policies.can_see_attachments(self._user(), feedback):
            return []
        return [
            {"key": str(a.key), "kind": a.kind, "name": a.name, "size": a.size}
            for a in feedback.attachments.all()
        ]

    def get_can_verify(self, feedback) -> bool:
        return self.get_is_mine(feedback) and feedback.status == Feedback.Status.FIXED


class FeedbackDetailSerializer(FeedbackSerializer):
    history = serializers.SerializerMethodField()

    def get_history(self, feedback) -> list[dict]:
        return [
            {"status": change.status, "role": change.role, "at": change.created_at}
            for change in feedback.history.all()
        ]


class MyFeedbackSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    kind = serializers.CharField()
    title = serializers.CharField()
    status = serializers.ChoiceField(choices=Feedback.Status.choices)
    published = serializers.SerializerMethodField()
    campaign_title = serializers.CharField(source="campaign.title")
    campaign_slug = serializers.CharField(source="campaign.slug")
    project_slug = serializers.CharField(source="campaign.project.slug")
    updated_at = serializers.DateTimeField()

    def get_published(self, feedback) -> bool:
        return feedback.published_at is not None
