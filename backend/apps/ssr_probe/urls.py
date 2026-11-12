from django.urls import path

from .views import ProbeItemDetailView, ProbeItemTouchView

urlpatterns = [
    path("items/<uuid:pk>/", ProbeItemDetailView.as_view(), name="probe-item-detail"),
    path("items/<uuid:pk>/touch/", ProbeItemTouchView.as_view(), name="probe-item-touch"),
]
