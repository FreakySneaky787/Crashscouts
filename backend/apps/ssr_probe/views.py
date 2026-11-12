from django.db.models import F, QuerySet
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ProbeItem


class ProbeItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProbeItem
        fields = ("id", "title", "description", "is_public", "touch_count")


def visible_items(request: Request) -> QuerySet[ProbeItem]:
    """Central visibility rule: public objects for everyone, private ones for the owner only.

    Invisible objects yield 404 (not 403) so that their existence is not revealed.
    """
    items = ProbeItem.objects.all()
    if request.user.is_authenticated:
        return items.filter(is_public=True) | items.filter(owner=request.user)
    return items.filter(is_public=True)


class ProbeItemDetailView(APIView):
    permission_classes = (AllowAny,)

    @extend_schema(responses=ProbeItemSerializer)
    def get(self, request: Request, pk) -> Response:
        item = get_object_or_404(visible_items(request), pk=pk)
        return Response(ProbeItemSerializer(item).data)


class ProbeItemTouchView(APIView):
    """Write action for the CSRF test: authenticated users only, visible objects only."""

    permission_classes = (IsAuthenticated,)

    @extend_schema(request=None, responses=ProbeItemSerializer)
    def post(self, request: Request, pk) -> Response:
        item = get_object_or_404(visible_items(request), pk=pk)
        ProbeItem.objects.filter(pk=item.pk).update(touch_count=F("touch_count") + 1)
        item.refresh_from_db()
        return Response(ProbeItemSerializer(item).data)
