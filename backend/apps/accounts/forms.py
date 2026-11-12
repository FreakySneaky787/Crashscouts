"""Extra signup fields (ACCOUNT_SIGNUP_FORM_CLASS); used by the allauth headless signup."""

from django import forms
from django.utils import timezone


class SignupForm(forms.Form):
    age_confirmed = forms.BooleanField(
        required=True,
        error_messages={"required": "You must be at least 16 years old to sign up."},
    )

    def signup(self, request, user) -> None:
        # Only the time of the self-declaration is stored, never a date of birth.
        user.age_confirmed_at = timezone.now()
        user.save(update_fields=["age_confirmed_at"])
