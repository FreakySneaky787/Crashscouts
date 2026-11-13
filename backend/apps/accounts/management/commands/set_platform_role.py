"""Sets a platform role from the server (WP 3B.1): creates the first admin and is the emergency
way back in. The account needs a confirmed email address and two-factor authentication."""

from django.core.management.base import BaseCommand, CommandError

from apps.accounts.roles import RoleError, set_role


class Command(BaseCommand):
    help = "Set the platform role of an account: admin, moderator or none."

    def add_arguments(self, parser) -> None:
        parser.add_argument("username")
        parser.add_argument("role", choices=["admin", "moderator", "none"])

    def handle(self, *args, **options):
        role = "" if options["role"] == "none" else options["role"]
        try:
            old, new = set_role(options["username"], role)
        except RoleError as exc:
            raise CommandError(exc.code) from None
        self.stdout.write(f"{options['username']}: {old or 'none'} -> {new or 'none'}")
