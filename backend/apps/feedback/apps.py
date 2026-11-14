from django.apps import AppConfig


class FeedbackConfig(AppConfig):
    name = "apps.feedback"
    label = "feedback"
    verbose_name = "Feedback"

    def ready(self) -> None:
        from . import attachments  # noqa: F401  (deletes files with their rows and accounts)
