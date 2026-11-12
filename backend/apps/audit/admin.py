from django.contrib import admin

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    """Read-only: the audit log can be inspected, never edited."""

    list_display = ("created_at", "kind", "actor", "subject")
    list_filter = ("kind",)
    date_hierarchy = "created_at"
    readonly_fields = ("id", "created_at", "kind", "actor", "subject", "data")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
