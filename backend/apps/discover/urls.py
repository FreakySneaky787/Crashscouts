from django.urls import path

from .views import DiscoverCampaignsView, DiscoverProjectsView

urlpatterns = [
    path("discover/projects/", DiscoverProjectsView.as_view(), name="discover-projects"),
    path("discover/campaigns/", DiscoverCampaignsView.as_view(), name="discover-campaigns"),
]
