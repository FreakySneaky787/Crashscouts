"""Seeds the software types (WP 6.1, ADR 0025; filter "software type" of master prompt 3.3)."""

from django.db import migrations

SOFTWARE_TYPES = [
    ("desktop-app", "Desktop app"),
    ("mobile-app", "Mobile app"),
    ("web-app", "Web app"),
    ("command-line", "Command-line tool"),
    ("library", "Library or framework"),
    ("game", "Game"),
    ("server", "Server or self-hosted"),
    ("browser-extension", "Browser extension"),
]


def seed(apps, schema_editor):
    model = apps.get_model("catalog", "SoftwareType")
    for position, (slug, name) in enumerate(SOFTWARE_TYPES):
        model.objects.update_or_create(slug=slug, defaults={"name": name, "position": position})


def unseed(apps, schema_editor):
    apps.get_model("catalog", "SoftwareType").objects.filter(
        slug__in=[slug for slug, _ in SOFTWARE_TYPES]
    ).delete()


class Migration(migrations.Migration):
    dependencies = [("catalog", "0005_softwaretype")]

    operations = [migrations.RunPython(seed, unseed)]
