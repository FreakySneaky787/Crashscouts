"""Small helpers shared by the API views."""

from rest_framework import serializers, status
from rest_framework.response import Response


def error_codes(serializer: serializers.Serializer) -> Response:
    """400 with machine-readable codes per field, e.g. {"password": ["wrong_password"]}.
    The frontend maps codes to translated texts; backend messages are never shown raw."""
    codes = {
        field: [str(getattr(error, "code", "invalid")) for error in errors]
        for field, errors in serializer.errors.items()
    }
    return Response(codes, status=status.HTTP_400_BAD_REQUEST)
