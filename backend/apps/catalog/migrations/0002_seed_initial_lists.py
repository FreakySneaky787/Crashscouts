"""Initial fixed lists (WP 1.2). A proposal; staff can edit the entries later."""

from django.db import migrations

CATEGORIES = [
    ("developer-tools", "Developer tools"),
    ("productivity", "Productivity"),
    ("communication", "Communication"),
    ("games", "Games"),
    ("graphics-design", "Graphics and design"),
    ("audio-video", "Audio and video"),
    ("education", "Education"),
    ("science", "Science"),
    ("security-privacy", "Security and privacy"),
    ("system-utilities", "System and utilities"),
    ("web-apps", "Web apps"),
    ("mobile-apps", "Mobile apps"),
    ("self-hosting", "Self-hosting and DevOps"),
    ("accessibility", "Accessibility"),
    ("finance", "Finance"),
    ("health", "Health"),
]

PLATFORMS = [
    ("windows", "Windows"),
    ("macos", "macOS"),
    ("linux", "Linux"),
    ("bsd", "BSD"),
    ("chromeos", "ChromeOS"),
    ("android", "Android"),
    ("ios", "iOS and iPadOS"),
    ("web-browser", "Web browser"),
    ("command-line", "Command line"),
]

SKILLS = [
    ("bug-reporting", "Bug reporting"),
    ("exploratory-testing", "Exploratory testing"),
    ("usability-feedback", "Usability feedback"),
    ("accessibility-testing", "Accessibility testing"),
    ("security-testing", "Security testing"),
    ("performance-testing", "Performance testing"),
    ("localization", "Localization and translation"),
    ("documentation-review", "Documentation review"),
    ("api-testing", "API testing"),
    ("test-automation", "Test automation"),
]


def seed(apps, schema_editor):
    for model_name, entries in (
        ("Category", CATEGORIES),
        ("Platform", PLATFORMS),
        ("Skill", SKILLS),
    ):
        model = apps.get_model("catalog", model_name)
        for position, (slug, name) in enumerate(entries):
            model.objects.update_or_create(slug=slug, defaults={"name": name, "position": position})


def unseed(apps, schema_editor):
    for model_name, entries in (
        ("Category", CATEGORIES),
        ("Platform", PLATFORMS),
        ("Skill", SKILLS),
    ):
        apps.get_model("catalog", model_name).objects.filter(
            slug__in=[slug for slug, _ in entries]
        ).delete()


class Migration(migrations.Migration):
    dependencies = [("catalog", "0001_initial")]

    operations = [migrations.RunPython(seed, unseed)]
