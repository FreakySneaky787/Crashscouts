"""Initial programming languages (a proposal, editable by staff) and the SPDX licence list."""

from django.db import migrations

LANGUAGES = [
    ("c", "C"),
    ("cpp", "C++"),
    ("csharp", "C#"),
    ("dart", "Dart"),
    ("elixir", "Elixir"),
    ("go", "Go"),
    ("haskell", "Haskell"),
    ("html-css", "HTML and CSS"),
    ("java", "Java"),
    ("javascript", "JavaScript"),
    ("kotlin", "Kotlin"),
    ("lua", "Lua"),
    ("php", "PHP"),
    ("python", "Python"),
    ("r", "R"),
    ("ruby", "Ruby"),
    ("rust", "Rust"),
    ("scala", "Scala"),
    ("shell", "Shell"),
    ("swift", "Swift"),
    ("typescript", "TypeScript"),
    ("zig", "Zig"),
    ("other", "Other"),
]


def seed(apps, schema_editor):
    from apps.catalog.spdx import sync

    language = apps.get_model("catalog", "ProgrammingLanguage")
    for position, (slug, name) in enumerate(LANGUAGES):
        language.objects.update_or_create(slug=slug, defaults={"name": name, "position": position})
    sync(apps.get_model("catalog", "License"))


def unseed(apps, schema_editor):
    apps.get_model("catalog", "ProgrammingLanguage").objects.filter(
        slug__in=[slug for slug, _ in LANGUAGES]
    ).delete()
    apps.get_model("catalog", "License").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [("catalog", "0003_languages_and_licenses")]

    operations = [migrations.RunPython(seed, unseed)]
