from django.urls import path

from .attachment_views import FeedbackAttachmentsView, FeedbackAttachmentView, feedback_attachment
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
    path(
        f"{BASE}<uuid:feedback_id>/attachments/",
        FeedbackAttachmentsView.as_view(),
        name="feedback-attachments",
    ),
    path(
        f"{BASE}<uuid:feedback_id>/attachments/<uuid:key>/",
        FeedbackAttachmentView.as_view(),
        name="feedback-attachment",
    ),
    path("feedback-attachments/<uuid:key>/", feedback_attachment, name="feedback-attachment-file"),
    path("me/feedback/", MyFeedbackView.as_view(), name="my-feedback"),
]
