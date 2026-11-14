from django.urls import path

from .moderation_views import (
    AppealCreateView,
    AppealDecisionView,
    AppealsView,
    BlockLiftView,
    CaseActionView,
    CasesView,
    CaseView,
    ReviewDecisionView,
    ReviewsView,
    SuspensionAppealDecisionView,
    SuspensionAppealsView,
    SuspensionLiftView,
    SuspensionsView,
)
from .views import MyReportsView, MySuspensionAppealView, MySuspensionView, ReportCreateView

urlpatterns = [
    path("reports/", ReportCreateView.as_view(), name="reports"),
    path("me/reports/", MyReportsView.as_view(), name="my-reports"),
    path("me/suspension/", MySuspensionView.as_view(), name="my-suspension"),
    path("me/suspension/appeal/", MySuspensionAppealView.as_view(), name="my-suspension-appeal"),
    path(
        "moderation/account-suspensions/", SuspensionsView.as_view(), name="moderation-suspensions"
    ),
    path(
        "moderation/account-suspensions/appeals/",
        SuspensionAppealsView.as_view(),
        name="moderation-suspension-appeals",
    ),
    path(
        "moderation/account-suspensions/<uuid:suspension_id>/lift/",
        SuspensionLiftView.as_view(),
        name="moderation-suspension-lift",
    ),
    path(
        "moderation/account-suspensions/<uuid:suspension_id>/appeal/<str:decision>/",
        SuspensionAppealDecisionView.as_view(),
        name="moderation-suspension-appeal-decide",
    ),
    path("moderation/cases/", CasesView.as_view(), name="moderation-cases"),
    path(
        "moderation/cases/<str:target_type>/<uuid:target_id>/",
        CaseView.as_view(),
        name="moderation-case",
    ),
    path(
        "moderation/cases/<str:target_type>/<uuid:target_id>/<str:action>/",
        CaseActionView.as_view(),
        name="moderation-case-action",
    ),
    path("moderation/blocks/<uuid:block_id>/lift/", BlockLiftView.as_view(), name="block-lift"),
    path("moderation/appeals/", AppealsView.as_view(), name="moderation-appeals"),
    path(
        "moderation/appeals/<uuid:block_id>/<str:decision>/",
        AppealDecisionView.as_view(),
        name="moderation-appeal-decide",
    ),
    path("blocks/<uuid:block_id>/appeal/", AppealCreateView.as_view(), name="block-appeal"),
    path("moderation/reviews/", ReviewsView.as_view(), name="moderation-reviews"),
    path(
        "moderation/reviews/<str:kind>/<uuid:target_id>/<str:decision>/",
        ReviewDecisionView.as_view(),
        name="moderation-review-decide",
    ),
]
