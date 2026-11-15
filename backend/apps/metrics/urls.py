from django.urls import path

from .views import MetricsView

urlpatterns = [
    path("platform/metrics/", MetricsView.as_view(), name="platform-metrics"),
]
