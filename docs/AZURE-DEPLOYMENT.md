# Deploying to Microsoft Azure

A step-by-step guide to putting this application live on Azure Container Apps.
It assumes no prior Azure experience and names the exact buttons to click.

Set aside about 90 minutes for the first deployment. Roughly half of that is
waiting for Azure to create things.

**What you will end up with**

```
GitHub (main)
   └─ GitHub Actions ─ tests, then builds a Docker image
        └─ Azure Container Registry ─ stores the image
             └─ Azure Container Apps ─ runs it, 1–3 copies
                  ├─ Azure Database for PostgreSQL 16 ─ your data
                  ├─ Cloudflare R2 (or S3) ─ uploaded images and files
                  └─ Cloudflare R2 (private) ─ database backups
```

**Rough monthly cost**: £40–£90 for a small production site. The database is
usually the largest part.

---

## Contents

1. [Before you start](#1-before-you-start)
2. [Create a resource group](#2-create-a-resource-group)
3. [Create the database](#3-create-the-database)
4. [Build your DATABASE_URL](#4-build-your-database_url)
5. [Create the container registry](#5-create-the-container-registry)
6. [Create the Container Apps environment](#6-create-the-container-apps-environment)
7. [Create the Container App](#7-create-the-container-app)
8. [Set up storage (R2)](#8-set-up-storage-r2)
9. [Generate your secrets](#9-generate-your-secrets)
10. [Add secrets and environment variables](#10-add-secrets-and-environment-variables)
11. [Connect GitHub to Azure](#11-connect-github-to-azure)
12. [Deploy for the first time](#12-deploy-for-the-first-time)
13. [Create your admin account](#13-create-your-admin-account)
14. [Turn seeding off again](#14-turn-seeding-off-again)
15. [Connect your domain](#15-connect-your-domain)
16. [Set up email](#16-set-up-email)
17. [Set up scheduled backups](#17-set-up-scheduled-backups)
18. [Scaling](#18-scaling)
19. [Troubleshooting](#19-troubleshooting)
20. [Rolling back](#20-rolling-back)

---

## 1. Before you start

You need:

- An **Azure account** with an active subscription and permission to create
  resources — <https://portal.azure.com>. If your organisation manages Azure for
  you, ask for **Owner** or **Contributor** on a subscription, plus permission to
  create app registrations in Microsoft Entra ID (step 11 needs it).
- A **GitHub account** with admin access to this repository.
- A **Cloudflare account** for R2 storage (free tier is enough to start) —
  <https://dash.cloudflare.com>.
- A **domain name**, if you want one. You can deploy without it and add it later.

Throughout this guide, replace anything in `CAPITALS` with your own values.

> **A note on secrets.** Several steps generate long random strings. Paste each
> one into a password manager as you create it. Two of them —
> `MFA_ENCRYPTION_KEY` and `ENCRYPTION_KEY` — cannot be changed later without
> consequences, and there is no way to recover them.

---

## 2. Create a resource group

A resource group is a folder that holds everything for this project, so you can
find it all later and delete it in one go if you need to.

1. Go to <https://portal.azure.com>.
2. In the search bar at the top, type **Resource groups** and click it.
3. Click **+ Create**.
4. Fill in:
   - **Subscription** — pick yours.
   - **Resource group** — `dropbox-reseller-rg`
   - **Region** — pick the one closest to your customers. This guide uses
     **(Europe) UK South**. Use the same region for everything that follows;
     resources in different regions cost more to talk to each other and are
     slower.
5. Click **Review + create**, then **Create**.

---

## 3. Create the database

1. Search for **Azure Database for PostgreSQL flexible servers** and click it.
2. Click **+ Create**, then choose **Flexible server**.

**Basics tab**

| Field | Value |
| --- | --- |
| Resource group | `dropbox-reseller-rg` |
| Server name | `dropbox-reseller-db` (must be globally unique — add digits if taken) |
| Region | the same one you chose in step 2 |
| PostgreSQL version | **16** |
| Workload type | **Development** to start with |
| Authentication method | **PostgreSQL authentication only** |
| Admin username | `dbadmin` |
| Password | click **Generate** if offered, or create a long random one |

> **Version 16 matters.** The backup system uses `pg_dump`, and the tool refuses
> to read a database newer than itself. The container ships a PostgreSQL 16
> client, so choosing 17 here would break every backup.

Save the admin username and password in your password manager now.

**Networking tab**

1. **Connectivity method** — **Public access (allowed IP addresses)**.
2. Tick **Allow public access from any Azure service within Azure to this
   server**. This is what lets your Container App connect.
3. Under **Firewall rules**, click **+ Add current client IP address** so you can
   connect from your own machine if you ever need to.

3. Click **Review + create**, then **Create**. This takes 5–10 minutes.

**Create the database itself**

Once deployment finishes:

1. Click **Go to resource**.
2. In the left menu under **Settings**, click **Databases**.
3. Click **+ Add**.
4. **Name**: `dropbox_reseller` — then click **Save**.

---

## 4. Build your `DATABASE_URL`

The application needs the connection details as a single line of text.

Take this template:

```
postgresql://USERNAME:PASSWORD@SERVERNAME.postgres.database.azure.com:5432/dropbox_reseller?schema=public&sslmode=require&connection_limit=5
```

and replace:

- `USERNAME` — the admin username from step 3 (`dbadmin`)
- `PASSWORD` — the admin password
- `SERVERNAME` — your server name (`dropbox-reseller-db`)

Example:

```
postgresql://dbadmin:Xk9%40mP2vL8qR@dropbox-reseller-db.postgres.database.azure.com:5432/dropbox_reseller?schema=public&sslmode=require&connection_limit=5
```

Three parts of that are not optional:

- **`sslmode=require`** — Azure rejects unencrypted connections.
- **`connection_limit=5`** — each running copy of the app keeps its own pool of
  database connections. A small Azure database allows around 35 in total, so
  without this limit three copies could use them all up and the site would start
  refusing connections. Five per copy leaves comfortable headroom.
- **URL-encoding your password.** If it contains any of `@ : / ? # & % +`, those
  characters must be replaced or the connection string will be misread:

  | Character | Replace with |
  | --- | --- |
  | `@` | `%40` |
  | `:` | `%3A` |
  | `/` | `%2F` |
  | `?` | `%3F` |
  | `#` | `%23` |
  | `&` | `%26` |
  | `%` | `%25` |
  | `+` | `%2B` |

  The simplest way to avoid this is to use a password made only of letters and
  numbers.

Save the finished line in your password manager.

---

## 5. Create the container registry

This is where your built application images are stored.

1. Search for **Container registries**, click it, then **+ Create**.
2. Fill in:
   - **Resource group** — `dropbox-reseller-rg`
   - **Registry name** — `dropboxreseller` (letters and numbers only, globally
     unique)
   - **Location** — the same region
   - **Pricing plan** — **Basic**
3. Click **Review + create**, then **Create**.

Note down two values:

- **Registry name**: `dropboxreseller`
- **Login server**: `dropboxreseller.azurecr.io` (shown on the overview page)

---

## 6. Create the Container Apps environment

The environment is the shared networking and logging space your app runs in.

1. Search for **Container Apps**, click it, then **+ Create** → **Container App**.
2. On the **Basics** tab:
   - **Resource group** — `dropbox-reseller-rg`
   - **Container app name** — `dropbox-reseller`
   - **Region** — the same region
3. Next to **Container Apps environment**, click **Create new**.
   - **Environment name** — `dropbox-reseller-env`
   - **Zone redundancy** — **Disabled** (cheaper; enable later if you need it)
   - Click **Create**.

Stay on this screen — the next step continues the same wizard.

---

## 7. Create the Container App

**Container tab**

For now, use Azure's placeholder image. Your real image arrives in step 12.

1. Tick **Use quickstart image**.
2. Select **Simple hello world container**.

**Ingress tab**

1. Tick **Ingress enabled**.
2. **Ingress traffic** — **Accepting traffic from anywhere**.
3. **Ingress type** — **HTTP**.
4. **Target port** — **3000**.

> Port 3000 must match exactly. This is the port the application listens on.

5. Click **Review + create**, then **Create**. This takes 2–3 minutes.

When it finishes, click **Go to resource** and copy the **Application URL** from
the overview page. It looks like
`https://dropbox-reseller.something.uksouth.azurecontainerapps.io`.

You will use this URL until your own domain is connected.

---

## 8. Set up storage (R2)

Uploaded images must not be stored inside the container. Azure runs several
copies of your app and replaces them on every deployment, so a file saved inside
one copy is invisible to the others and disappears at the next release.

> **There are two ways to solve that, and both are supported.**
>
> **A — Azure Files, no cloud storage account.** Mount an Azure Files share at
> `/data/uploads` and keep `STORAGE_DRIVER=local`. The share is shared between
> replicas and survives revisions, which is exactly what the container's own
> disk is not. No R2 or S3 bucket is needed for media at all — the commands are
> in [MEDIA-STORAGE.md](MEDIA-STORAGE.md#azure-container-apps). Skip the media
> bucket below; you still need the **backup** bucket.
>
> **B — R2 or S3**, as written below. Nothing to mount.
>
> This section documents B, which is what the rest of this guide's variable
> table assumes.

You need **two separate buckets**: one public for media, one private for backups.

### Media bucket

1. Go to <https://dash.cloudflare.com> → **R2** → **Create bucket**.
2. **Name**: `dropbox-reseller-media` → **Create bucket**.
3. Open the bucket → **Settings** → **Public access** → **Allow Access**, and
   note the public URL (`https://pub-xxxxx.r2.dev`). A custom domain is nicer if
   you have one.

### Backup bucket

1. **Create bucket** again → **Name**: `dropbox-reseller-backups`.
2. **Leave public access switched off.** A backup archive contains your entire
   database, including password hashes.

### API tokens

1. In **R2**, click **Manage R2 API Tokens** → **Create API token**.
2. **Permissions**: **Object Read & Write**.
3. Create **two separate tokens**, each scoped to one bucket:
   - one for `dropbox-reseller-media`
   - one for `dropbox-reseller-backups`

   Separate tokens mean a leaked media key cannot reach your backups.
4. Copy the **Access Key ID**, **Secret Access Key** and the **endpoint**
   (`https://ACCOUNT_ID.r2.cloudflarestorage.com`) for each.

---

## 9. Generate your secrets

You need four random values. On macOS or Linux, run each of these in a terminal:

```sh
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY
openssl rand -base64 32   # MFA_ENCRYPTION_KEY
openssl rand -hex 32      # CRON_SECRET
```

On Windows, use PowerShell:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
```

Save all four in your password manager, clearly labelled.

> **`MFA_ENCRYPTION_KEY` is permanent.** It encrypts the two-step verification
> secrets. If you ever change it, every user's authenticator app stops working
> and every recovery code becomes unreadable — everyone has to enrol again, and
> there is no way to undo it. It is also not included in database backups, so
> keep a copy with your disaster-recovery notes: restoring a backup onto a
> deployment with a different key leaves the MFA secrets unreadable.

Also decide on a strong admin password now. It must have at least 14 characters,
upper and lower case, a number, a symbol, and must not contain a common word
like "password" or "changeme" — the application rejects weak ones.

---

## 10. Add secrets and environment variables

### Add the secrets

1. In your Container App, left menu → **Settings** → **Secrets**.
2. Click **+ Add** for each row below, then **Save** at the end.

| Secret name | Value |
| --- | --- |
| `database-url` | the connection string from step 4 |
| `auth-secret` | the first `openssl` value |
| `encryption-key` | the second `openssl` value |
| `mfa-encryption-key` | the third `openssl` value |
| `cron-secret` | the `openssl rand -hex 32` value |
| `seed-admin-password` | your chosen admin password |
| `media-access-key` | R2 media Access Key ID |
| `media-secret-key` | R2 media Secret Access Key |
| `backup-access-key` | R2 backup Access Key ID |
| `backup-secret-key` | R2 backup Secret Access Key |
| `smtp-password` | your email password (add later if you prefer) |

### Add the environment variables

1. Left menu → **Application** → **Containers**.
2. Click **Edit and deploy** → click the container name → **Environment
   variables** tab.

Add each row from **[docs/AZURE-ENVIRONMENT.md](AZURE-ENVIRONMENT.md)**. For the
secret ones, choose **Reference a secret** as the Source and pick the secret
name; for everything else choose **Manual entry**.

The values that matter most for a first deployment:

| Name | Source | Value |
| --- | --- | --- |
| `DATABASE_URL` | Reference a secret | `database-url` |
| `AUTH_SECRET` | Reference a secret | `auth-secret` |
| `ENCRYPTION_KEY` | Reference a secret | `encryption-key` |
| `MFA_ENCRYPTION_KEY` | Reference a secret | `mfa-encryption-key` |
| `NEXTAUTH_URL` | Manual entry | your Application URL from step 7 |
| `NEXT_PUBLIC_SITE_URL` | Manual entry | the same URL |
| `PORT` | Manual entry | `3000` |
| `RUN_MIGRATIONS` | Manual entry | `true` |
| `RUN_SEED` | Manual entry | `true` — just for the first deployment |
| `SEED_ADMIN_EMAIL` | Manual entry | your email address |
| `SEED_ADMIN_PASSWORD` | Reference a secret | `seed-admin-password` |
| `SEED_DEMO_CONTENT` | Manual entry | `false` |
| `STORAGE_DRIVER` | Manual entry | `r2` — or `local` with an Azure Files share mounted at `/data/uploads` |
| `BACKUP_STORAGE_DRIVER` | Manual entry | `s3` |

Click **Save** at the bottom, then **Create** to apply.

> The app checks all of this when it starts. If something required is missing it
> stops immediately and writes a list of exactly which variables are wrong to the
> log — see [Troubleshooting](#19-troubleshooting).

---

## 11. Connect GitHub to Azure

This lets GitHub Actions deploy without you storing an Azure password anywhere.
It uses a short-lived token instead, which cannot be reused if it leaks.

### Create the identity

1. In the portal, search for **Microsoft Entra ID** → **App registrations** →
   **+ New registration**.
2. **Name**: `dropbox-reseller-deploy` → **Register**.
3. On the overview page, copy the **Application (client) ID** and the
   **Directory (tenant) ID**.

### Add the federated credential

1. In the app registration → **Certificates & secrets** → **Federated
   credentials** → **+ Add credential**.
2. **Federated credential scenario**: **GitHub Actions deploying Azure
   resources**.
3. Fill in:
   - **Organization**: your GitHub username or organisation
   - **Repository**: `dropbox-reseller`
   - **Entity type**: **Branch**
   - **GitHub branch name**: `main`
   - **Name**: `deploy-main`
4. Click **Add**.
5. Repeat, this time with **Entity type**: **Environment** and **Environment
   name**: `production`. The deployment workflow uses a GitHub environment, and
   without this second credential the login step fails.

### Grant permissions

1. Go to **Resource groups** → `dropbox-reseller-rg` → **Access control (IAM)**.
2. **+ Add** → **Add role assignment**.
3. **Role**: **Contributor** → **Next**.
4. **Assign access to**: **User, group, or service principal** → **+ Select
   members** → search `dropbox-reseller-deploy` → select it → **Review +
   assign**.
5. Repeat for the role **AcrPush**, so the workflow can upload images.

### Tell GitHub

In your GitHub repository → **Settings** → **Secrets and variables** →
**Actions**:

Under **Secrets** → **New repository secret**:

| Name | Value |
| --- | --- |
| `AZURE_CLIENT_ID` | Application (client) ID |
| `AZURE_TENANT_ID` | Directory (tenant) ID |
| `AZURE_SUBSCRIPTION_ID` | found on the subscription's overview page |

Under **Variables** → **New repository variable**:

| Name | Value |
| --- | --- |
| `AZURE_RESOURCE_GROUP` | `dropbox-reseller-rg` |
| `AZURE_CONTAINER_APP_NAME` | `dropbox-reseller` |
| `AZURE_CONTAINER_REGISTRY` | `dropboxreseller` |
| `AZURE_CONTAINER_REGISTRY_SERVER` | `dropboxreseller.azurecr.io` |

### Create the GitHub environment

1. **Settings** → **Environments** → **New environment**.
2. **Name**: `production` → **Configure environment**.
3. Optionally add yourself under **Required reviewers** so deployments pause for
   approval.

### Let the Container App read the registry

1. Container App → **Settings** → **Identity** → **System assigned** → **Status:
   On** → **Save**.
2. Container registry → **Access control (IAM)** → **+ Add** → **Add role
   assignment** → **AcrPull** → **Managed identity** → select your container app.

---

## 12. Deploy for the first time

1. Go to your repository on GitHub → **Actions**.
2. Select **Deploy to Azure Container Apps** on the left.
3. Click **Run workflow** → **Run workflow**.

It takes 8–15 minutes. The workflow:

1. Runs the tests, typecheck, lint and build — and stops if any of them fail.
2. Builds the Docker image and pushes it to your registry.
3. Tells Azure to start a new revision.
4. Waits for that revision to report healthy, and fails if it does not.
5. Checks the live URL actually responds.

When it finishes green, open your Application URL. You should see the site.

---

## 13. Create your admin account

The first deployment ran the seed, which created your admin account.

1. Go to `https://YOUR-APP-URL/auth-control-panel/admin` — the sign-in screen
   is not on `/login`; see `LOGIN_PATH` in `src/lib/auth/routes.ts`.
2. Sign in with `SEED_ADMIN_EMAIL` and your admin password.
3. You are immediately asked to set up Microsoft Authenticator — this is required
   and cannot be skipped:
   - Open Microsoft Authenticator on your phone.
   - Tap **+** → **Other account**.
   - Scan the QR code.
   - Type the 6-digit code shown.
4. **Save your recovery codes.** They are shown once and never again. They are
   the only way back in if you lose your phone.

---

## 14. Turn seeding off again

Important, and easy to forget.

1. Container App → **Containers** → **Edit and deploy** → container →
   **Environment variables**.
2. Change `RUN_SEED` to `false`.
3. Delete the `SEED_ADMIN_PASSWORD` row.
4. **Save** → **Create**.
5. Once the new revision is running, go to **Secrets** and delete
   `seed-admin-password`.

Your admin account is unaffected. Leaving the password in the environment serves
no purpose and is one more place it can leak from.

---

## 15. Connect your domain

1. Container App → **Settings** → **Custom domains** → **+ Add custom domain**.
2. Enter your domain, e.g. `www.example.com`.
3. Azure shows two DNS records to create. Add them at your DNS provider:
   - a **TXT** record named `asuid.www` (for verification)
   - a **CNAME** record pointing `www` at your Application URL
4. Wait for DNS to propagate (usually minutes, occasionally an hour), then click
   **Validate** → **Add**.
5. **Certificate**: choose **Managed certificate**. Azure issues and renews HTTPS
   for free. It takes a few minutes to appear.

**Then update the two URL variables** — the site will behave oddly until you do,
because login redirects and email links use them:

1. **Containers** → **Edit and deploy** → container → **Environment variables**.
2. Set both `NEXTAUTH_URL` and `NEXT_PUBLIC_SITE_URL` to
   `https://www.example.com` (no trailing slash).
3. **Save** → **Create**.

After the new revision is live, check:

- signing in and out works
- the Microsoft Authenticator prompt appears
- `https://www.example.com/sitemap.xml` shows your domain, not the Azure one
- `https://www.example.com/robots.txt` loads
- sharing a page shows the right preview image

---

## 16. Set up email

Needed for lead notifications and form confirmations.

You can configure this either in the Azure environment variables or, more
conveniently, at **Admin → Settings → Email** inside the app. Values saved in
the admin take precedence.

Typical settings for a transactional provider:

| Variable | Example |
| --- | --- |
| `SMTP_HOST` | `smtp.sendgrid.net` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `apikey` |
| `SMTP_PASSWORD` | reference the `smtp-password` secret |
| `SMTP_ENCRYPTION` | `tls` |
| `MAIL_FROM` | `Your Company <noreply@example.com>` |

Send a test message from **Admin → Settings → Email** to confirm.

---

## 17. Set up scheduled backups

Backups only run when something calls the application on a schedule. Azure
Container Apps has a built-in job type for this.

1. Search for **Container App Jobs** → **+ Create**.
2. **Resource group**: `dropbox-reseller-rg`; **Job name**: `backup-tick`.
3. **Container Apps environment**: `dropbox-reseller-env`.
4. **Job type**: **Scheduled**.
5. **Cron expression**: `*/15 * * * *` (every 15 minutes — the app itself decides
   whether a backup is actually due).
6. **Container** tab → **Image source**: **Docker Hub** → **Image**:
   `curlimages/curl:latest`.
7. **Command override**:
   ```
   curl,-fsS,-X,POST,-H,Authorization: Bearer SECRET,https://YOUR-DOMAIN/api/internal/cron/backup
   ```
   Replace `SECRET` with your `CRON_SECRET` value and `YOUR-DOMAIN` with your
   site.
8. **Review + create** → **Create**.

Then set the schedule itself in **Admin → Settings → Backup & restore** —
frequency, time, and how many to keep.

Full detail: [docs/BACKUP-RESTORE.md](BACKUP-RESTORE.md).

---

## 18. Scaling

**Recommended starting point**

| Setting | Value |
| --- | --- |
| Minimum replicas | 1 |
| Maximum replicas | 3 |
| CPU | 1 vCPU |
| Memory | 2 GiB |

**For a busier site**

| Setting | Value |
| --- | --- |
| Minimum replicas | 2 |
| Maximum replicas | 5 |
| CPU | 2 vCPU |
| Memory | 4 GiB |

To change any of it:

1. Container App → **Application** → **Containers** → **Edit and deploy**.
2. **Scale** tab — drag the replica sliders.
3. **Container** tab — click the container name to change CPU and memory.
4. **Save** → **Create**.

> **Do not set minimum replicas to 0.** The app would shut down when idle and the
> first visitor afterwards would wait through a cold start and database
> migrations.

> **If you raise the maximum above 3**, also raise `connection_limit` headroom:
> check your database's connection limit under **Server parameters** →
> `max_connections`, and keep `replicas × connection_limit` comfortably below it.

One thing to know about running more than one copy: the rate limiter that
protects login and form submissions counts attempts **per copy**, not across all
of them. With 3 copies the effective limit is roughly three times looser. Every
other protection — the two-step verification replay check, the backup lock,
session revocation — is stored in the database and works correctly across
copies.

---

## 19. Troubleshooting

**Where to look first.** Container App → **Monitoring** → **Log stream**. This
shows the application's own output live.

---

**The container starts and immediately stops**

Look for a line beginning `[startup] Environment is not ready for production`.
It lists exactly which variables are missing or wrong. Fix them under
**Containers** → **Edit and deploy** → **Environment variables**, then **Save** →
**Create**.

---

**`migrations failed after N attempts`**

The app could not reach the database. Check:

- Database → **Networking** → **Allow public access from any Azure service
  within Azure to this server** is ticked.
- Your `DATABASE_URL` ends with `sslmode=require`.
- The password is URL-encoded (step 4).
- The database named `dropbox_reseller` exists (step 3).

---

**The site loads but says "degraded"**

Visit `https://YOUR-DOMAIN/api/health`. If it reports
`"database": "unreachable"`, it is the same set of causes as above.

---

**Images upload but do not appear**

On Azure a file saved into the container's own disk is lost when the container
is replaced, and is invisible to the other replicas meanwhile. Either:

- `STORAGE_DRIVER=local` **with an Azure Files share mounted at `UPLOAD_DIR`**
  (`/data/uploads`). Check the mount actually exists — the container log has a
  `storage.check` line naming the directory and whether it was writable, and
  `/api/health` reports `storage.writable`; or
- `STORAGE_DRIVER=r2`/`s3`, in which case check `S3_PUBLIC_URL` is the public
  bucket URL and that public access is enabled on the media bucket.

See [MEDIA-STORAGE.md](MEDIA-STORAGE.md).

---

**"Too many connections" errors**

Add or lower `connection_limit=5` in `DATABASE_URL`, or reduce the maximum
replica count. See step 4.

---

**Nobody can sign in after a change**

If you changed `AUTH_SECRET`, everyone is signed out — that is expected, and
signing in again fixes it.

If you changed `MFA_ENCRYPTION_KEY`, authenticator apps stop working and cannot
be recovered. Restore the previous value if you still have it. If not, an
administrator must reset each user's authenticator from **Admin → Staff →
(user) → Security**; for the last remaining super admin, see the emergency
recovery section of [docs/USER-PROFILE-AND-MFA.md](USER-PROFILE-AND-MFA.md).

---

**The GitHub Actions deployment fails**

- *Login step fails* — check both federated credentials exist (step 11), one for
  the branch and one for the `production` environment.
- *Push step fails* — the identity needs the **AcrPush** role on the registry.
- *Revision never becomes healthy* — the workflow prints the container logs;
  read those.
- *Tests fail* — that is the gate doing its job. Fix the code.

---

## 20. Rolling back

Every deployment creates a revision, and old ones are kept.

1. Container App → **Application** → **Revisions and replicas**.
2. Find the last revision that worked — revisions are labelled with the commit.
3. Click it → **Activate**.
4. Set its traffic to 100% and the broken one to 0%.

Traffic moves within about a minute.

> **Database migrations do not roll back.** The schema stays as the newer version
> left it. Migrations in this project are written to be additive — they add
> columns and tables rather than removing them — so an older image normally runs
> fine against a newer schema. If you need to go back further, restore a database
> backup from **Admin → Settings → Backup & restore**.

---

## Reference

- Every variable, ready to copy: [docs/AZURE-ENVIRONMENT.md](AZURE-ENVIRONMENT.md)
- Backups: [docs/BACKUP-RESTORE.md](BACKUP-RESTORE.md)
- Two-step verification: [docs/USER-PROFILE-AND-MFA.md](USER-PROFILE-AND-MFA.md)
