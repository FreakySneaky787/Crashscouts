from django.urls import path

from .moderation_views import (
    AppealCreateView,
    AppealDecisionView,
    AppealsView,
    BlockLiftView,
    CaseActionView,
    CasesView,
    CaseView,
)
from .views import MyReportsView, ReportCreateView

urlpatterns = [
    path("reports/", ReportCreateView.as_view(), name="reports"),
    path("me/reports/", MyReportsView.as_view(), name="my-reports"),
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
]
