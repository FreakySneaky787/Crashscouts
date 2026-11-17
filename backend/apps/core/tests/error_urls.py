"""URLs for the error-mail tests only: a view that fails with user data in the exception."""

from django.http import HttpResponse
from django.urls import path


def failing_view(request, username):
    # The message quotes user data, as database errors often do.
    raise RuntimeError(f"duplicate key: {request.POST.get('email')} / {username}")


def ok_view(request):
    return HttpResponse("ok")


urlpatterns = [
    path("u/<str:username>/fail/", failing_view),
    path("ok/", ok_view),
]
