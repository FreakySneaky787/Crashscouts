from django.urls import path

from .views import CatalogView, LicenseListView

urlpatterns = [
    path("catalog/", CatalogView.as_view(), name="catalog"),
    path("catalog/licenses/", LicenseListView.as_view(), name="catalog-licenses"),
]
