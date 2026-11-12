from django.contrib import admin

from .models import Category, License, Platform, ProgrammingLanguage, Skill


@admin.register(Category, Platform, Skill, ProgrammingLanguage)
class CatalogItemAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "position")
    ordering = ("position", "name")
    prepopulated_fields = {"slug": ("name",)}  # noqa: RUF012


@admin.register(License)
class LicenseAdmin(admin.ModelAdmin):
    list_display = ("spdx_id", "name", "is_osi_approved")
    list_filter = ("is_osi_approved",)
    search_fields = ("spdx_id", "name")
