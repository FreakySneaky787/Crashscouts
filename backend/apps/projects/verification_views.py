"""Repository verification API (WP 2.5). Only the project team sees and starts checks."""

from django.http import Http404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Project
from .policies import can_edit
from .repositories import parse_repository_url, verification_filename
from .selectors import project_for
from .verification import (
    VerificationError,
    challenge_for,
    check_file,
    check_github,
    github_authorize_url,
    github_configured,
    project_from_state,
    take_attempt,
)


def _team_project(request: Request, slug: str) -> Project:
    project = project_for(request.user, slug)
    if project is None or not can_edit(request.user, project):
        raise Http404  # also for visible public projects: the check code is team-only
    return project


def _status(project: Project) -> dict:
    ref = parse_repository_url(project.repository_url) if project.repository_url else None
    row = challenge_for(project) if ref is not None else None
    valid = row is not None and row.is_valid_for(project)
    return {
        "repository_url": project.repository_url,
        "host": ref.kind if ref else None,
        "verified": valid,
        "method": row.method if valid else None,
        "verified_at": row.verified_at if valid else None,
        "filename": verification_filename(),
        "code": row.code if row else None,
        "github_available": bool(ref and ref.kind == "github" and github_configured()),
    }


StatusSerializer = inline_serializer(
    "RepositoryVerificationStatus",
    {
        "repository_url": serializers.CharField(),
        "host": serializers.CharField(allow_null=True),
        "verified": serializers.BooleanField(),
        "method": serializers.CharField(allow_null=True),
        "verified_at": serializers.DateTimeField(allow_null=True),
        "filename": serializers.CharField(),
        "code": serializers.CharField(allow_null=True),
        "github_available": serializers.BooleanField(),
    },
)
ErrorSerializer = inline_serializer("VerificationError", {"code": serializers.CharField()})


def _error(error: VerificationError, **extra) -> Response:
    return Response({"code": error.code, **extra}, status=status.HTTP_400_BAD_REQUEST)


def _rate_limited() -> Response:
    return Response({"code": "rate_limited"}, status=status.HTTP_429_TOO_MANY_REQUESTS)


class VerificationView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(responses=StatusSerializer)
    def get(self, request: Request, slug: str) -> Response:
        return Response(_status(_team_project(request, slug)))


class FileCheckView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(request=None, responses={200: StatusSerializer, 400: ErrorSerializer})
    def post(self, request: Request, slug: str) -> Response:
        project = _team_project(request, slug)
        if not take_attempt(project):
            return _rate_limited()
        try:
            check_file(project, request.user)
        except VerificationError as error:
            return _error(error)
        return Response(_status(project))


class GitHubStartView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(
        request=None,
        responses={
            200: inline_serializer("GitHubAuthorize", {"authorize_url": serializers.URLField()}),
            400: ErrorSerializer,
        },
    )
    def post(self, request: Request, slug: str) -> Response:
        project = _team_project(request, slug)
        if not take_attempt(project):
            return _rate_limited()
        try:
            url = github_authorize_url(request, project)
        except VerificationError as error:
            return _error(error)
        return Response({"authorize_url": url})


class GitHubCallbackSerializer(serializers.Serializer):
    state = serializers.CharField(max_length=2000)
    code = serializers.CharField(max_length=200, required=False, allow_blank=True)
    error = serializers.CharField(max_length=100, required=False, allow_blank=True)


class GitHubCallbackView(APIView):
    """Called by the SSR callback route with GitHub's query parameters.

    A GET like every OAuth callback (RFC 6749, section 4.1.2): the browser arrives from GitHub, so
    a CSRF token cannot exist. The signed, session-bound, single-use ``state`` takes its place
    (RFC 6749, section 10.12).
    """

    permission_classes = (IsAuthenticated,)

    @extend_schema(
        parameters=[GitHubCallbackSerializer],
        responses={
            200: inline_serializer("GitHubVerified", {"slug": serializers.CharField()}),
            400: inline_serializer(
                "GitHubVerificationError",
                {"code": serializers.CharField(), "slug": serializers.CharField(required=False)},
            ),
        },
    )
    def get(self, request: Request) -> Response:
        serializer = GitHubCallbackSerializer(data=request.query_params)
        if not serializer.is_valid():
            return _error(VerificationError("invalid_state"))
        data = serializer.validated_data
        try:
            project = project_from_state(request, data["state"])
        except VerificationError as error:
            return _error(error)
        if data.get("error") or not data.get("code"):
            return _error(VerificationError("cancelled"), slug=project.slug)
        try:
            check_github(project, request.user, data["code"])
        except VerificationError as error:
            return _error(error, slug=project.slug)
        return Response({"slug": project.slug})
