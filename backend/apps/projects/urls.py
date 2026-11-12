from django.urls import path

from .image_views import (
    ProjectLogoView,
    ScreenshotCreateView,
    ScreenshotDeleteView,
    project_image,
)
from .team_views import (
    InvitationAnswerView,
    InvitationCreateView,
    InvitationRevokeView,
    MemberRemoveView,
    MyInvitationsView,
    TeamView,
    TransferView,
)
from .views import MyProjectsView, ProjectCreateView, ProjectDetailView

urlpatterns = [
    path("projects/", ProjectCreateView.as_view(), name="project-create"),
    path("projects/<str:slug>/", ProjectDetailView.as_view(), name="project-detail"),
    path("me/projects/", MyProjectsView.as_view(), name="my-projects"),
    path("projects/<str:slug>/team/", TeamView.as_view(), name="project-team"),
    path("projects/<str:slug>/invitations/", InvitationCreateView.as_view(), name="invite"),
    path(
        "projects/<str:slug>/invitations/<uuid:invitation_id>/",
        InvitationRevokeView.as_view(),
        name="invitation-revoke",
    ),
    path(
        "projects/<str:slug>/members/<str:username>/",
        MemberRemoveView.as_view(),
        name="member-remove",
    ),
    path("projects/<str:slug>/transfer/", TransferView.as_view(), name="project-transfer"),
    path("me/invitations/", MyInvitationsView.as_view(), name="my-invitations"),
    path("projects/<str:slug>/logo/", ProjectLogoView.as_view(), name="project-logo"),
    path("projects/<str:slug>/screenshots/", ScreenshotCreateView.as_view(), name="screenshots"),
    path(
        "projects/<str:slug>/screenshots/<uuid:key>/",
        ScreenshotDeleteView.as_view(),
        name="screenshot-delete",
    ),
    path("project-images/<uuid:key>/", project_image, name="project-image"),
    path(
        "me/invitations/<uuid:invitation_id>/<str:answer>/",
        InvitationAnswerView.as_view(),
        name="invitation-answer",
    ),
]
