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

Two systemd timers on the host run the management commands in the backend container
(ARCHITECTURE.md §10):

| Timer | When | Commands |
|---|---|---|
| `crashscouts-hourly.timer` | every hour | `purge_rate_limit_cache` (ADR 0022) |
| `crashscouts-daily.timer` | 02:30 UTC | `purge_deleted_accounts` (ADR 0013), `purge_application_answers` (ADR 0016) |

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

## Still open

- Email through Scaleway (WP 8.2); then the `local` profile goes.
- Backups (WP 8.3): until then there is no copy of the database; no real user data is on the
  server yet because registration is closed.
- Monitoring (WP 8.4).
