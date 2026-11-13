"""Application questions API (WP 3A.4b). Everyone who sees the campaign reads them (applicants
need them); only the team changes them, and only while the campaign is a draft."""

from django.http import Http404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.api import error_codes

from .models import ApplicationQuestion
from .policies import can_edit
from .questions import TEMPLATES, add_question, add_template, change_question, remove_question
from .serializers import ApplicationQuestionSerializer
from .services import CampaignError
from .views import ErrorSerializer, _campaign, _error


def _team_campaign(request: Request, slug: str, campaign_slug: str):
    campaign = _campaign(request, slug, campaign_slug)
    if not can_edit(request.user, campaign):
        raise PermissionDenied
    return campaign


def _question(campaign, question_id) -> ApplicationQuestion:
    question = ApplicationQuestion.objects.filter(campaign=campaign, pk=question_id).first()
    if question is None:
        raise Http404
    return question


class QuestionsView(APIView):
    permission_classes = (AllowAny,)

    @extend_schema(
        responses=inline_serializer(
            "ApplicationQuestions",
            {
                "questions": ApplicationQuestionSerializer(many=True),
                "templates": serializers.ListField(child=serializers.CharField()),
            },
        )
    )
    def get(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _campaign(request, slug, campaign_slug)
        questions = ApplicationQuestion.objects.filter(campaign=campaign)
        return Response(
            {
                "questions": ApplicationQuestionSerializer(questions, many=True).data,
                "templates": list(TEMPLATES),
            }
        )

    @extend_schema(
        request=ApplicationQuestionSerializer,
        responses={201: ApplicationQuestionSerializer, 400: ErrorSerializer},
    )
    def post(self, request: Request, slug: str, campaign_slug: str) -> Response:
        campaign = _team_campaign(request, slug, campaign_slug)
        serializer = ApplicationQuestionSerializer(data=request.data)
        if not serializer.is_valid():
            return error_codes(serializer)
        try:
            question = add_question(campaign, **serializer.validated_data)
        except CampaignError as exc:
            return _error(exc)
        return Response(
            ApplicationQuestionSerializer(question).data, status=status.HTTP_201_CREATED
        )


class QuestionTemplateView(APIView):
    permission_classes = (AllowAny,)

    @extend_schema(
        request=None, responses={201: ApplicationQuestionSerializer, 400: ErrorSerializer}
    )
    def post(self, request: Request, slug: str, campaign_slug: str, key: str) -> Response:
        campaign = _team_campaign(request, slug, campaign_slug)
        try:
            question = add_template(campaign, key)
        except CampaignError as exc:
            return _error(exc)
        return Response(
            ApplicationQuestionSerializer(question).data, status=status.HTTP_201_CREATED
        )


class QuestionView(APIView):
    permission_classes = (AllowAny,)

    @extend_schema(
        request=ApplicationQuestionSerializer,
        responses={200: ApplicationQuestionSerializer, 400: ErrorSerializer},
    )
    def patch(self, request: Request, slug: str, campaign_slug: str, question_id) -> Response:
        campaign = _team_campaign(request, slug, campaign_slug)
        question = _question(campaign, question_id)
        serializer = ApplicationQuestionSerializer(question, data=request.data, partial=True)
        if not serializer.is_valid():
            return error_codes(serializer)
        try:
            question = change_question(question, **serializer.validated_data)
        except CampaignError as exc:
            return _error(exc)
        return Response(ApplicationQuestionSerializer(question).data)

    @extend_schema(request=None, responses={204: None, 400: ErrorSerializer})
    def delete(self, request: Request, slug: str, campaign_slug: str, question_id) -> Response:
        campaign = _team_campaign(request, slug, campaign_slug)
        try:
            remove_question(_question(campaign, question_id))
        except CampaignError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)
