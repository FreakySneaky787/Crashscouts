from django.conf import settings
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    # In Produktion routet der öffentliche Reverse Proxy /admin/ NICHT (docs/SECURITY.md, §7).
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.core.urls")),
]

if settings.SERVE_API_SCHEMA:
    from drf_spectacular.views import SpectacularAPIView

    urlpatterns += [path("api/v1/schema/", SpectacularAPIView.as_view(), name="api-schema")]
