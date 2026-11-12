from django.conf import settings
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    # In production the public reverse proxy does NOT route /admin/ (docs/SECURITY.md, §7).
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.core.urls")),
    # django-allauth headless: /_allauth/browser/v1/...
    path("_allauth/", include("allauth.headless.urls")),
]

if settings.ENABLE_SSR_PROBE:
    urlpatterns += [path("api/v1/probe/", include("apps.ssr_probe.urls"))]

if settings.SERVE_API_SCHEMA:
    from drf_spectacular.views import SpectacularAPIView

    urlpatterns += [path("api/v1/schema/", SpectacularAPIView.as_view(), name="api-schema")]
