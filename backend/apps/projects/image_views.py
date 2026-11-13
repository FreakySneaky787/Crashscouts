"""Project logo and screenshots (WP 2.4). Upload and removal for the team; delivery checks the
project's visibility on every request."""

from django.core.exceptions import ValidationError
from django.core.files.storage import default_storage
from django.http import FileResponse, Http404, HttpRequest
from django.views.decorators.http import require_safe
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.throttling import USER_AND_IP

from .images import (
    LOGO_MAX_BYTES,
    SCREENSHOT_MAX_BYTES,
    ImageLimitError,
    add_screenshot,
    image_file,
    remove_logo,
    set_logo,
)
from .models import Project, Screenshot
from .policies import can_edit, can_view
from .selectors import project_for

MULTIPART_OVERHEAD = 64 * 1024


def _team_project(request: Request, slug: str) -> Project:
    project = project_for(request.user, slug)
    if project is None or not can_edit(request.user, project):
        raise Http404
    if project.blocked_at is not None:
        raise PermissionDenied("blocked")  # blocked by moderators (ADR 0020)
    return project


def _too_large(request: Request, max_bytes: int) -> bool:
    try:
        return int(request.META.get("CONTENT_LENGTH") or 0) > max_bytes + MULTIPART_OVERHEAD
    except ValueError:
        return True


class ProjectLogoView(APIView):
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser,)
    throttle_classes = USER_AND_IP
    throttle_scope = "project_image"

    @extend_schema(
        request={
            "multipart/form-data": inline_serializer(
                "LogoUpload", {"image": serializers.ImageField()}
            )
        },
        responses={204: None},
    )
    def put(self, request: Request, slug: str) -> Response:
        project = _team_project(request, slug)
        if _too_large(request, LOGO_MAX_BYTES):
            return Response(
                {"code": "invalid_image"}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            )
        upload = request.FILES.get("image")
        if upload is None:
            return Response({"code": "invalid_image"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            set_logo(project, upload)
        except ValidationError:
            return Response({"code": "invalid_image"}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request: Request, slug: str) -> Response:
        remove_logo(_team_project(request, slug))
        return Response(status=status.HTTP_204_NO_CONTENT)


class ScreenshotCreateView(APIView):
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser,)
    throttle_classes = USER_AND_IP
    throttle_scope = "project_image"

    @extend_schema(
        request={
            "multipart/form-data": inline_serializer(
                "ScreenshotUpload",
                {"image": serializers.ImageField(), "alt_text": serializers.CharField()},
            )
        },
        responses={201: None},
    )
    def post(self, request: Request, slug: str) -> Response:
        project = _team_project(request, slug)
        if _too_large(request, SCREENSHOT_MAX_BYTES):
            return Response(
                {"code": "invalid_image"}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            )
        alt_text = str(request.data.get("alt_text", "")).strip()
        if not alt_text or len(alt_text) > 200:
            return Response({"code": "alt_text_required"}, status=status.HTTP_400_BAD_REQUEST)
        upload = request.FILES.get("image")
        if upload is None:
            return Response({"code": "invalid_image"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            screenshot = add_screenshot(project, upload, alt_text)
        except ImageLimitError:
            return Response({"code": "too_many_screenshots"}, status=status.HTTP_400_BAD_REQUEST)
        except ValidationError:
            return Response({"code": "invalid_image"}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"key": str(screenshot.key)}, status=status.HTTP_201_CREATED)


class ScreenshotDeleteView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request: Request, slug: str, key) -> Response:
        project = _team_project(request, slug)
        deleted, _ = Screenshot.objects.filter(project=project, key=key).delete()
        if not deleted:
            raise Http404
        return Response(status=status.HTTP_204_NO_CONTENT)


@require_safe
def project_image(request: HttpRequest, key) -> FileResponse:
    """Serves a logo or screenshot if the requester may see the project (plain Django view:
    images regardless of the Accept header, session from the forwarded cookie)."""
    found = image_file(key)
    if found is None:
        raise Http404
    project, path = found
    if not can_view(request.user, project) or not default_storage.exists(path):
        raise Http404
    response = FileResponse(default_storage.open(path, "rb"), content_type="image/webp")
    response["Content-Disposition"] = 'inline; filename="image.webp"'
    response["Content-Security-Policy"] = "default-src 'none'; sandbox"
    response["X-Content-Type-Options"] = "nosniff"
    public = project.visibility == Project.Visibility.PUBLIC
    response["Cache-Control"] = "public, max-age=3600" if public else "private, no-store"
    return response
