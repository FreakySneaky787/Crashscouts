from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.storage import default_storage
from django.db import transaction
from django.http import FileResponse, Http404, HttpRequest
from django.views.decorators.http import require_safe
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.throttling import USER_AND_IP

from .avatars import MAX_BYTES, avatar_path, delete_avatar, process_avatar, store_avatar
from .selectors import profile_for, visible_profiles
from .serializers import OwnProfileSerializer, PublicProfileSerializer

# Whole multipart request: the image plus a little form overhead.
MAX_UPLOAD_REQUEST_BYTES = MAX_BYTES + 64 * 1024


class PublicProfileView(APIView):
    """A public profile. Unknown, unconfirmed and deactivated accounts are all a plain 404."""

    permission_classes = (AllowAny,)
    authentication_classes = ()

    @extend_schema(responses=PublicProfileSerializer)
    def get(self, request: Request, username: str) -> Response:
        profile = visible_profiles().filter(user__username=username.lower()).first()
        if profile is None:
            raise Http404
        return Response(PublicProfileSerializer(profile).data)


class OwnProfileView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(responses=OwnProfileSerializer)
    def get(self, request: Request) -> Response:
        return Response(OwnProfileSerializer(profile_for(request.user)).data)

    @extend_schema(request=OwnProfileSerializer, responses=OwnProfileSerializer)
    def patch(self, request: Request) -> Response:
        serializer = OwnProfileSerializer(
            profile_for(request.user), data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class OwnAvatarView(APIView):
    permission_classes = (IsAuthenticated,)
    parser_classes = (MultiPartParser,)
    throttle_classes = USER_AND_IP
    throttle_scope = "avatar_upload"

    @extend_schema(
        request={
            "multipart/form-data": inline_serializer(
                "AvatarUpload", {"avatar": serializers.ImageField()}
            )
        },
        responses=OwnProfileSerializer,
    )
    def put(self, request: Request) -> Response:
        # Refuse oversized requests before the body is parsed.
        try:
            length = int(request.META.get("CONTENT_LENGTH") or 0)
        except ValueError:
            length = 0
        if length > MAX_UPLOAD_REQUEST_BYTES:
            return Response(
                {"avatar": ["Upload a PNG, JPEG or WebP image of at most 2 MB."]},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        upload = request.FILES.get("avatar")
        if upload is None:
            return Response({"avatar": ["No file was submitted."]}, status=400)
        try:
            data = process_avatar(upload)
        except DjangoValidationError as exc:
            return Response({"avatar": exc.messages}, status=400)

        profile = profile_for(request.user)
        old_key = profile.avatar_key
        profile.avatar_key = store_avatar(data)
        profile.save(update_fields=["avatar_key", "updated_at"])
        transaction.on_commit(lambda: delete_avatar(old_key))
        return Response(OwnProfileSerializer(profile).data)

    @extend_schema(request=None, responses=OwnProfileSerializer)
    def delete(self, request: Request) -> Response:
        profile = profile_for(request.user)
        old_key = profile.avatar_key
        profile.avatar_key = None
        profile.save(update_fields=["avatar_key", "updated_at"])
        transaction.on_commit(lambda: delete_avatar(old_key))
        return Response(OwnProfileSerializer(profile).data)


@require_safe
def avatar_image(request: HttpRequest, key) -> FileResponse:
    """Serves a stored avatar. Only avatars of visible profiles are delivered.

    A plain Django view (not DRF): it returns an image regardless of the Accept header and needs
    no authentication or content negotiation. It is therefore not part of the OpenAPI schema.
    """
    if not visible_profiles().filter(avatar_key=key).exists():
        raise Http404
    path = avatar_path(key)
    if not default_storage.exists(path):
        raise Http404
    response = FileResponse(default_storage.open(path, "rb"), content_type="image/webp")
    response["Content-Disposition"] = 'inline; filename="avatar.webp"'
    # The file is an image only: no scripts, no embedding of other content.
    response["Content-Security-Policy"] = "default-src 'none'; sandbox"
    response["X-Content-Type-Options"] = "nosniff"
    # A new upload gets a new key, so a short public cache is safe.
    response["Cache-Control"] = "public, max-age=3600"
    return response
