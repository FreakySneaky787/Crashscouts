from django.urls import path

from .application_views import (
    ApplicationDecisionView,
    ApplicationsView,
    ApplyView,
    MyApplicationsView,
    WithdrawView,
)
from .invitation_views import (
    CampaignInvitationRevokeView,
    CampaignInvitationsView,
    MyCampaignInvitationAnswerView,
    MyCampaignInvitationsView,
    MyParticipationsView,
)
from .link_views import CampaignLinksView, CampaignLinkView
from .participation_views import JoinView, LeaveView, ParticipantRemoveView
from .question_views import QuestionsView, QuestionTemplateView, QuestionView
from .task_views import (
    ProgressOverviewView,
    TaskMoveView,
    TaskProgressView,
    TasksView,
    TaskView,
)
from .views import CampaignDetailView, CampaignListView, CampaignStateView

urlpatterns = [
    path("projects/<str:slug>/campaigns/", CampaignListView.as_view(), name="campaigns"),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/",
        CampaignDetailView.as_view(),
        name="campaign-detail",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/links/",
        CampaignLinksView.as_view(),
        name="campaign-links",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/links/<uuid:link_id>/",
        CampaignLinkView.as_view(),
        name="campaign-link",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/invitations/",
        CampaignInvitationsView.as_view(),
        name="campaign-invitations",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/invitations/<uuid:invitation_id>/",
        CampaignInvitationRevokeView.as_view(),
        name="campaign-invitation-revoke",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/questions/",
        QuestionsView.as_view(),
        name="campaign-questions",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/questions/template/<str:key>/",
        QuestionTemplateView.as_view(),
        name="campaign-question-template",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/questions/<uuid:question_id>/",
        QuestionView.as_view(),
        name="campaign-question",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/apply/",
        ApplyView.as_view(),
        name="campaign-apply",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/withdraw/",
        WithdrawView.as_view(),
        name="campaign-withdraw",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/applications/",
        ApplicationsView.as_view(),
        name="campaign-applications",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/applications/<uuid:application_id>/<str:decision>/",
        ApplicationDecisionView.as_view(),
        name="campaign-application-decision",
    ),
    path("me/applications/", MyApplicationsView.as_view(), name="my-applications"),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/join/",
        JoinView.as_view(),
        name="campaign-join",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/leave/",
        LeaveView.as_view(),
        name="campaign-leave",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/participants/<str:username>/",
        ParticipantRemoveView.as_view(),
        name="campaign-participant-remove",
    ),
    path(
        "me/campaign-invitations/",
        MyCampaignInvitationsView.as_view(),
        name="my-campaign-invitations",
    ),
    path(
        "me/campaign-invitations/<uuid:invitation_id>/<str:answer>/",
        MyCampaignInvitationAnswerView.as_view(),
        name="my-campaign-invitation-answer",
    ),
    path("me/participations/", MyParticipationsView.as_view(), name="my-participations"),
    # Test tasks and progress (WP 4.1); before the catch-all state route below.
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/tasks/",
        TasksView.as_view(),
        name="campaign-tasks",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/tasks/<uuid:task_id>/",
        TaskView.as_view(),
        name="campaign-task",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/tasks/<uuid:task_id>/move/",
        TaskMoveView.as_view(),
        name="campaign-task-move",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/tasks/<uuid:task_id>/progress/",
        TaskProgressView.as_view(),
        name="campaign-task-progress",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/progress/",
        ProgressOverviewView.as_view(),
        name="campaign-progress",
    ),
    path(
        "projects/<str:slug>/campaigns/<str:campaign_slug>/<str:action>/",
        CampaignStateView.as_view(),
        name="campaign-state",
    ),
]
