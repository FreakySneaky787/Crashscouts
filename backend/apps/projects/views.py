from django.db import transaction
from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditEvent
from apps.audit.services import record
from apps.core.api import error_codes
from apps.core.throttling import USER_AND_IP

from .policies import can_delete, can_edit
from .selectors import project_for, projects_of
from .serializers import ProjectSerializer, ProjectWriteSerializer
from .services import LIST_FIELDS, create_project, has_confirmed_email, rename
from .verification import forget as forget_verification


class ProjectCreateView(APIView):
    permission_classes = (IsAuthenticated,)
    throttle_classes = USER_AND_IP
    throttle_scope = "project_create"

    @extend_schema(request=ProjectWriteSerializer, responses={201: ProjectSerializer})
    def post(self, request: Request) -> Response:
        if not has_confirmed_email(request.user):
            return Response({"detail": "email_unconfirmed"}, status=status.HTTP_403_FORBIDDEN)
        serializer = ProjectWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return error_codes(serializer)
        project = create_project(request.user, **serializer.validated_data)
        return Response(
            ProjectSerializer(project, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class ProjectDetailView(APIView):
    """GET for everyone allowed to see the project; PATCH for its team; DELETE for its owner.
    Unknown and private-to-others projects are a plain 404."""

    permission_classes = (AllowAny,)

    def get_object(self, request: Request, slug: str):
        project = project_for(request.user, slug)
        if project is None:
            raise Http404
        return project

    @extend_schema(responses=ProjectSerializer)
    def get(self, request: Request, slug: str) -> Response:
        project = self.get_object(request, slug)
        # The response always carries the current slug; the SSR page redirects former names.
        return Response(ProjectSerializer(project, context={"request": request}).data)

    @extend_schema(request=ProjectWriteSerializer, responses=ProjectSerializer)
    def patch(self, request: Request, slug: str) -> Response:
        project = self.get_object(request, slug)
        if not can_edit(request.user, project):
            raise PermissionDenied  # visible (public) but not part of the team
        if project.blocked_at is not None:
            return Response({"code": "blocked"}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ProjectWriteSerializer(project, data=request.data, partial=True)
        if not serializer.is_valid():
            return error_codes(serializer)
        data = dict(serializer.validated_data)
        new_slug = data.pop("slug", project.slug)
        old_visibility = project.visibility
        old_repository_url = project.repository_url
        with transaction.atomic():
            for key in LIST_FIELDS:
                if key in data:
                    getattr(project, key).set(data.pop(key))
            for key, value in data.items():
                setattr(project, key, value)
            project.save()
            rename(project, new_slug)
            if project.repository_url != old_repository_url:
                forget_verification(project)  # a proof never carries over to another link
            if project.visibility != old_visibility:
                record(
                    AuditEvent.Kind.PROJECT_VISIBILITY_CHANGED,
                    actor=request.user,
                    data={"project": str(project.pk), "visibility": project.visibility},
                )
        return Response(ProjectSerializer(project, context={"request": request}).data)

    @extend_schema(request=None, responses={204: None})
    def delete(self, request: Request, slug: str) -> Response:
        project = self.get_object(request, slug)
        if not can_delete(request.user, project):
            raise PermissionDenied  # only the owner deletes
        record(
            AuditEvent.Kind.PROJECT_DELETED,
            actor=request.user,
            data={"project": str(project.pk), "reason": "owner_request"},
        )
        project.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyProjectsView(APIView):
    permission_classes = (IsAuthenticated,)

    @extend_schema(responses=ProjectSerializer(many=True))
    def get(self, request: Request) -> Response:
        projects = projects_of(request.user)
        return Response(ProjectSerializer(projects, many=True, context={"request": request}).data)
