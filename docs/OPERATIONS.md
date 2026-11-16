# Operations: the production server (WP 8.1)

> State: 2026-11-16, **set-up in progress**. This runbook lets the owner rebuild the server from
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

The result goes into [PERFORMANCE.md](PERFORMANCE.md).

## Still to do in WP 8.1

- Firewall in the Manager: incoming TCP 22, 80 and 443 only
  ([Infomaniak](https://www.infomaniak.com/en/support/faq/2822/manage-vps-cloud-vps-lite-firewall)).
  A firewall on the server itself (ufw) would not help: Docker bypasses its rules for published
  ports ([Docker](https://docs.docker.com/engine/network/packet-filtering-firewalls/)).
- `.env.prod` on the server (secrets generated there; the operator details typed in by the owner),
  with registration **off** until the beta starts (owner's decision 2026-11-16: the site is public,
  sign-up closed).
- DNS: `crashscouts.org` to the server; the mail records (MX) stay untouched; SPF/DKIM follow in
  WP 8.2.
- Start the stack, warm-up, smoke tests against the domain.
- Scheduled jobs (deletion deadlines, rate-limit purge) as systemd timers.
- Updates: how a new version is deployed.
