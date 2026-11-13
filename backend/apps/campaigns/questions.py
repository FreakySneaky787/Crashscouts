"""Application questions (WP 3A.4b): the per-campaign question builder and its templates."""

from django.db import transaction

from .models import ApplicationQuestion, Campaign
from .services import CampaignError, ensure_unblocked

# Templates offered in the builder (owner's decision: templates, default "short message").
TEMPLATES = {
    "short_message": {
        "prompt": "Short message to the team",
        "kind": ApplicationQuestion.Kind.LONG_TEXT,
        "options": [],
        "required": False,
    },
    "device": {
        "prompt": "Which device and operating system will you test on?",
        "kind": ApplicationQuestion.Kind.SHORT_TEXT,
        "options": [],
        "required": True,
    },
    "experience": {
        "prompt": "How much testing experience do you have?",
        "kind": ApplicationQuestion.Kind.SINGLE_CHOICE,
        "options": ["None yet", "Some", "A lot"],
        "required": False,
    },
    "availability": {
        "prompt": "Are you available during the test period?",
        "kind": ApplicationQuestion.Kind.YES_NO,
        "options": [],
        "required": True,
    },
}
DEFAULT_TEMPLATE = "short_message"


def _ensure_editable(campaign: Campaign) -> None:
    ensure_unblocked(campaign)
    if campaign.state != Campaign.State.DRAFT:
        raise CampaignError("questions_locked")  # applicants must answer what was published
    if campaign.participation != Campaign.Participation.APPROVAL:
        raise CampaignError("no_applications")


@transaction.atomic
def add_question(campaign: Campaign, **fields) -> ApplicationQuestion:
    campaign = Campaign.objects.select_for_update().get(pk=campaign.pk)
    _ensure_editable(campaign)
    count = ApplicationQuestion.objects.filter(campaign=campaign).count()
    if count >= ApplicationQuestion.MAX_PER_CAMPAIGN:
        raise CampaignError("too_many_questions")
    return ApplicationQuestion.objects.create(campaign=campaign, position=count, **fields)


def add_template(campaign: Campaign, key: str) -> ApplicationQuestion:
    template = TEMPLATES.get(key)
    if template is None:
        raise CampaignError("unknown_template")
    return add_question(campaign, **{**template, "options": list(template["options"])})


@transaction.atomic
def change_question(question: ApplicationQuestion, **fields) -> ApplicationQuestion:
    _ensure_editable(question.campaign)
    for key, value in fields.items():
        setattr(question, key, value)
    question.save()
    return question


@transaction.atomic
def remove_question(question: ApplicationQuestion) -> None:
    _ensure_editable(question.campaign)
    question.delete()


def ensure_default_question(campaign: Campaign) -> None:
    """Approval campaigns start with the default template, as long as they have no questions."""
    if (
        campaign.participation == Campaign.Participation.APPROVAL
        and campaign.state == Campaign.State.DRAFT
        and not ApplicationQuestion.objects.filter(campaign=campaign).exists()
    ):
        add_template(campaign, DEFAULT_TEMPLATE)
