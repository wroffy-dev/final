# Deploying to your own server

For a single Linux server — a VPS from Hetzner, DigitalOcean, Contabo, AWS
Lightsail or anywhere else.

Two ways are covered. **[Coolify](#coolify)** is the recommended one: it manages
the build, the reverse proxy, the TLS certificate and the restarts, so the parts
of a server deployment that are easy to get subtly wrong are not yours to get
right. **[Plain Docker Compose](#plain-docker-compose)** at the end is for a
server without Coolify.

The `AZURE_*` repository variables and secrets in
[AZURE-DEPLOYMENT.md](AZURE-DEPLOYMENT.md) belong to the GitHub Actions
pipeline. They have **no meaning on your own server** — do not set them.

---

## Contents

- [What you need](#what-you-need)
- [Generate the secrets](#generate-the-secrets)
- [Coolify](#coolify)
  - [1. Install Coolify](#1-install-coolify)
  - [2. Create the database](#2-create-the-database)
  - [3. Create the application](#3-create-the-application)
  - [4. Set the environment variables](#4-set-the-environment-variables)
  - [5. Add the persistent volumes](#5-add-the-persistent-volumes)
  - [6. Add your domain and deploy](#6-add-your-domain-and-deploy)
  - [7. Create your admin account](#7-create-your-admin-account)
- [Email](#email)
- [Backups](#backups)
- [Upgrading](#upgrading)
- [Troubleshooting](#troubleshooting)
- [Plain Docker Compose](#plain-docker-compose)

---

## What you need

| | |
| --- | --- |
| Server | 2 vCPU / 4 GB RAM is comfortable. Coolify runs alongside the app and builds images on the same machine, so do not size for the app alone — check [Coolify's own requirements](https://coolify.io/docs/installation) |
| Disk | 20 GB or more — the database, the media library and backup archives all live here |
| OS | A current Linux distribution Coolify supports |
| A domain | Pointed at the server's IP with an `A` record **before** you deploy — the TLS certificate cannot be issued otherwise |

---

## Generate the secrets

Run these and keep the output — each is a different value:

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY
openssl rand -base64 32   # MFA_ENCRYPTION_KEY
openssl rand -base64 24   # CRON_SECRET, only if you want scheduled backups
```

Two of these cannot be changed later without losing data:

- **`ENCRYPTION_KEY`** encrypts stored integration secrets, such as the SMTP
  password saved from the admin panel. Change it and those become unreadable.
- **`MFA_ENCRYPTION_KEY`** encrypts two-step verification secrets. Change it and
  everyone enrolled is locked out of their second factor. It must be **at least
  32 characters**; the app refuses to start on a shorter one.

`AUTH_SECRET` only signs sessions — changing it signs everybody out, which is
harmless. It must be at least 16 characters.

Store all of them somewhere that is not the server.

---

## Coolify

### 1. Install Coolify

Follow the installer at [coolify.io](https://coolify.io/docs/installation) on a
fresh server, then open the dashboard and create your admin user.

Point your domain's `A` record at the server now, so the certificate can be
issued when you deploy.

### 2. Create the database

**+ New** → **Database** → **PostgreSQL 16**.

Once it is running, open it and copy the **internal** connection string — the
one using the service name, not `localhost`. That is what the application will
use; the two containers talk over Coolify's own network.

### 3. Create the application

**+ New** → **Public Repository** (or **Private Repository** with your GitHub
app connected) → this repository.

- **Build pack**: `Dockerfile`
- **Port**: `3000`
- **Branch**: `main`

Nothing else needs changing. The image builds on the server; no registry is
involved.

### 4. Set the environment variables

Under the application's **Environment Variables**. All six are required — the
application validates them at startup and **exits** if any is missing, so a
container that will not stay up is almost always this list:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the internal connection string from step 2 |
| `AUTH_SECRET` | from [Generate the secrets](#generate-the-secrets) |
| `ENCRYPTION_KEY` | from the same place |
| `MFA_ENCRYPTION_KEY` | from the same place — at least 32 characters |
| `NEXTAUTH_URL` | `https://yourdomain.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://yourdomain.com` |

> **Both URLs must be `https://`.** The startup check rejects `http://` in
> production. Coolify terminates TLS for you, so this is simply your real
> public address.

> **`NEXT_PUBLIC_SITE_URL` must be your real domain**, not a placeholder. It is
> what canonical URLs and sitemaps are built from, and it is how the application
> recognises its own links: a menu item written as
> `https://yourdomain.com/pricing` is understood as an internal link — and
> carries visitors into the right market — only when this matches. Get it wrong
> and multi-market menus send people back to the root market.
>
> It is read at runtime, not baked into the image, so correcting it is an edit
> and a redeploy. No rebuild of anything else.

Everything else has a working default. Leave `STORAGE_DRIVER` as `local` unless
you have a specific reason to use S3 or R2; `.env.example` documents the rest.

### 5. Add the persistent volumes

**Storages** → **Add**. Both of these, before the first deploy:

| Mount path | Why |
| --- | --- |
| `/data/uploads` | The media library. On the default `local` driver this is production data, and Coolify replaces the image on every deploy — without the volume, every uploaded image is destroyed by the next one |
| `/app/backups` | Backup archives. Keep it even if you later move backups to S3: restores and imports stage archives here before reading them |

The media volume is the one that bites, because nothing appears to be wrong
until someone looks for an older image. Only a deployment using S3 or R2 for
media can skip it.

### 6. Add your domain and deploy

Set the application's **Domain** to `https://yourdomain.com`. Coolify configures
its proxy and requests the certificate on the first request — there is no nginx
or Caddy file to write, and you should not expose port 3000 yourself.

For the health check, Coolify picks up the Dockerfile's own `HEALTHCHECK`. If
you configure one by hand, use `/api/health` (liveness) — or `/api/ready`, which
also verifies migrations have been applied. Both return 503 rather than a
misleading 200 when the database is unreachable.

Deploy. Migrations run automatically before the server accepts traffic
(`RUN_MIGRATIONS` defaults to `true`), retrying while PostgreSQL comes up, so a
first deploy against an empty database is expected to work unattended.

In the deploy logs, look for `server.start`. Two other lines are worth reading:
`migrate.*` tells you whether migrations applied, and `storage.ready` confirms
the media directory is writable — `storage.unusable` or `storage.readonly` means
uploads will fail until the volume's ownership is fixed.

### 7. Create your admin account

The seed runs once, switched on by an environment variable. Add three more:

```
RUN_SEED=true
SEED_ADMIN_EMAIL=you@yourdomain.com
SEED_ADMIN_PASSWORD=<a long password you have not used elsewhere>
```

Redeploy, then check the logs for `seed.done`.

Now **undo it**: set `RUN_SEED=false`, delete both `SEED_ADMIN_*` variables, and
redeploy again. That password belongs to the super admin, and it should not stay
in the dashboard.

Sign in at `https://yourdomain.com/admin`, change the password, and set up
two-step verification from your profile.

---

## Email

Optional. The site runs without it and forms still capture leads; you lose lead
notifications and transactional mail until it is configured.

Two places, and the admin panel wins:

- **Admin → Settings → Email** stores the password encrypted with
  `ENCRYPTION_KEY` and needs no redeploy; or
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` as
  environment variables, which act as the bootstrap fallback.

`MAIL_FROM` becomes required once `SMTP_HOST` is set, or the app refuses to
start.

---

## Backups

Backups are taken from the admin panel out of the box; nothing needs
configuring. Archives are written to the `/app/backups` volume from step 5.

To run them on a schedule, set `CRON_SECRET` (at least 16 characters) and call
the endpoint on a timer — from the server's crontab, or any uptime pinger:

```
POST https://yourdomain.com/api/internal/cron/backup
Authorization: Bearer <CRON_SECRET>
```

Until `CRON_SECRET` is set the endpoint is **off**, not open — it answers 503.
Calling it more often than the schedule is safe: it runs a backup only when one
is actually due, and a global lock refuses a second concurrent run.

An archive contains the database — leads, accounts, password hashes and MFA
secrets. Copy them off the server and treat the copies as the production data
they are. [BACKUP-RESTORE.md](BACKUP-RESTORE.md) covers restores, retention and
off-site storage.

---

## Upgrading

Push to `main` and press **Redeploy** in Coolify, or enable automatic deploys on
the application.

Migrations apply on boot, before traffic is served. The volumes from step 5 are
untouched by a rebuild, which is what makes this safe on a live site.

Take a backup from the admin panel first anyway, particularly across a release
that changes the database.

---

## Troubleshooting

**The container starts and immediately exits.** Read the deploy logs: startup
validation prints every problem at once, naming each variable and what is wrong
with it. No error contains a secret's value, so the output is safe to share.

The usual causes are a missing `MFA_ENCRYPTION_KEY`, one shorter than 32
characters, or `NEXTAUTH_URL` / `NEXT_PUBLIC_SITE_URL` still on `http://`.

**The certificate never arrives.** The domain's `A` record has to resolve to
this server before it can be issued. Check with `dig +short yourdomain.com`, and
make sure ports 80 and 443 reach the server — the challenge runs over 80.

**Uploaded images disappear after a deploy.** The `/data/uploads` volume is not
mounted. See step 5.

**A restore or backup import fails.** The `/app/backups` volume is not mounted;
archives are staged there before they are read.

**Menu links in a non-default market lead back to the root market.** Almost
always `NEXT_PUBLIC_SITE_URL` not matching the domain the links were written
with — see step 4.

**Two-step verification stopped working for everyone.** `MFA_ENCRYPTION_KEY`
changed. Restore the original value; the stored secrets cannot be decrypted
without it.

---

## Plain Docker Compose

Without Coolify, `docker-compose.yml` runs the same stack — PostgreSQL and the
application, with the volumes already declared. You take on the proxy and the
certificate yourself.

```bash
git clone <your-repository-url> dropbox-reseller
cd dropbox-reseller
cp .env.example .env
chmod 600 .env
```

Set `POSTGRES_PASSWORD` as well as the six variables from
[step 4](#4-set-the-environment-variables) — except `DATABASE_URL`, which
Compose builds from the `POSTGRES_*` values and points at the `db` service.
Setting it by hand here is how people accidentally point production at something
else.

**Keep the app off the public interface.** `docker-compose.yml` publishes it
with `${APP_PORT:-3000}:3000`, which binds every interface — right for a laptop,
wrong for a server with a public IP, because it puts the application on
`http://your-ip:3000` without TLS and around whatever proxy you configure. In
`.env`:

```dotenv
APP_PORT=127.0.0.1:3000
```

The database port is already restricted this way and needs no change.

```bash
docker compose up -d --build
docker compose logs -f app
```

Then put a proxy in front. Caddy is the shortest path, because it obtains and
renews the certificate on its own — the entire configuration is:

```caddyfile
yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
```

nginx with Certbot works equally well; proxy to `127.0.0.1:3000` and pass
`proxy_set_header X-Forwarded-Proto $scheme;` so the application knows the
request arrived over HTTPS.

If the server has a firewall: allow 22, 80 and 443, and nothing else inbound.

The admin account, email, backups and troubleshooting sections above all apply
unchanged; upgrades are `git pull && docker compose up -d --build`.
