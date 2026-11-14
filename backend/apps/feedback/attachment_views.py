"""Feedback attachments API and delivery (WP 5.2, ADR 0024). Only the team and the author see
attachments; everyone else gets 404, also if they can read the feedback itself."""

from django.core.files.storage import default_storage
from django.http import FileResponse, Http404, HttpRequest
from django.views.decorators.http import require_safe
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.campaigns.services import CampaignError
from apps.core.throttling import USER_AND_IP

from . import policies
from .attachments import IMAGE_MAX_BYTES, AttachmentError, add_attachment, path_of
from .models import Feedback, FeedbackAttachment
from .services import ensure_author_can_change
from .views import _error, _feedback

MULTIPART_OVERHEAD = 64 * 1024

AttachmentSerializer = inline_serializer(
    "FeedbackAttachment",
    {
        "key": serializers.UUIDField(),
        "kind": serializers.ChoiceField(choices=FeedbackAttachment.Kind.choices),
        "name": serializers.CharField(),
        "size": serializers.IntegerField(),
    },
)


def attachment_data(attachment: FeedbackAttachment) -> dict:
    return {
        "key": str(attachment.key),
        "kind": attachment.kind,
        "name": attachment.name,
        "size": attachment.size,
    }


def _own_feedback(request: Request, slug, campaign_slug, feedback_id) -> Feedback:
    feedback = _feedback(request, slug, campaign_slug, feedback_id)
    if not policies.can_see_attachments(request.user, feedback):
        raise Http404
    return feedback


class FeedbackAttachmentsView(APIView):
    """POST: the author adds a file while the feedback is "New" (at most 5)."""

    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser,)
    throttle_classes = USER_AND_IP
    throttle_scope = "feedback_attachment"

    @extend_schema(
        request={
            "multipart/form-data": inline_serializer(
                "FeedbackAttachmentUpload", {"file": serializers.FileField()}
            )
        },
        responses={201: AttachmentSerializer},
    )
    def post(self, request: Request, slug: str, campaign_slug: str, feedback_id) -> Response:
        feedback = _own_feedback(request, slug, campaign_slug, feedback_id)
        try:
            ensure_author_can_change(feedback, request.user)
        except CampaignError as exc:
            return _error(exc)
        try:
            length = int(request.META.get("CONTENT_LENGTH") or 0)
        except ValueError:
            length = IMAGE_MAX_BYTES + MULTIPART_OVERHEAD + 1
        if length > IMAGE_MAX_BYTES + MULTIPART_OVERHEAD:  # refuse before parsing the body
            return Response(
                {"code": "invalid_file"}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
            )
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"code": "invalid_file"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            attachment = add_attachment(feedback, upload)
        except AttachmentError as exc:
            return Response({"code": exc.code}, status=status.HTTP_400_BAD_REQUEST)
        return Response(attachment_data(attachment), status=status.HTTP_201_CREATED)


class FeedbackAttachmentView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request: Request, slug: str, campaign_slug: str, feedback_id, key) -> Response:
        feedback = _own_feedback(request, slug, campaign_slug, feedback_id)
        try:
            ensure_author_can_change(feedback, request.user)
        except CampaignError as exc:
            return _error(exc)
        deleted, _ = FeedbackAttachment.objects.filter(feedback=feedback, key=key).delete()
        if not deleted:
            raise Http404
        return Response(status=status.HTTP_204_NO_CONTENT)


@require_safe
def feedback_attachment(request: HttpRequest, key) -> FileResponse:
    """Serves an attachment to the team and the author only, checked on every request and never
    cached. Images inline in a sandbox; text only as a download, never rendered."""
    attachment = (
        FeedbackAttachment.objects.select_related("feedback__campaign__project", "feedback")
        .filter(key=key)
        .first()
    )
    if attachment is None or not policies.can_see_attachments(request.user, attachment.feedback):
        raise Http404
    path = path_of(attachment)
    if not default_storage.exists(path):
        raise Http404
    if attachment.kind == FeedbackAttachment.Kind.IMAGE:
        response = FileResponse(default_storage.open(path, "rb"), content_type="image/webp")
        response["Content-Disposition"] = f'inline; filename="{attachment.name}"'
    else:
        response = FileResponse(
            default_storage.open(path, "rb"), content_type="text/plain; charset=utf-8"
        )
        response["Content-Disposition"] = f'attachment; filename="{attachment.name}"'
    response["Content-Security-Policy"] = "default-src 'none'; sandbox"
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "private, no-store"
    return response
