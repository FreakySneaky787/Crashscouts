# Operations: the production server (WP 8.1)

> State: 2026-11-16, **live** at https://crashscouts.org (registration closed). This runbook lets the owner rebuild the server from
> nothing. Every step was run on the real server; results are noted. Commands run on the server
> unless marked "on your computer". Secrets never go into this file, the repository or a chat.

## The server

| | |
|---|---|
| Provider and plan | Infomaniak VPS Lite, Switzerland (owner's decision 2026-11-15, [PHASE-8-PLAN](PHASE-8-PLAN.md)); 12 months paid in advance |
| Name in the Manager | `crashscouts-prod` |
| Size (measured) | 2 vCPU, 3.8 GiB RAM, 59 GB disk, plus a 2 GB swap file |
| System | Debian 13.5 "trixie", kernel 6.12.117 after the first upgrade |
| Login user | `debian` (no root login); address: the IPv4 address shown in the Manager |
| Code | `/opt/crashscouts` (a clone of `main`, owned by `debian`) |

## Access

- **SSH with keys only.** Password and keyboard-interactive login and root login are off.
- **One key per device, each with a passphrase.** The key is created on the owner's own computer,
  never on a work computer or by the provider. Only the public part (`.pub`) leaves the computer.
  A further device gets its own key, added to `~/.ssh/authorized_keys` on the server.
- **Password of `debian`:** only for the VNC console in the Manager (emergency access, as
  [Infomaniak recommends](https://www.infomaniak.com/en/support/faq/1973/connect-via-ssh-first-connection-to-cloud-vps-vps-lite-linux));
  kept in the owner's password manager.
- **GitHub:** the server reads the private repository with a **deploy key** (read-only, this
  repository only, title `crashscouts-prod`). Not needed any more once the repository is public
  (WP 8.7); then remove the key in GitHub.

## 1. Create the server (Infomaniak Manager)

1. On your computer: `ssh-keygen -t ed25519 -C "crashscouts-vps" -f ~/.ssh/crashscouts_vps` (with
   a passphrase).
2. Order VPS Lite: Linux, Debian 13, SSH key "Import a key" with the content of
   `~/.ssh/crashscouts_vps.pub`.
3. On your computer: `ssh -i ~/.ssh/crashscouts_vps debian@<IPv4>`. On the first login, `yes`
   stores the server's host key in `~/.ssh/known_hosts`.

## 2. Base set-up

```bash
sudo passwd debian
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y unattended-upgrades apt-listchanges
sudo dpkg-reconfigure -plow unattended-upgrades
```

Automatic security updates follow the [Debian wiki](https://wiki.debian.org/UnattendedUpgrades).

SSH hardening as a drop-in file; `sshd` uses the first value it reads
([sshd_config](https://man.openbsd.org/sshd_config)), and `10-` is read before the others:

```bash
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n' | sudo tee /etc/ssh/sshd_config.d/10-crashscouts.conf
sudo sshd -T | grep -Ei '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin)'
sudo systemctl reload ssh
```

Expected: all three `no`. Test a new login in a second window before closing the first one.

Swap (a buffer while images are built):

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Name resolution for local networks (LLMNR, port 5355) is not needed on a server; switch it off
(security check 2026-11-17):

```bash
sudo mkdir -p /etc/systemd/resolved.conf.d && printf '[Resolve]\nLLMNR=no\nMulticastDNS=no\n' | sudo tee /etc/systemd/resolved.conf.d/10-crashscouts.conf && sudo systemctl restart systemd-resolved
```

Check what listens publicly: `sudo ss -tlnp | grep -v 127.0.0` should show only 22, 80 and 443.

Reboot after a kernel update: `sudo reboot`, then `uname -r`.

## 3. Docker

From Docker's own Debian repository, as in
[Docker: Install on Debian](https://docs.docker.com/engine/install/debian/) (read from Docker's
[docs repository](https://github.com/docker/docs/blob/main/content/manuals/engine/install/debian.md)
on 2026-11-16):

```bash
sudo install -m 0755 -d /etc/apt/keyrings && sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker run --rm hello-world && sudo docker compose version
```

Installed on 2026-11-16: Docker 29.10.0, Compose 5.7.1. Docker is always called with `sudo`;
`debian` is **not** in the `docker` group, which is equivalent to root.

If an installation stops half-way (lost connection): `sudo dpkg --configure -a`, then the same
`apt install` again.

## 4. Code

```bash
sudo apt install -y git && sudo install -d -o debian -g debian /opt/crashscouts
ssh-keygen -t ed25519 -C "crashscouts-prod deploy" -f ~/.ssh/github_deploy -N ""
printf 'Host github.com\n  IdentityFile ~/.ssh/github_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config && chmod 600 ~/.ssh/config
cat ~/.ssh/github_deploy.pub
```

In GitHub: repository → Settings → Deploy keys → Add deploy key, title `crashscouts-prod`,
**without** write access ([GitHub: deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys#deploy-keys)).
The deploy key has no passphrase so that updates need nobody at the keyboard; it can only read
this one repository.

Before the first clone, compare GitHub's host key with the fingerprint GitHub publishes over HTTPS:

```bash
curl -s https://api.github.com/meta | grep -A4 ssh_key_fingerprints
git clone git@github.com:FreakySneaky787/Crashscouts.git /opt/crashscouts
```

Answer `yes` only if the ED25519 fingerprint git shows equals `SHA256_ED25519` (checked
2026-11-16: it did).

## 5. Load test before going live

`scripts/server-loadtest.sh` runs the whole production stack as `localhost` under its own Compose
project, with Caddy bound to 127.0.0.1 (nothing reachable from outside), throwaway secrets and
generated data. It runs Locust with 20 users for 5 minutes in a container, prints the result and
the memory peak, and then deletes the test stack, its data and the frontend image built for
`localhost`. It refuses to run while the real project `crashscouts` exists.

```bash
cd /opt/crashscouts && git pull && sudo scripts/server-loadtest.sh
```

The result goes into [PERFORMANCE.md](PERFORMANCE.md). First run on 2026-11-16: 1,957 requests, 0
failures, p95 330 ms. Building the images took a few minutes; run it inside `tmux`
(`tmux new -s lasttest`, after a lost connection `tmux attach -t lasttest`).

## 6. Settings (`.env.prod`)

Created on the server from the template; the secrets are generated there and never shown:

```bash
cd /opt/crashscouts && umask 077 && cp .env.prod.example .env.prod
sed -i "s|^DJANGO_SECRET_KEY=.*|DJANGO_SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')|; s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')|" .env.prod
nano .env.prod
```

Values set by hand (2026-11-16):

| Setting | Value | Why |
|---|---|---|
| `DJANGO_EMAIL_HOST` / `_PORT` / `_USE_TLS` | `mailpit` / `1025` / `false` | no mail leaves the server until WP 8.2; the mail catcher (profile `local`) is reachable only inside Docker and on 127.0.0.1 |
| `DJANGO_DEFAULT_FROM_EMAIL` | `Crashscouts <no-reply@crashscouts.org>` | |
| `DJANGO_SIGNUP_ENABLED` | `false` | owner's decision 2026-11-16: public site, registration closed until the beta starts; this also closes sign-up via GitHub (the social adapter asks the account adapter) |
| `OPERATOR_NAME`, `OPERATOR_ADDRESS` | typed in by the owner | imprint and privacy policy (ADR 0031) |
| `CONTACT_EMAIL` | `contact@crashscouts.org` | the Infomaniak mailbox |
| `LEGAL_TEXTS_REVIEWED` | `false` | the legal pages say "draft" until the professional review |
| `SOURCE_CODE_URL` | empty | until the repository is public (WP 8.7) |

Check without showing values: `grep -cE '^(DJANGO_SECRET_KEY|POSTGRES_PASSWORD|OPERATOR_NAME|OPERATOR_ADDRESS)=.+' .env.prod`
gives `4`; `ls -l .env.prod` shows `-rw-------`.

## 7. Firewall, DNS and first start

1. Firewall in the Manager
   ([Infomaniak](https://www.infomaniak.com/en/support/faq/2822/manage-vps-cloud-vps-lite-firewall)):
   the default rules open SSH (22) and ICMP; added: **TCP 80 and 443**. A firewall on the server
   itself (ufw) would not help: Docker bypasses its rules for published ports
   ([Docker](https://docs.docker.com/engine/network/packet-filtering-firewalls/)).
2. DNS zone of `crashscouts.org` (Manager → Web & Domains → crashscouts.org → DNS zone): one new
   **A record** for `crashscouts.org` → the server's IPv4 address. Before, the domain had no A or
   AAAA record and `www` did not exist. The mail records (MX `mta-gw.infomaniak.ch`, the SRV
   records, DMARC) stay untouched. Check: `host -t A crashscouts.org`.
3. Start only once DNS answers (otherwise Caddy's certificate request fails):

   ```bash
   cd /opt/crashscouts && sudo docker compose -f compose.prod.yaml --env-file .env.prod --profile local up -d --build --wait
   sudo docker compose -f compose.prod.yaml --env-file .env.prod --profile local exec -T backend python manage.py migrate --noinput
   ```

Checked on 2026-11-16 from the server over the internet:

- `/`, `/discover`, `/signup`, `/privacy`, `/imprint`: 200; `/admin/`, `/api/`, `/_allauth/`,
  `/media/…`: 404;
- `http://` answers 308 to `https://`; headers `Strict-Transport-Security`,
  `Content-Security-Policy` (with nonce), `Referrer-Policy: same-origin`,
  `X-Content-Type-Options: nosniff`;
- certificate from Let's Encrypt (valid to 2027-02-14; Caddy renews it automatically);
- the sign-up page says registration is closed; the imprint shows the operator and "draft".

The automated smoke tests (`e2e/smoke/`) are **not** run against the real site: they create
accounts. They run in CI against the same stack on `localhost`.

## 8. Scheduled jobs

systemd timers on the host run the management commands in the backend container
(ARCHITECTURE.md §10), the backup and the monitoring. Every job reports its result to
Healthchecks.io (§13):

| Timer | When | Commands |
|---|---|---|
| `crashscouts-hourly.timer` | every hour | `purge_rate_limit_cache` (ADR 0022) |
| `crashscouts-daily.timer` | 02:30 UTC | `purge_deleted_accounts` (ADR 0013), `purge_application_answers` (ADR 0016) |
| `crashscouts-backup.timer` | 03:15 UTC | `scripts/backup.sh` (§10) |
| `crashscouts-monitor.timer` | every 5 minutes | `scripts/monitor.sh` (§13) |

```bash
cd /opt/crashscouts && sudo cp deploy/systemd/crashscouts-* /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now crashscouts-hourly.timer crashscouts-daily.timer
sudo systemctl start crashscouts-hourly.service crashscouts-daily.service && journalctl -u 'crashscouts-*' -n 10 --no-pager
systemctl list-timers 'crashscouts-*'
```

`Persistent=true` catches up on a run that was missed while the server was off. Checked on
2026-11-16: both services finished successfully when started by hand (3 expired rate-limit
entries deleted, nothing else to delete).

## 9. Updates

```bash
cd /opt/crashscouts && scripts/deploy.sh
```

Run as `debian`, without sudo (git needs the deploy key). The script pulls `main`, builds the
images, migrates the database with the new backend image, replaces the containers and sends
warm-up requests once the SSR server answers. Tested locally on 2026-11-16: `up --wait` returns
before the SSR server listens (Caddy answered 502 for about a second), so the script waits for a
200 first.

After a change to `deploy/systemd/`, copy the units again (§8).

## 10. Backups (WP 8.3, ADR 0033)

restic sends an encrypted copy of the database and of the uploaded files to **Infomaniak Swiss
Backup** every night at 03:15 UTC, after the deletion jobs. It keeps **7 days** (owner's decisions
2026-11-16).

Setting up (once):

1. Manager → Swiss Backup: order the smallest **cloud backup** (not Acronis), add a device
   `crashscouts-prod` with the **Swift** protocol (Infomaniak documents restic with Swift:
   [Getting Started Guide](https://www.infomaniak.com/en/support/faq/2543/getting-started-guide-swiss-backup-cloud-backup)).
   The device password goes into the password manager.
2. On the server, the storage settings and a new restic password, readable by root only:

   ```bash
   sudo install -d -m 700 /etc/crashscouts
   sudo install -m 600 /dev/null /etc/crashscouts/backup.env
   sudo sh -c 'head -c 32 /dev/urandom | base64 > /etc/crashscouts/restic-password' && sudo chmod 600 /etc/crashscouts/restic-password
   sudo nano /etc/crashscouts/backup.env
   ```

   `backup.env` holds `RESTIC_REPOSITORY` and the device's credentials as restic environment
   variables (for Swift the `OS_*` values Infomaniak shows for the device). Copy the restic
   password (`sudo cat /etc/crashscouts/restic-password`) into the password manager: **without it
   the backups cannot be read.**
3. Create the repository, run the first backup and the restore test, then switch on the timer:

   ```bash
   cd /opt/crashscouts && sudo scripts/backup.sh init && sudo scripts/backup.sh && sudo scripts/backup-restore-test.sh
   sudo cp deploy/systemd/crashscouts-backup.* /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now crashscouts-backup.timer
   ```

Checks:

- `sudo scripts/backup.sh snapshots` lists the snapshots;
- `cat /var/lib/crashscouts/last-backup` shows the time of the last success;
- `journalctl -u crashscouts-backup.service -n 30` shows the last run.

Run the restore test after changes to the backup and at least once a month.

Set up on the server on 2026-11-16: Swiss Backup 200 GB with one Swift device
(`swift:crashscouts-backup:/restic`, Keystone v3, cluster `swiss-backup02`). The first backup and
the restore test passed (57 of 57 tables; the live database was still empty), and the timer is
enabled.

Tested locally on 2026-11-16 against a restic REST server in place of Swiss Backup:

- backup, `check` and the restore test passed (57 of 57 tables, users 1 of 1, one uploaded file);
- two deliberately broken backups were caught:
  - a dump without data (`--schema-only`) failed with "a main table is empty in the backup";
  - a dump without the feedback table failed in `pg_restore`.

## 11. Emergency restore onto a new server

Not yet rehearsed on a second server; the database part is the same as in the restore test.

1. Set up a server as in §1–4 and copy `.env.prod` (from the password manager) to
   `/opt/crashscouts/.env.prod`; set up `/etc/crashscouts` as in §10 step 2, with the **existing**
   restic password and device credentials.
2. Start only the database and restore the latest snapshot into a temporary folder:

   ```bash
   cd /opt/crashscouts && C="sudo docker compose -f compose.prod.yaml --env-file .env.prod --profile local"
   $C up -d db --wait
   R=$(sed -n 's/^RESTIC_IMAGE=//p' scripts/backup.sh); T=$(sudo mktemp -d)
   sudo docker run --rm --env-file /etc/crashscouts/backup.env -e RESTIC_PASSWORD_FILE=/p -v /etc/crashscouts/restic-password:/p:ro -v "$T:/restore" "$R" restore latest --tag nightly --target /restore
   ```

3. Load the database and the uploaded files:

   ```bash
   sudo cat "$T/backup/db/crashscouts.dump" | $C exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error'
   sudo docker run --rm --entrypoint sh -v crashscouts_media:/m -v "$T/backup/media:/src:ro" "$R" -c 'cp -a /src/. /m/'
   sudo rm -rf "$T"
   ```

4. Start everything (`$C up -d --build --wait`), point DNS to the new address if it changed (§7),
   install the timers (§8, §10) and check the site as in §7.

## 12. Email (WP 8.2)

Outgoing mail (sign-up confirmation, password reset, notifications) goes through **Scaleway
Transactional Email** (question F): `smtp.tem.scaleway.com`, port 587 with STARTTLS; the login
is the Scaleway project ID and an API secret key that may only send email
([Scaleway SMTP](https://www.scaleway.com/en/docs/transactional-email/reference-content/smtp-configuration/),
[API keys](https://www.scaleway.com/en/docs/transactional-email/how-to/generate-api-keys-for-tem-with-iam/)).
The first 300 emails per month are free
([pricing](https://www.scaleway.com/en/pricing/managed-services/)).

DNS records in the Infomaniak zone
([Scaleway: authenticate a domain](https://www.scaleway.com/en/docs/transactional-email/how-to/authenticate-domain/)):

- **SPF:** add `include:_spf.tem.scaleway.com` to the existing `v=spf1` record. A domain may
  have only one SPF record.
- **DKIM:** a TXT record with the name and value the Scaleway console shows.
- **MX stays at Infomaniak** (the `contact@` mailbox); Scaleway's MX suggestion is not used.
- **DMARC** (`p=reject`, set by Infomaniak) stays. Mail from Scaleway passes it through the
  DKIM signature for `crashscouts.org`.

`.env.prod`: `DJANGO_EMAIL_HOST=smtp.tem.scaleway.com`, `DJANGO_EMAIL_PORT=587`,
`DJANGO_EMAIL_USE_TLS=true`, `DJANGO_EMAIL_HOST_USER=<project ID>`,
`DJANGO_EMAIL_HOST_PASSWORD=<API secret key>`. `scripts/deploy.sh` starts the mail catcher only
while `DJANGO_EMAIL_HOST=mailpit`; after switching, remove it once with
`sudo docker compose -f compose.prod.yaml --env-file .env.prod --profile local rm -sf mailpit`.

Test: `sudo docker compose -f compose.prod.yaml --env-file .env.prod exec -T backend python manage.py sendtestemail contact@crashscouts.org`,
then check the message source in the Infomaniak webmail for `spf=pass`, `dkim=pass` and
`dmarc=pass`.

Set up on 2026-11-16:

- Scaleway Transactional Email, plan Essential, domain `crashscouts.org` verified (SPF, DKIM,
  DMARC valid). The MX record stays at Infomaniak only (`host -t MX crashscouts.org`).
- IAM application `crashscouts-smtp` with policy `crashscouts-smtp-only`, scope the project
  "Crashscouts", permission set **`TransactionalEmailEmailFullAccess`**.
  - It was widened from `TransactionalEmailEmailSmtpCreate` while searching for the fault.
  - The owner decided on 2026-11-16 to keep it ("never change a running system").
  - Accepted risk: with the key on the server, someone could also send email through the API
    and read the sending log, which holds recipient addresses. They could not manage domains or
    other Scaleway services. Its API key **expires on
  2027-11-16**; before that, generate a new key for the application, put its secret into
  `.env.prod` and run `scripts/deploy.sh`.
- **Pitfall:** the SMTP username is the **Project ID** (Project settings; it is also the DKIM
  selector name), not the other ID shown on the domain page. With the wrong ID, SMTP answered
  `535 5.7.8 Permission denied` and the API `insufficient permissions`. A direct API call shows
  the reason faster than SMTP:
  `curl -s -X POST https://api.scaleway.com/transactional-email/v1alpha1/regions/fr-par/emails -H "X-Auth-Token: <secret>" …`
  (needs the API permission set, not only SMTP).
- The test email from `no-reply@crashscouts.org` arrived in the inbox of `contact@` (not in
  spam), with DMARC at `p=reject`.

Found while preparing this: `compose.prod.yaml` did not pass `DJANGO_EMAIL_HOST_USER` and
`DJANGO_EMAIL_HOST_PASSWORD` to Django, so a provider that needs a login would have refused
every email. Fixed, with a test that fails without the fix.

## 13. Monitoring and logs (WP 8.4, ADR 0034)

Healthchecks.io emails the owner when a signal is missing or reports a failure. Server errors of
Django are emailed without request data. Logs are kept for 7 days.

> **Set up on the server on 2026-11-17** (§13.2–13.4); every alarm was triggered and its email
> arrived. Open: the check of the 7-day deletion after 8 days (§13.3).

| Check (slug) | Period | Grace | Sent by |
|---|---|---|---|
| `crashscouts-site` | 5 minutes | 10 minutes | `crashscouts-monitor.timer` (`/discover` answers 200) |
| `crashscouts-disk` | 5 minutes | 10 minutes | `crashscouts-monitor.timer` (less than 80 % used) |
| `crashscouts-hourly` | 1 hour | 30 minutes | `crashscouts-hourly.service` |
| `crashscouts-daily` | 1 day | 2 hours | `crashscouts-daily.service` |
| `crashscouts-backup` | 1 day | 2 hours | `crashscouts-backup.service` |

### 13.1 Healthchecks.io (any device)

1. Sign up at [healthchecks.io](https://healthchecks.io/) with the owner's address (free plan
   "Hobbyist"), with two-factor sign-in.
2. Create a project "Crashscouts". Create the five checks of the table:
   - set the **slug** exactly as shown;
   - choose "Simple" schedule with the period and grace from the table;
   - pitfalls seen on 2026-11-17: a check created without its slug (the signal answers
     `not found`, HTTP 404), and a period set to days instead of minutes. Compare the list with
     the table before going on.
3. Email notifications to the sign-up address are on by default; check under "Integrations".
4. Confirm the email address of the email integration **before** the alarm test: Healthchecks.io
   skips unconfirmed addresses, and it emails only when a check's status **changes**, so a second
   failure signal while a check is already down sends nothing.
5. Project settings → "Ping key": create it. It is a credential: password manager, never in
   chat or in the repository.

### 13.2 On the server

```bash
cd /opt/crashscouts && scripts/deploy.sh
```

```bash
sudo install -m 600 /dev/null /etc/crashscouts/monitoring.env && sudo nano /etc/crashscouts/monitoring.env
```

One line: `HC_PING_KEY=<the ping key>`. Then the timers (also copies the new `ExecStopPost=`
lines of the job services):

```bash
sudo cp deploy/systemd/crashscouts-* /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now crashscouts-monitor.timer
```

```bash
sudo systemctl start crashscouts-monitor.service crashscouts-hourly.service && journalctl -u crashscouts-monitor -n 5 --no-pager
```

`crashscouts-site`, `crashscouts-disk` and `crashscouts-hourly` turn green on healthchecks.io.

**Error emails:** in `.env.prod`, set `DJANGO_ERROR_MAIL_TO=` to the owner's address, then run
`scripts/deploy.sh`. Test (sends one email "ZeroDivisionError at (no request)"):

```bash
sudo docker compose -f compose.prod.yaml --env-file .env.prod exec -T backend python manage.py shell -c "import logging, sys
try:
    1 / 0
except ZeroDivisionError:
    logging.getLogger('django.request').error('Manual test', exc_info=sys.exc_info())"
```

### 13.3 Logs: 7 days

```bash
sudo test -e /etc/docker/daemon.json && echo "STOP: daemon.json exists, merge by hand"
```

Must print nothing. Then:

```bash
sudo install -m 644 deploy/docker/daemon.json /etc/docker/daemon.json && sudo install -d /etc/systemd/journald.conf.d && sudo install -m 644 deploy/journald/10-crashscouts.conf /etc/systemd/journald.conf.d/
```

```bash
sudo systemctl restart systemd-journald docker && sudo docker compose -f compose.prod.yaml --env-file .env.prod up -d --force-recreate --wait
```

Existing containers keep their old log driver, hence `--force-recreate`. The site is down for
about a minute. Check:

```bash
sudo docker inspect -f '{{.Name}} {{.HostConfig.LogConfig.Type}}' $(sudo docker ps -q)
```

Every line ends in `journald`. Logs are read as before (`docker compose logs`) or with
`journalctl CONTAINER_NAME=crashscouts-proxy-1`. After 8 days, the oldest entry of
`journalctl -o short-iso | head -n 2` must be at most 8 days old (files are rotated daily).

### 13.4 Alarm test (once)

Each alarm must really arrive by email:

```bash
sudo scripts/hc-ping.sh backup 1
```

The email "crashscouts-backup is DOWN" arrives within a minute. Back to up:

```bash
sudo scripts/hc-ping.sh backup 0
```

Site down (about 15 minutes without the site; registration is closed, so nobody is locked out):

```bash
sudo docker compose -f compose.prod.yaml --env-file .env.prod stop frontend
```

Wait for the email "crashscouts-site is DOWN" (at most period plus grace), then:

```bash
sudo docker compose -f compose.prod.yaml --env-file .env.prod start frontend
```

### 13.5 Limits

- The site check runs on the server, so a DNS or firewall fault that only visitors see goes
  unnoticed (ADR 0034).
- Errors of the SSR server are not emailed; they are in the logs and in `crashscouts-site`.
- At most 10 error emails per day; the details are in the logs.
- At most 500 account emails per day (confirmation, password reset), platform-wide. When the
  owner receives "Daily limit for account emails reached", check the sign-ups: a launch wave is
  fine (raise `ACCOUNT_EMAIL_DAILY_LIMIT` in a commit if needed), a flood of fake accounts is not.

## 14. GitHub login and repository verification (open question U)

Production uses its **own** GitHub OAuth app, separate from the development app (owner's decision
2026-11-17): a leaked development secret never touches real logins, users see the name
"Crashscouts" and crashscouts.org on GitHub's consent page, and the app can be revoked without
affecting development.

1. GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**:
   - Application name `Crashscouts`, homepage `https://crashscouts.org`;
   - authorization callback URL `https://crashscouts.org/accounts/github/login/callback/` (with the
     trailing slash), then **Add callback URL**
     `https://crashscouts.org/projects/github/verify/callback` (without);
   - wildcard matching and device flow stay off;
   - generate a client secret; optionally upload `frontend/public/icon-512.png` as the logo.

   An OAuth app on github.com takes up to 10 callback URLs; without wildcard matching a redirect
   must match one exactly (github/docs, `creating-an-oauth-app.md` and `authorizing-oauth-apps.md`,
   "Redirect URLs").
2. On the server, add `DJANGO_GITHUB_CLIENT_ID=` and `DJANGO_GITHUB_CLIENT_SECRET=` with `nano
   .env.prod` (not `echo`, so the secret stays out of the shell history). Check without showing
   values: `grep -cE '^DJANGO_GITHUB_CLIENT_(ID|SECRET)=.+' .env.prod` gives `2`, and
   `grep -cE '^DJANGO_GITHUB_CLIENT_(ID|SECRET)=.*[<>]' .env.prod` gives `0` (no placeholder left;
   GitHub answers a placeholder ID with 404). Then `scripts/deploy.sh`.
3. Test in the browser:
   - signed out, "Sign in with GitHub" with an unlinked GitHub account is refused while
     registration is closed, and no account is created;
   - signed in with email, Settings → Security → **Connect GitHub** links the account;
   - signed out, "Sign in with GitHub" signs in (with the two-factor step if enabled);
   - repository verification through GitHub on a project.

To replace the secret: generate a new one in the app, update `.env.prod`, deploy, then delete the
old secret in GitHub.
