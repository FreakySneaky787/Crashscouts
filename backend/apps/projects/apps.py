from django.apps import AppConfig


class ProjectsConfig(AppConfig):
    name = "apps.projects"
    label = "projects"
    verbose_name = "Projects"

    def ready(self) -> None:
        from . import images  # noqa: F401  (deletes image files with their rows)
