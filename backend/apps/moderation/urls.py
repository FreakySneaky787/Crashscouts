from django.urls import path

from .views import MyReportsView, ReportCreateView

urlpatterns = [
    path("reports/", ReportCreateView.as_view(), name="reports"),
    path("me/reports/", MyReportsView.as_view(), name="my-reports"),
]
