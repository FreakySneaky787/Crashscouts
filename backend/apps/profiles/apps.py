from django.apps import AppConfig


class ProfilesConfig(AppConfig):
    name = "apps.profiles"
    label = "profiles"
    verbose_name = "Profiles"

    def ready(self) -> None:
        from . import receivers  # noqa: F401  (creates a profile for every new user)
