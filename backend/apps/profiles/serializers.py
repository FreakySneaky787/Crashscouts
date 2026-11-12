from django.core.validators import URLValidator
from rest_framework import serializers

from apps.catalog.models import Category, Platform, Skill
from apps.catalog.serializers import CatalogItemSerializer

from .models import Profile


class PublicProfileSerializer(serializers.Serializer):
    """Only what the owner made public. Hidden fields are omitted, not sent as empty values."""

    username = serializers.CharField(source="user.username")
    avatar_key = serializers.UUIDField(allow_null=True)
    indexable = serializers.BooleanField()
    bio = serializers.CharField(required=False)
    link = serializers.URLField(required=False)
    interests = CatalogItemSerializer(many=True, required=False)
    platforms = CatalogItemSerializer(many=True, required=False)
    skills = CatalogItemSerializer(many=True, required=False)

    def to_representation(self, profile: Profile) -> dict:
        data = {
            "username": profile.user.username,
            "avatar_key": str(profile.avatar_key) if profile.avatar_key else None,
            "indexable": profile.indexable,
        }
        if profile.show_bio and profile.bio:
            data["bio"] = profile.bio
        if profile.show_link and profile.link:
            data["link"] = profile.link
        for field in ("interests", "platforms", "skills"):
            if getattr(profile, f"show_{field}"):
                items = getattr(profile, field).all()
                if items:
                    data[field] = CatalogItemSerializer(items, many=True).data
        return data


class OwnProfileSerializer(serializers.ModelSerializer):
    """The owner's full profile including the visibility switches."""

    username = serializers.CharField(source="user.username", read_only=True)
    avatar_key = serializers.UUIDField(read_only=True, allow_null=True)
    # Declared explicitly: DRF replaces the model's URL validator with its own, which would also
    # accept http:// and ftp://. Only https links are allowed.
    link = serializers.URLField(
        max_length=200,
        allow_blank=True,
        required=False,
        validators=[URLValidator(schemes=["https"], message="Enter an https:// link.")],
    )
    interests = serializers.SlugRelatedField(
        slug_field="slug", queryset=Category.objects.all(), many=True, required=False
    )
    platforms = serializers.SlugRelatedField(
        slug_field="slug", queryset=Platform.objects.all(), many=True, required=False
    )
    skills = serializers.SlugRelatedField(
        slug_field="slug", queryset=Skill.objects.all(), many=True, required=False
    )

    class Meta:
        model = Profile
        fields = (
            "username",
            "avatar_key",
            "bio",
            "link",
            "interests",
            "platforms",
            "skills",
            "show_bio",
            "show_link",
            "show_interests",
            "show_platforms",
            "show_skills",
            "indexable",
        )

    def validate_bio(self, value: str) -> str:
        return value.strip()
