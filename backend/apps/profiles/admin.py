from django.contrib import admin

from .models import Profile


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "indexable", "updated_at")
    search_fields = ("user__username",)
    readonly_fields = ("avatar_key", "created_at", "updated_at")
    filter_horizontal = ("interests", "platforms", "skills")
