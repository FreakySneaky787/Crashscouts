from django.urls import path

from .views import AccountDeletionView, DataExportView

urlpatterns = [
    path("me/deletion/", AccountDeletionView.as_view(), name="account-deletion"),
    path("me/export/", DataExportView.as_view(), name="data-export"),
]
