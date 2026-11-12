from django.contrib import admin

from .models import Membership, Project, SlugHistory


class MembershipInline(admin.TabularInline):
    model = Membership
    extra = 0
    raw_id_fields = ("user",)


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "status", "visibility", "license", "created_at")
    list_filter = ("status", "visibility")
    search_fields = ("name", "slug")
    inlines = (MembershipInline,)


admin.site.register(SlugHistory)
