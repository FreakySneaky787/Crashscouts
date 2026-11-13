from django.urls import path

from .role_views import MyRoleView, PlatformRolesView
from .views import AccountDeletionView, DataExportView

urlpatterns = [
    path("me/deletion/", AccountDeletionView.as_view(), name="account-deletion"),
    path("me/export/", DataExportView.as_view(), name="data-export"),
    path("me/platform-role/", MyRoleView.as_view(), name="my-platform-role"),
    path("platform/roles/", PlatformRolesView.as_view(), name="platform-roles"),
]
