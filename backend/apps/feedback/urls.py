from django.urls import path

from .views import (
    FeedbackDetailView,
    FeedbackListView,
    FeedbackPublishView,
    FeedbackStatusView,
    MyFeedbackView,
)

BASE = "projects/<str:slug>/campaigns/<str:campaign_slug>/feedback/"

urlpatterns = [
    path(BASE, FeedbackListView.as_view(), name="feedback"),
    path(f"{BASE}<uuid:feedback_id>/", FeedbackDetailView.as_view(), name="feedback-detail"),
    path(f"{BASE}<uuid:feedback_id>/status/", FeedbackStatusView.as_view(), name="feedback-status"),
    path(
        f"{BASE}<uuid:feedback_id>/publish/<str:action>/",
        FeedbackPublishView.as_view(),
        name="feedback-publish",
    ),
    path("me/feedback/", MyFeedbackView.as_view(), name="my-feedback"),
]
