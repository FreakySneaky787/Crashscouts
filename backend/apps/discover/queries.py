"""Discover (phase 6, ADR 0025): public projects and campaigns, searched, filtered and sorted.

Only public content ever appears: public, unblocked projects; public, published, unblocked
campaigns of public projects, and those only while public campaigns are enabled (security gate).
Owner's decisions (2026-11-14): default sort "recently active", "new" selectable, never by
popularity; "open source only" is preselected.

Search: PostgreSQL full text with the ``simple`` configuration (no language-specific stemming,
content can be German or English) and prefix matches. Only word characters reach the query, so
a search term can never inject tsquery syntax.
"""

import re
from dataclasses import dataclass

from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector
from django.db.models import Count, F, Max, Q, QuerySet, Value
from django.db.models.functions import Coalesce, Greatest

from apps.campaigns.models import Campaign, Participation
from apps.campaigns.policies import public_campaigns_enabled
from apps.projects.models import Project

PAGE_SIZE = 20
MAX_TERMS = 8
MAX_TERM_LENGTH = 40
CONFIG = "simple"
WORD = re.compile(r"\w+", re.UNICODE)


@dataclass(frozen=True)
class Page:
    items: list
    total: int
    page: int
    pages: int


def search_query(text: str) -> SearchQuery | None:
    """Every word must match, each also as a prefix ("sync" finds "synchronise")."""
    terms = [term[:MAX_TERM_LENGTH] for term in WORD.findall(text or "")][:MAX_TERMS]
    if not terms:
        return None
    return SearchQuery(" & ".join(f"{term}:*" for term in terms), config=CONFIG, search_type="raw")


def paginate(queryset: QuerySet, page: int) -> Page:
    total = queryset.count()
    pages = max(1, -(-total // PAGE_SIZE))
    page = min(max(page, 1), pages)
    start = (page - 1) * PAGE_SIZE
    return Page(list(queryset[start : start + PAGE_SIZE]), total, page, pages)


def live_campaigns() -> QuerySet[Campaign]:
    """Campaigns anyone may find: public, published, unblocked, of a public, unblocked project -
    and none at all while the security gate keeps public campaigns locked."""
    if not public_campaigns_enabled():
        return Campaign.objects.none()
    return Campaign.objects.filter(
        visibility=Campaign.Visibility.PUBLIC,
        state=Campaign.State.PUBLISHED,
        blocked_at__isnull=True,
        project__visibility=Project.Visibility.PUBLIC,
        project__blocked_at__isnull=True,
    )


def _project_filters(queryset: QuerySet, filters: dict, path: str = "") -> QuerySet:
    """Filters on the project; ``path`` is "project__" when filtering campaigns."""
    for key, lookup in (
        ("category", "categories__slug"),
        ("language", "languages__slug"),
        ("software_type", "software_types__slug"),
    ):
        if filters.get(key):
            ids = Project.objects.filter(**{lookup: filters[key]}).values("pk")
            queryset = queryset.filter(**{f"{path}pk__in": ids})
    # "Open source only" is preselected (owner's decision); ``open_source=False`` shows all.
    if filters.get("open_source", True):
        queryset = queryset.filter(**{f"{path}license__is_osi_approved": True})
    return queryset


def projects(filters: dict, *, q: str = "", sort: str = "active", page: int = 1) -> Page:
    queryset = (
        Project.objects.filter(visibility=Project.Visibility.PUBLIC, blocked_at__isnull=True)
        .select_related("license")
        .prefetch_related("platforms", "software_types")
    )
    if public_campaigns_enabled():
        live = Q(campaigns__in=live_campaigns().values("pk"))
        queryset = queryset.annotate(
            active_campaigns=Count("campaigns", filter=live, distinct=True),
            last_activity=Greatest(
                "updated_at", Coalesce(Max("campaigns__updated_at", filter=live), "updated_at")
            ),
        )
    else:  # the gate is closed: no campaign is public, so none counts
        queryset = queryset.annotate(active_campaigns=Value(0), last_activity=F("updated_at"))
    queryset = _project_filters(queryset, filters)
    if filters.get("platform"):
        ids = Project.objects.filter(platforms__slug=filters["platform"]).values("pk")
        queryset = queryset.filter(pk__in=ids)
    if filters.get("status") in Project.Status.values:
        queryset = queryset.filter(status=filters["status"])
    if filters.get("has_campaign"):
        queryset = queryset.filter(active_campaigns__gt=0)
    order = ["-created_at", "pk"] if sort == "new" else ["-last_activity", "-created_at", "pk"]
    query = search_query(q)
    if query is not None:
        vector = (
            SearchVector("name", weight="A", config=CONFIG)
            + SearchVector("summary", weight="B", config=CONFIG)
            + SearchVector("description", weight="C", config=CONFIG)
        )
        matches = Project.objects.annotate(search=vector).filter(search=query).values("pk")
        queryset = queryset.filter(pk__in=matches).annotate(rank=SearchRank(vector, query))
        order = ["-rank", *order]
    return paginate(queryset.order_by(*order), page)


def campaigns(filters: dict, *, q: str = "", sort: str = "active", page: int = 1) -> Page:
    active = Participation.Status.ACTIVE
    queryset = (
        live_campaigns()
        .select_related("project__license")
        .prefetch_related("platforms")
        .annotate(
            participants=Count(
                "participations", filter=Q(participations__status=active), distinct=True
            ),
            last_activity=Greatest("updated_at", Coalesce("published_at", "updated_at")),
        )
    )
    queryset = _project_filters(queryset, filters, path="project__")
    if filters.get("platform"):
        ids = Campaign.objects.filter(platforms__slug=filters["platform"]).values("pk")
        queryset = queryset.filter(pk__in=ids)
    if filters.get("method") in Campaign.Method.values:
        queryset = queryset.filter(method=filters["method"])
    if filters.get("free_places"):
        queryset = queryset.filter(participants__lt=F("target_testers"))
    order = ["-created_at", "pk"] if sort == "new" else ["-last_activity", "-created_at", "pk"]
    query = search_query(q)
    if query is not None:
        vector = (
            SearchVector("title", weight="A", config=CONFIG)
            + SearchVector("project__name", weight="B", config=CONFIG)
            + SearchVector("summary", weight="B", config=CONFIG)
            + SearchVector("description", weight="C", config=CONFIG)
        )
        matches = Campaign.objects.annotate(search=vector).filter(search=query).values("pk")
        queryset = queryset.filter(pk__in=matches).annotate(rank=SearchRank(vector, query))
        order = ["-rank", *order]
    return paginate(queryset.order_by(*order), page)
