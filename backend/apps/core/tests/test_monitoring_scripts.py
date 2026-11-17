"""The monitoring scripts (WP 8.4, ADR 0034) run with fake `curl` and `df` on the PATH, so no
signal leaves this machine."""

import os
import secrets
import subprocess
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[4] / "scripts"

FAKE_CURL = """#!/bin/sh
for arg in "$@"; do
  case "$arg" in
    https://hc-ping.com/*) echo "$arg" >> "$PING_LOG"; exit "${FAKE_PING_EXIT:-0}" ;;
  esac
done
printf '%s' "${FAKE_SITE_CODE:-200}"
"""
FAKE_DF = """#!/bin/sh
printf 'Use%%\\n %s%%\\n' "${FAKE_DISK_USED:-40}"
"""


@pytest.fixture
def sandbox(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in (("curl", FAKE_CURL), ("df", FAKE_DF)):
        (bin_dir / name).write_text(body)
        (bin_dir / name).chmod(0o755)
    key = secrets.token_urlsafe(16)
    config = tmp_path / "monitoring.env"
    config.write_text(f"HC_PING_KEY={key}\n")
    env_file = tmp_path / ".env.prod"
    env_file.write_text("PUBLIC_HOST=example.invalid\n")
    log = tmp_path / "pings.log"
    env = {
        "PATH": f"{bin_dir}:{os.environ['PATH']}",
        "PING_LOG": str(log),
        "CRASHSCOUTS_MONITORING_ENV": str(config),
        "CRASHSCOUTS_ENV_FILE": str(env_file),
    }

    def run(script: str, *args: str, **extra: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [str(SCRIPTS / script), *args],
            env={**env, **extra},
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )

    def pings() -> list[str]:
        return log.read_text().splitlines() if log.exists() else []

    return run, pings, key, config


def test_a_job_that_succeeded_reports_status_zero(sandbox):
    run, pings, key, _ = sandbox

    result = run("hc-ping.sh", "backup", SERVICE_RESULT="success", EXIT_STATUS="0")

    assert result.returncode == 0, result.stderr
    assert pings() == [f"https://hc-ping.com/{key}/crashscouts-backup/0"]


@pytest.mark.parametrize(
    ("service_result", "exit_status", "expected"),
    [("exit-code", "3", "3"), ("signal", "TERM", "1"), ("timeout", "", "1")],
)
def test_a_failed_job_reports_a_failure(sandbox, service_result, exit_status, expected):
    run, pings, key, _ = sandbox

    run("hc-ping.sh", "daily", SERVICE_RESULT=service_result, EXIT_STATUS=exit_status)

    assert pings() == [f"https://hc-ping.com/{key}/crashscouts-daily/{expected}"]


def test_without_a_ping_key_nothing_is_sent(sandbox):
    run, pings, _, config = sandbox
    config.unlink()

    assert run("hc-ping.sh", "hourly", "0").returncode == 0
    assert pings() == []


def test_the_ping_key_never_appears_in_the_output(sandbox):
    run, _, key, _ = sandbox

    result = run("hc-ping.sh", "backup", "0", FAKE_PING_EXIT="7")

    assert result.returncode == 0  # an unreachable service must not fail the job
    assert "could not reach" in result.stderr
    assert key not in result.stdout + result.stderr


def test_an_invalid_check_name_is_refused(sandbox):
    run, pings, _, _ = sandbox

    assert run("hc-ping.sh", "../backup", "0").returncode == 2
    assert pings() == []


def test_monitor_reports_a_healthy_server(sandbox):
    run, pings, key, _ = sandbox

    result = run("monitor.sh")

    assert result.returncode == 0, result.stderr
    assert pings() == [
        f"https://hc-ping.com/{key}/crashscouts-site/0",
        f"https://hc-ping.com/{key}/crashscouts-disk/0",
    ]


def test_monitor_reports_a_site_error_and_a_full_disk(sandbox):
    run, pings, key, _ = sandbox

    run("monitor.sh", FAKE_SITE_CODE="502", FAKE_DISK_USED="85")

    assert pings() == [
        f"https://hc-ping.com/{key}/crashscouts-site/1",
        f"https://hc-ping.com/{key}/crashscouts-disk/1",
    ]


DEPLOY = SCRIPTS.parent / "deploy"


@pytest.mark.parametrize("job", ["backup", "daily", "hourly"])
def test_every_job_reports_its_result(job):
    unit = (DEPLOY / "systemd" / f"crashscouts-{job}.service").read_text()

    assert f"ExecStopPost=/opt/crashscouts/scripts/hc-ping.sh {job}\n" in unit


def test_logs_are_kept_for_seven_days():
    # Owner's decision 2026-11-17; the privacy policy states the same period.
    journald = (DEPLOY / "journald" / "10-crashscouts.conf").read_text()
    privacy = (SCRIPTS.parent / "frontend" / "app" / "legal" / "privacy.md").read_text()

    assert "\nMaxRetentionSec=7day\n" in journald
    assert "\nMaxFileSec=1day\n" in journald
    assert '"log-driver": "journald"' in (DEPLOY / "docker" / "daemon.json").read_text()
    assert "server logs" in privacy
    assert "7 days" in privacy
