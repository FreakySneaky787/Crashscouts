#!/usr/bin/env bash
# Sends one status signal to Healthchecks.io (WP 8.4, ADR 0034, docs/OPERATIONS.md §13).
#
#   scripts/hc-ping.sh CHECK [EXIT_STATUS]
#
# CHECK is the check's slug without the "crashscouts-" prefix (backup, daily, hourly, site, disk).
# Without EXIT_STATUS the script reads systemd's $SERVICE_RESULT and $EXIT_STATUS, so it works as
# `ExecStopPost=` of a job service: 0 reports success, anything else a failure.
#
# The signal is an empty request to https://hc-ping.com/<ping key>/crashscouts-<check>/<status>.
# It never carries a body: Healthchecks.io signs no processing agreement, so no log line or other
# data that could hold personal data is sent (ADR 0034).
#
# Settings (root only, mode 600): /etc/crashscouts/monitoring.env with HC_PING_KEY=<project ping
# key>. Without the file or the key nothing is sent, so a server without monitoring still works.
set -uo pipefail

CONFIG="${CRASHSCOUTS_MONITORING_ENV:-/etc/crashscouts/monitoring.env}"
check="${1:?usage: hc-ping.sh CHECK [EXIT_STATUS]}"
status="${2:-}"

case "$check" in
  *[!a-z0-9-]* | "") echo "hc-ping: invalid check name" >&2; exit 2 ;;
esac
[ -r "$CONFIG" ] || exit 0
key="$(sed -n 's/^HC_PING_KEY=//p' "$CONFIG" | tail -n 1)"
[ -n "$key" ] || exit 0
case "$key" in
  *[!A-Za-z0-9_-]*) echo "hc-ping: HC_PING_KEY has unexpected characters" >&2; exit 2 ;;
esac

if [ -z "$status" ]; then
  case "${SERVICE_RESULT:-}" in
    success) status=0 ;;
    exit-code) status="${EXIT_STATUS:-1}" ;;
    *) status=1 ;;  # signal, timeout, core-dump, ...: a failure without a numeric code
  esac
fi
case "$status" in
  *[!0-9]* | "") status=1 ;;
esac
[ "$status" -le 255 ] || status=1

# The ping key is a credential: keep it out of logs, also on errors.
if ! curl -fsS -o /dev/null -m 10 --retry 3 "https://hc-ping.com/${key}/crashscouts-${check}/${status}" 2>/dev/null; then
  echo "hc-ping: could not reach hc-ping.com for ${check} (status ${status})" >&2
fi
exit 0
