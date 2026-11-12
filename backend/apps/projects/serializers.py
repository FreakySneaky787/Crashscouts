from django.core.validators import URLValidator
from rest_framework import serializers

from apps.catalog.models import Category, License, Platform, ProgrammingLanguage
from apps.catalog.serializers import CatalogItemSerializer

from .models import Membership, Project, SlugHistory
from .policies import role_of
from .validators import validate_project_slug


class LicenseSummarySerializer(serializers.Serializer):
    spdx_id = serializers.CharField()
    name = serializers.CharField()
    open_source = serializers.BooleanField(source="is_open_source")


class TeamMemberSerializer(serializers.Serializer):
    username = serializers.CharField(source="user.username")
    role = serializers.CharField()


class ProjectSerializer(serializers.ModelSerializer):
    """Read view. `role` is the viewer's own role (null for visitors)."""

    license = LicenseSummarySerializer()
    open_source = serializers.BooleanField(source="is_open_source")
    categories = CatalogItemSerializer(many=True)
    platforms = CatalogItemSerializer(many=True)
    languages = CatalogItemSerializer(many=True)
    team = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            "slug",
            "name",
            "summary",
            "description",
            "status",
            "visibility",
            "license",
            "open_source",
            "repository_url",
            "categories",
            "platforms",
            "languages",
            "team",
            "role",
            "created_at",
            "updated_at",
        )

    def get_team(self, project) -> list[dict]:
        members = (
            Membership.objects.filter(project=project, user__deletion_scheduled_for__isnull=True)
            .select_related("user")
            .order_by("-role", "created_at")  # owner first
        )
        return TeamMemberSerializer(members, many=True).data

    def get_role(self, project) -> str | None:
        return role_of(self.context["request"].user, project)


class ProjectWriteSerializer(serializers.ModelSerializer):
    slug = serializers.CharField(max_length=40, validators=[validate_project_slug])
    license = serializers.SlugRelatedField(slug_field="spdx_id", queryset=License.objects.all())
    # Declared explicitly: DRF would replace the model's https-only validator (see WP 1.2).
    repository_url = serializers.URLField(
        max_length=300,
        allow_blank=True,
        required=False,
        validators=[URLValidator(schemes=["https"], message="Enter an https:// link.")],
    )
    categories = serializers.SlugRelatedField(
        slug_field="slug", queryset=Category.objects.all(), many=True, required=False
    )
    platforms = serializers.SlugRelatedField(
        slug_field="slug", queryset=Platform.objects.all(), many=True, required=False
    )
    languages = serializers.SlugRelatedField(
        slug_field="slug", queryset=ProgrammingLanguage.objects.all(), many=True, required=False
    )

    class Meta:
        model = Project
        fields = (
            "slug",
            "name",
            "summary",
            "description",
            "status",
            "visibility",
            "license",
            "repository_url",
            "categories",
            "platforms",
            "languages",
        )

    def validate_slug(self, value: str) -> str:
        value = value.strip().lower()
        current = self.instance
        taken = Project.objects.filter(slug=value)
        former = SlugHistory.objects.filter(slug=value)
        if current is not None:
            taken = taken.exclude(pk=current.pk)
            former = former.exclude(project=current)
        if taken.exists() or former.exists():
            raise serializers.ValidationError("This name is already taken.", code="slug_taken")
        return value

    def validate_name(self, value: str) -> str:
        return value.strip()

    def validate_summary(self, value: str) -> str:
        return value.strip()
