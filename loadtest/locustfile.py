"""Load test of the production-like stack (WP 8.6, docs/PERFORMANCE.md).

Three kinds of users, as the owner's beta target describes (20 concurrent users):
- visitors read the home page, Discover (with and without search), projects, campaigns and
  profiles;
- testers sign in once and then read their account page and campaigns;
- team members sign in once and then open their projects' feedback inbox.

Public pages come from ``manage.py seed_load_data --targets`` and logins from its
``--credentials`` file (both generated, never committed). Run: see docs/PERFORMANCE.md.
"""

# Random choices pick test pages, not secrets: the standard generator is intended here.
# ruff: noqa: S311

import json
import os
import random
import re
from pathlib import Path

from locust import HttpUser, between, task

TARGETS = json.loads(Path(os.environ.get("TARGETS", "targets.json")).read_text())
LOGINS = json.loads(Path(os.environ["LOGINS"]).read_text())
CAMPAIGN = "/p/[project]/c/[campaign]"
WORDS = ["sync", "garden", "map", "chess", "audio", "photo", "budget", "pixel"]
BASE = os.environ.get("BASE_URL", "https://localhost")
CSRF = re.compile(r'name="csrf_token" value="([^"]+)"')


class Visitor(HttpUser):
    weight = 5
    wait_time = between(1, 4)

    def on_start(self):
        self.client.verify = False  # Caddy's local CA (local test stack only)

    @task(2)
    def home(self):
        self.client.get("/", name="/")

    @task(4)
    def discover(self):
        self.client.get("/discover", name="/discover")

    @task(3)
    def search(self):
        self.client.get(f"/discover?q={random.choice(WORDS)}", name="/discover?q=…")

    @task(3)
    def project(self):
        self.client.get(f"/p/{random.choice(TARGETS['projects'])}", name="/p/[project]")

    @task(3)
    def campaign(self):
        self.client.get(f"/p/{random.choice(TARGETS['campaigns'])}", name=CAMPAIGN)

    @task(1)
    def profile(self):
        self.client.get(f"/u/{random.choice(TARGETS['profiles'])}", name="/u/[username]")


class SignedIn(HttpUser):
    abstract = True
    wait_time = between(2, 5)

    def on_start(self):
        self.client.verify = False
        login = LOGINS[random.randrange(len(LOGINS))]
        page = self.client.get("/login", name="/login")
        token = CSRF.search(page.text).group(1)
        self.client.post(
            "/login",
            data={"csrf_token": token, "email": login["email"], "password": login["password"]},
            # Django checks the origin of HTTPS form posts (CSRF), like a browser sends it.
            headers={"Origin": BASE, "Referer": f"{BASE}/login"},
            name="/login (POST)",
        )
        account = self.client.get("/account", name="/account").text
        self.own_projects = sorted(set(re.findall(r'href="/p/(load-p\d+)"', account)))


class Tester(SignedIn):
    weight = 3

    @task(3)
    def account(self):
        self.client.get("/account", name="/account")

    @task(2)
    def campaign(self):
        self.client.get(f"/p/{random.choice(TARGETS['campaigns'])}", name=CAMPAIGN)

    @task(1)
    def discover(self):
        self.client.get("/discover", name="/discover")


class TeamMember(SignedIn):
    weight = 2

    def on_start(self):
        super().on_start()
        # Inboxes of the member's own campaigns: only the team may open them (404 for others).
        self.inboxes = []
        for slug in self.own_projects:
            page = self.client.get(f"/p/{slug}", name="/p/[project] (team)").text
            found = re.findall(rf'href="/p/{slug}/c/(load-c\d+)"', page)
            self.inboxes += [f"{slug}/c/{campaign}" for campaign in sorted(set(found))]

    @task(2)
    def project(self):
        slug = random.choice(self.own_projects or TARGETS["projects"])
        self.client.get(f"/p/{slug}", name="/p/[project] (team)")

    @task(2)
    def inbox(self):
        if not self.inboxes:
            return
        path = random.choice(self.inboxes)
        self.client.get(f"/p/{path}/feedback", name="/p/[project]/c/[campaign]/feedback")

    @task(1)
    def account(self):
        self.client.get("/account", name="/account")
