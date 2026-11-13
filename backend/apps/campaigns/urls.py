from django.urls import path

from .views import CampaignDetailView, CampaignListView, CampaignStateView

urlpatterns = [
    path("projects/<str:slug>/campaigns/", CampaignListView.as_view(), name="campaigns"),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/",
        CampaignDetailView.as_view(),
        name="campaign-detail",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/<str:action>/",
        CampaignStateView.as_view(),
        name="campaign-state",
    ),
]
