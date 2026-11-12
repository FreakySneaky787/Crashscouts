from django.contrib import admin

from .models import Category, Platform, Skill


@admin.register(Category, Platform, Skill)
class CatalogItemAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "position")
    ordering = ("position", "name")
    prepopulated_fields = {"slug": ("name",)}  # noqa: RUF012
