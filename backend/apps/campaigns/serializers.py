from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from apps.catalog.models import Platform
from apps.catalog.serializers import CatalogItemSerializer

from . import status
from .models import (
    MAX_TARGET_TESTERS,
    Application,
    ApplicationQuestion,
    Campaign,
    CampaignSlugHistory,
)
from .policies import is_participant, is_team
from .selectors import participant_count
from .validators import (
    normalize_sha256,
    validate_campaign_slug,
    validate_download_url,
    validate_timezone,
)


class CampaignSerializer(serializers.ModelSerializer):
    """Read view. ``status`` is derived (status.py); ``can_edit`` is the viewer's own right."""

    project = serializers.CharField(source="project.slug")
    platforms = CatalogItemSerializer(many=True)
    status = serializers.SerializerMethodField()
    participant_count = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    is_participant = serializers.SerializerMethodField()
    open_applications = serializers.SerializerMethodField()
    my_application = serializers.SerializerMethodField()
    moderation = serializers.SerializerMethodField()

    class Meta:
        model = Campaign
        fields = (
            "project",
            "slug",
            "title",
            "summary",
            "description",
            "version",
            "changelog",
            "hardware_requirements",
            "prerequisites",
            "methodology",
            "starts_at",
            "ends_at",
            "timezone",
            "target_testers",
            "platforms",
            "visibility",
            "participation",
            "state",
            "status",
            "participant_count",
            "can_edit",
            "is_participant",
            "open_applications",
            "my_application",
            "moderation",
            "created_at",
            "updated_at",
        )

    def get_participant_count(self, campaign) -> int:
        return participant_count(campaign)

    def get_status(self, campaign) -> str:
        return status.effective_status(
            campaign.state,
            starts_at=campaign.starts_at,
            now=timezone.now(),
            participants=participant_count(campaign),
            target=campaign.target_testers,
        )

    def get_can_edit(self, campaign) -> bool:
        return is_team(self.context["request"].user, campaign)

    def get_moderation(self, campaign) -> dict | None:
        """Block with reason and appeal state, for the team only (ADR 0020)."""
        if campaign.blocked_at is None or not is_team(self.context["request"].user, campaign):
            return None
        from apps.moderation.actions import team_block_info

        return team_block_info(campaign)

    def get_open_applications(self, campaign) -> int | None:
        """Number of open applications, for the team only (owner's decision: shown, not emailed)."""
        if not is_team(self.context["request"].user, campaign):
            return None
        return Application.objects.filter(
            campaign=campaign, status=Application.Status.PENDING
        ).count()

    def get_my_application(self, campaign) -> str | None:
        """Status of the viewer's own application, if any."""
        user = self.context["request"].user
        if not getattr(user, "is_authenticated", False):
            return None
        mine = Application.objects.filter(campaign=campaign, applicant=user).first()
        return mine.status if mine else None

    def get_is_participant(self, campaign) -> bool:
        """The viewer's own participation only; never who else takes part."""
        return is_participant(self.context["request"].user, campaign)


