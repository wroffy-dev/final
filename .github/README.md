# Workflows

Two workflows live in `workflows/`. This note explains what each one does and
how to fix the failure you are most likely to hit first.

The full, step-by-step deployment guide is
**[`docs/AZURE-DEPLOYMENT.md`](../docs/AZURE-DEPLOYMENT.md)** — that document is
the source of truth for anything Azure. This page only covers the CI/CD wiring.

---

## `ci.yml` — quality gates

Runs on every push to `main`, every pull request, and on demand from the Actions
tab.

It starts a PostgreSQL 16 service container, then runs, in order:
`prisma validate` → `prisma generate` → `prisma migrate deploy` → `lint` →
`typecheck` → `test` → `build` → `seed:build`.

Nothing here needs configuring. It has no secrets and does not touch Azure.

> **The integration tests need a real database.** They cover migrations,
> constraints and the advisory locks the backup system depends on, none of which
> a mock would exercise. Without `DATABASE_URL` set, those test files fail — that
> is the suite working as designed, not a broken test. To run them locally, point
> `DATABASE_URL` at any PostgreSQL 16 instance and run `npx prisma migrate deploy`
> first.

## `deploy-azure.yml` — build and release

Runs on every push to `main`, or by hand from the Actions tab.

Two jobs: `quality` re-runs the gates (everything `ci.yml` does except the seed
bundle), and `deploy` builds the image and ships it. `deploy` depends on
`quality`, so a failing test stops the release before an image is ever built. The image is tagged with the commit SHA, so every
revision traces back to a commit and a rollback is a matter of naming an older
tag.

The manual `skip_quality_gates` input exists for emergency rollbacks only. It
skips the tests, not the deployment.

---

## First deploy fails with "Missing repository variables"

```
##[error]Missing repository variables: REGISTRY REGISTRY_NAME RESOURCE_GROUP CONTAINER_APP
```

This is the workflow's own pre-flight check doing its job. It runs before Azure
login, so nothing is half-deployed — every later step is skipped cleanly. It
fails here deliberately rather than letting a blank value turn into an opaque
`az` error four steps later.

It means the repository has never been connected to Azure. Set the values under
**Settings → Secrets and variables → Actions**, then re-run the workflow.

**Variables** (these are *not* secrets — they are resource names that already
appear in the Azure portal):

| Name | Example |
| --- | --- |
| `AZURE_RESOURCE_GROUP` | `dropbox-reseller-rg` |
| `AZURE_CONTAINER_APP_NAME` | `dropbox-reseller` |
| `AZURE_CONTAINER_REGISTRY` | `dropboxreseller` |
| `AZURE_CONTAINER_REGISTRY_SERVER` | `dropboxreseller.azurecr.io` |

**Secrets** — used for federated OpenID Connect login, so no registry password
or client secret is ever stored in GitHub:

| Name |
| --- |
| `AZURE_CLIENT_ID` |
| `AZURE_TENANT_ID` |
| `AZURE_SUBSCRIPTION_ID` |

Two things are easy to miss, and both fail *after* the pre-flight check passes:

- A GitHub environment named `production` must exist — the `deploy` job targets
  it. See [Create the GitHub environment](../docs/AZURE-DEPLOYMENT.md#create-the-github-environment).
- The Container App needs the **AcrPull** role on the registry, or the image
  pushes but the revision cannot start. See
  [Let the Container App read the registry](../docs/AZURE-DEPLOYMENT.md#let-the-container-app-read-the-registry).

The resources these names refer to have to exist first.
[`docs/AZURE-DEPLOYMENT.md`](../docs/AZURE-DEPLOYMENT.md) walks through creating
them, and
[Connect GitHub to Azure](../docs/AZURE-DEPLOYMENT.md#11-connect-github-to-azure)
covers this section in full.

---

## What "success" means

`az containerapp update` returns as soon as a revision is *requested*, not when
it is serving, so the workflow does not stop there. It waits for the revision to
report `Running`, then calls `scripts/verify-production.mjs` against the public
endpoint. A revision that crash-loops on a bad migration fails the workflow
instead of being reported as a green deploy.

If a deploy fails after the image is built, the container logs for the failed
revision are printed into the workflow output — check there before re-running.
[Troubleshooting](../docs/AZURE-DEPLOYMENT.md#19-troubleshooting) covers the
common causes.

## Runtime configuration is not set here

The workflows carry no application configuration. The image is built with no
build arguments and no secrets, so it stays reusable across environments and
nothing sensitive ends up in a layer that anyone who can pull it could read.
`DATABASE_URL`, `AUTH_SECRET`, SMTP and storage settings are all Container Apps
secrets and environment variables, set on the app itself —
[Add secrets and environment variables](../docs/AZURE-DEPLOYMENT.md#10-add-secrets-and-environment-variables).

Scheduled backups need `CRON_SECRET` and an external scheduler; until it is set,
the endpoint is off rather than open.
[Set up scheduled backups](../docs/AZURE-DEPLOYMENT.md#17-set-up-scheduled-backups).

> **Replica count matters.** Keep minimum replicas at 1 or higher, and read the
> note in [Scaling](../docs/AZURE-DEPLOYMENT.md#18-scaling) before raising the
> maximum — the rate limiter that protects login and form submissions counts
> attempts per replica, so more copies make the effective limit looser.
