from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import CatalogSerializer


class CatalogView(APIView):
    """All fixed lists in one response (small, public, rarely changing)."""

    permission_classes = (AllowAny,)
    authentication_classes = ()

    @extend_schema(responses=CatalogSerializer)
    def get(self, request: Request) -> Response:
        return Response(CatalogSerializer(CatalogSerializer.current()).data)