class CampaignWriteSerializer(serializers.ModelSerializer):
    slug = serializers.CharField(max_length=40, validators=[validate_campaign_slug])
    target_testers = serializers.IntegerField(min_value=1, max_value=MAX_TARGET_TESTERS)
    timezone = serializers.CharField(max_length=64, required=False, validators=[validate_timezone])
    participation = serializers.ChoiceField(choices=Campaign.Participation.choices, required=False)
    platforms = serializers.SlugRelatedField(
        slug_field="slug", queryset=Platform.objects.all(), many=True, required=False
    )

    class Meta:
        model = Campaign
        fields = (
            "slug",
            "title",
            "summary",
            "description",
            "version",
            "changelog",
            "hardware_requirements",
            "prerequisites",
            "methodology",
            "starts_at",
            "ends_at",
            "timezone",
            "target_testers",
            "platforms",
            "visibility",
            "participation",
        )

    def validate_slug(self, value: str) -> str:
        value = value.strip().lower()
        project = self.context["project"]
        taken = Campaign.objects.filter(project=project, slug=value)
        former = CampaignSlugHistory.objects.filter(project=project, slug=value)
        if self.instance is not None:
            taken = taken.exclude(pk=self.instance.pk)
            former = former.exclude(campaign=self.instance)
        if taken.exists() or former.exists():
            raise serializers.ValidationError("This name is already taken.", code="slug_taken")
        return value

    def validate_title(self, value: str) -> str:
        return value.strip()

    def validate_summary(self, value: str) -> str:
        return value.strip()

    def validate_version(self, value: str) -> str:
        return value.strip()

    def _current(self, attrs: dict, key: str, default=None):
        if key in attrs:
            return attrs[key]
        return getattr(self.instance, key) if self.instance is not None else default

    def validate(self, attrs: dict) -> dict:
        starts_at = self._current(attrs, "starts_at")
        ends_at = self._current(attrs, "ends_at")
        if starts_at and ends_at and ends_at <= starts_at:
            raise serializers.ValidationError(
                {"ends_at": "The end must be after the start."}, code="ends_before_start"
            )
        visibility = self._current(attrs, "visibility", Campaign.Visibility.PRIVATE)
        participation = attrs.get("participation")
        if participation is None:
            # Default for the visibility; a change of visibility brings its default along.
            if "visibility" in attrs or self.instance is None:
                participation = (
                    Campaign.Participation.INVITATION
                    if visibility == Campaign.Visibility.PRIVATE
                    else Campaign.Participation.DIRECT
                )
            else:
                participation = self.instance.participation
        private = visibility == Campaign.Visibility.PRIVATE
        if private != (participation == Campaign.Participation.INVITATION):
            raise serializers.ValidationError(
                {"participation": "Private campaigns take invited people only."},
                code="participation_mismatch",
            )
        attrs["participation"] = participation
        return attrs


class CampaignLinkSerializer(serializers.Serializer):
    """Read view of a download link; ``host`` and ``in_repository`` help testers judge it."""

    id = serializers.UUIDField()
    label = serializers.CharField()
    url = serializers.CharField()
    host = serializers.SerializerMethodField()
    platform = CatalogItemSerializer(allow_null=True)
    sha256 = serializers.CharField()
    in_repository = serializers.SerializerMethodField()
    suspended = serializers.SerializerMethodField()
    blocked = serializers.SerializerMethodField()

    def get_suspended(self, link) -> bool:
        return link.suspended_at is not None

    def get_blocked(self, link) -> bool:
        return link.blocked_at is not None

    def get_host(self, link) -> str:
        from .links import host_of

        return host_of(link.url)

    def get_in_repository(self, link) -> bool:
        from .links import in_verified_repository

        return in_verified_repository(link)


class CampaignLinkWriteSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=80)
    url = serializers.CharField(max_length=500, validators=[validate_download_url])
    platform = serializers.SlugRelatedField(
        slug_field="slug", queryset=Platform.objects.all(), allow_null=True, required=False
    )
    sha256 = serializers.CharField(max_length=100, allow_blank=True, required=False)

    def validate_label(self, value: str) -> str:
        return value.strip()

    def validate_url(self, value: str) -> str:
        return value.strip()

    def validate_sha256(self, value: str) -> str:
        try:
            return normalize_sha256(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages[0], code="invalid_sha256") from None


class ApplicationQuestionSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    prompt = serializers.CharField(max_length=200)
    kind = serializers.ChoiceField(choices=ApplicationQuestion.Kind.choices)
    options = serializers.ListField(
        child=serializers.CharField(max_length=100),
        max_length=ApplicationQuestion.MAX_OPTIONS,
        required=False,
    )
    required = serializers.BooleanField(required=False)

    def validate_prompt(self, value: str) -> str:
        return value.strip()

    def validate_options(self, value: list[str]) -> list[str]:
        cleaned = [option.strip() for option in value if option.strip()]
        if len(set(cleaned)) != len(cleaned):
            raise serializers.ValidationError("Options must differ.", code="duplicate_options")
        return cleaned

    def validate(self, attrs: dict) -> dict:
        kind = attrs.get("kind", getattr(self.instance, "kind", None))
        options = attrs.get("options", getattr(self.instance, "options", []))
        if kind == ApplicationQuestion.Kind.SINGLE_CHOICE:
            if len(options) < 2:
                raise serializers.ValidationError(
                    {"options": "Give at least two options."}, code="too_few_options"
                )
        else:
            attrs["options"] = []  # only choice questions have options
        return attrs
