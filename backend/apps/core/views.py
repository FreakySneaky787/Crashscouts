import logging

from django.db import DatabaseError, connection
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


class HealthView(APIView):
    """Betriebsstatus inklusive Datenbankverbindung.

    Gibt bewusst keine Fehlerdetails, Versionen oder Hostnamen preis.
    """

    permission_classes = (AllowAny,)
    authentication_classes = ()

    @extend_schema(
        responses={
            200: inline_serializer(
                name="Health",
                fields={
                    "status": serializers.CharField(),
                    "checks": serializers.DictField(child=serializers.CharField()),
                },
            )
        }
    )
    def get(self, request: Request) -> Response:
        database_ok = True
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except DatabaseError:
            database_ok = False
            logger.exception("Health check: database unavailable")

        healthy = database_ok
        response = Response(
            {
                "status": "ok" if healthy else "error",
                "checks": {"database": "ok" if database_ok else "error"},
            },
            status=200 if healthy else 503,
        )
        response["Cache-Control"] = "no-store"
        return response
