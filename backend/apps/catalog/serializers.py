from rest_framework import serializers

from .models import Category, Platform, Skill


class CatalogItemSerializer(serializers.Serializer):
    slug = serializers.SlugField(read_only=True)
    name = serializers.CharField(read_only=True)


class CatalogSerializer(serializers.Serializer):
    categories = CatalogItemSerializer(many=True, read_only=True)
    platforms = CatalogItemSerializer(many=True, read_only=True)
    skills = CatalogItemSerializer(many=True, read_only=True)

    @staticmethod
    def current() -> dict:
        return {
            "categories": Category.objects.all(),
            "platforms": Platform.objects.all(),
            "skills": Skill.objects.all(),
        }
