# Media storage

The media library runs on the server's own filesystem by default. No bucket, no
cloud account, no access key — install the app, mount a directory, and uploads
work. Object storage is still there for deployments that want it, but nothing
requires it.

- [What the drivers are](#what-the-drivers-are)
- [Configuration](#configuration)
- [Where files live, and where they are served from](#where-files-live-and-where-they-are-served-from)
- [Deployments](#deployments)
- [Renaming, folders and what a URL survives](#renaming-folders-and-what-a-url-survives)
- [Security](#security)
- [Backups](#backups)
- [Upgrading an existing installation](#upgrading-an-existing-installation)
- [Checking it works](#checking-it-works)

---

## What the drivers are

| Driver | Where bytes go | What it needs |
| --- | --- | --- |
| `local` (default) | A directory on disk, `UPLOAD_DIR` | A writable, persistent directory |
| `s3` | An S3 bucket | Bucket, keys, public base URL |
| `r2` | A Cloudflare R2 bucket | The same, plus an endpoint |

One interface stands in front of all three (`src/lib/storage/types.ts`), and
nothing in the CMS branches on which is active. An upload, a delete and a
rename read identically whether the bytes land on a mounted disk or in a
bucket, which is what lets a deployment change driver without any application
code being touched.

**Nothing is validated or required for `local`.** Leaving every `S3_*` variable
empty is the supported configuration, not a degraded one: the environment gate
in `src/lib/env-validation.ts` only asks for bucket credentials when the driver
is `s3` or `r2`.

---

## Configuration

```env
STORAGE_DRIVER=local
UPLOAD_DIR=/data/uploads
MEDIA_PUBLIC_PATH=/media
MAX_UPLOAD_SIZE_MB=10
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `STORAGE_DRIVER` | `local` | `local`, `s3` or `r2`. Anything unrecognised is treated as `local` rather than refusing to boot over a typo. |
| `UPLOAD_DIR` | `/data/uploads` | Where the `local` driver writes. Must be persistent in production. |
| `MEDIA_PUBLIC_PATH` | `/media` | The URL prefix media is served under. |
| `MAX_UPLOAD_SIZE_MB` | 150 KB | The ceiling for every upload, on every driver. |

Previous names still work, so an existing deployment upgrades without an
environment change: `STORAGE_PROVIDER` is read when `STORAGE_DRIVER` is unset,
`LOCAL_UPLOAD_DIR` when `UPLOAD_DIR` is unset, and `MAX_UPLOAD_KB` when
`MAX_UPLOAD_SIZE_MB` is unset.

**The default size limit is deliberately 150 KB.** An installation that was
enforcing it keeps enforcing it after upgrading; a new one gets the 10 MB in
`.env.example`. Raise it there rather than in code.

---

## Where files live, and where they are served from

A stored file has three names, and keeping them apart is what makes the
storage swappable:

```
storage key   2026/09/dropbox-logo-a83f29.webp      ← what the database holds
disk path     /data/uploads/2026/09/dropbox-...     ← never leaves the server
public URL    https://example.com/media/2026/09/…   ← what a page renders
```

The database stores the **key**, never the absolute path. That is what lets the
same row resolve whether the directory is a VPS disk, a Docker volume or an
Azure Files mount — and it is why `/data/uploads` never appears in a page's
HTML.

Uploads are namespaced by year and month and carry a random suffix, so a
library of thousands of files stays navigable and no filename can be guessed:

```
/data/uploads/
  2026/
    08/  dropbox-business-a83f29.webp
    09/  onboarding-guide-4c1e02.pdf
```

Files are served by a route (`src/app/media/[...path]/route.ts`) that reads
from disk per request. It has to be a route: Next's standalone server reads
`public/` once at startup, so a file written there by the running server is
invisible until the next restart — which is every upload.

`/uploads/...` is the prefix used before `/media` and is still routed, because
the URL of every file uploaded until then is stored on its row and embedded in
published pages.

---

## Deployments

The application never learns which kind of storage is behind `UPLOAD_DIR`. All
four of these are the same to it — a directory it can write to.

### Local development

```env
STORAGE_DRIVER=local
UPLOAD_DIR=./data/uploads
```

A project-relative path, already in `.gitignore`. Nothing else to set up.

### VPS

Create the directory once, and give it to the user the app runs as:

```bash
sudo mkdir -p /data/uploads
sudo chown -R "$USER":"$USER" /data/uploads
```

Put `/data/uploads` in the backup job (see [Backups](#backups)).

### Docker Compose

Already configured in `docker-compose.yml`:

```yaml
services:
  app:
    environment:
      STORAGE_DRIVER: local
      UPLOAD_DIR: /data/uploads
    volumes:
      - media-data:/data/uploads

volumes:
  media-data:
```

The volume is not optional. Without it every uploaded image is destroyed by the
next `docker compose up --build`, because everything inside the image is
replaced.

### Coolify

1. Set `STORAGE_DRIVER=local` and `UPLOAD_DIR=/data/uploads` in the app's
   environment variables.
2. **Storages** → **Add** → a persistent volume mounted at `/data/uploads`.
3. Redeploy.

Step 2 is the one that matters. Coolify rebuilds the image on every deploy, so
an unmounted `/data/uploads` loses the library each time — silently, because
everything keeps working until someone looks for an old image.

### Azure Container Apps

Azure works on the `local` driver **only with a persistent share mounted at
`UPLOAD_DIR`**. Its container filesystem is ephemeral and is not shared between
replicas, so without one:

- a file uploaded through replica A is missing on replica B, and
- every file disappears at the next revision.

Mount an Azure Files share:

```bash
# 1. A storage account and a file share
az storage account create -g "$RG" -n "$STORAGE_ACCOUNT" --sku Standard_LRS
az storage share-rm create -g "$RG" --storage-account "$STORAGE_ACCOUNT" -n media --quota 100

# 2. Register it with the Container Apps environment
az containerapp env storage set \
  -g "$RG" -n "$ENVIRONMENT" \
  --storage-name media \
  --azure-file-account-name "$STORAGE_ACCOUNT" \
  --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name media \
  --access-mode ReadWrite

# 3. Mount it at /data/uploads (via the app's YAML: volumes + volumeMounts)
az containerapp update -g "$RG" -n "$APP" --yaml app.yaml
```

```yaml
# app.yaml (template.volumes / template.containers[].volumeMounts)
volumes:
  - name: media
    storageType: AzureFile
    storageName: media
containers:
  - name: app
    volumeMounts:
      - volumeName: media
        mountPath: /data/uploads
```

Then set `STORAGE_DRIVER=local` and `UPLOAD_DIR=/data/uploads`.

**No Azure Blob SDK is involved, and none is wanted.** The application writes
to a path; Azure decides what is behind it. If you would rather not run a file
share, `STORAGE_DRIVER=r2` or `s3` remains available and needs no mount.

---

## Renaming, folders and what a URL survives

**Media folders are labels, not directories.** A folder lives in the database
and a file's key never changes when it is moved between folders, so
reorganising the library can never break an image already embedded in a page.
The physical layout stays date-based; the folder tree is what the admin sees.

**Renaming** is in the media details dialog, and covers two separate things:

| Field | Effect |
| --- | --- |
| File name | The name shown in the library and searched on. The file is not touched. |
| URL slug | The file is moved and its public URL changes. |

Changing a slug rewrites the key and the URL. Every reference made through a
picker — a product image, a hero, an OG image, a blog thumbnail — is stored as
a media **id** and follows automatically. A URL someone typed by hand into rich
text does not, and the confirmation message says so.

The extension is never taken from the typed name: it comes from the existing
key, so a PNG cannot be re-labelled as an SVG and served as one. If the slug is
already taken by another item, a short random suffix is added rather than
overwriting it.

---

## Security

Everything below is enforced on the server, on every upload, whatever the
driver.

**A key can only ever name a file inside the upload directory.** One allowlist
(`safeStorageKey` in `src/lib/storage/paths.ts`) is used by the writer, the
serving route and the rename action alike. It accepts `A-Za-z0-9._/-` and
rejects everything else outright: `..` and `.` segments, absolute paths,
backslashes, null bytes, dotfiles, empty segments, and anything still
percent-encoded — Next has already decoded a route parameter by the time it
arrives, so a surviving `%` means double encoding, and decoding it again is
exactly how `%252e%252e` becomes `..` one layer too late. The resolved path is
then checked to be under the root, which also catches an unusual or symlinked
directory.

**Content is checked, not just the filename.** The declared MIME type must be
one of JPG, JPEG, PNG, WEBP, GIF, SVG or PDF *and* the file's magic bytes must
match it, so an executable renamed `.png` is refused.

**SVGs are inspected before they are stored.** SVG is XML and can carry script,
remote references and entity expansions, so the whole file is scanned — with
comments and numeric entities stripped first, so `<scr<!-- -->ipt>` and
`java\nscript:` cannot slip past. Script, event handlers, `foreignObject`,
frames, remote `use` references, entities and script URLs are all rejected.
They are also served under `Content-Security-Policy: default-src 'none';
sandbox` with `X-Content-Type-Options: nosniff`, so even a file that got past
the scanner cannot execute or fetch anything.

**Filenames are never used as written.** `My Dropbox Product @2026!!.png`
becomes `my-dropbox-product-2026-a83f29.png`; a name like `../../etc/passwd.png`
loses the traversal entirely and stores as `passwd-<token>.png`.

**Deleting** removes the row and unlinks the file, and can only unlink inside
the upload directory. A file that has already gone is not an error.

---

## Backups

The database holds media *metadata* — rows, folders, alt text, every CMS
reference. The bytes are a separate thing, and a restore needs both.

The built-in backup (Admin → Settings → Backups) already includes the media
library: it reads `UPLOAD_DIR` through the same resolution the writer uses, so
the two can never disagree about which directory holds the files. Media is
streamed into the archive one file at a time under its storage key, which is
what makes a restore put every file back exactly where its row expects it.

Backing up outside the app is two paths:

```bash
# Database
pg_dump "$DATABASE_URL" -Fc -f dropbox-reseller.dump

# Media — -a preserves the directory structure, which the keys depend on
rsync -a /data/uploads/ /backups/media/
```

Restoring is the same two, in either order:

```bash
pg_restore -d "$DATABASE_URL" --clean --if-exists dropbox-reseller.dump
rsync -a /backups/media/ /data/uploads/
```

See [BACKUP-RESTORE.md](BACKUP-RESTORE.md) for the in-app system, retention and
scheduling.

---

## Upgrading an existing installation

Nothing has to be migrated, and nothing breaks.

**Files already in `public/uploads`** keep serving. That directory is still
read — never written — so rows pointing at it resolve exactly as before. A file
found there is moved onto the new volume the first time it is renamed.

**Rows holding an S3 or R2 URL** keep working whatever the driver is now: those
URLs are absolute and point at the bucket, so they never reach this
application's routes at all.

**Switching driver later** needs no code change and no rebuild of the library.
Set `STORAGE_DRIVER=s3`, add the bucket variables, and new uploads go to the
bucket while existing rows keep their own URLs. Copying the old files across is
optional and separate; the application does not do it automatically, because a
half-finished copy of a live library is worse than none.

---

## Checking it works

At startup the app logs one line:

```json
{"level":"info","event":"storage.check","driver":"local",
 "location":"/data/uploads","exists":true,"writable":true}
```

If `writable` is `false`, uploads will fail and the line is logged at `error`
with the reason. It is deliberately not fatal — an unwritable directory stops
uploads, it does not stop the site serving pages, and exiting would take a
working storefront offline over a misconfigured mount. The container entrypoint
makes the same check before Node starts, so a missing volume shows up in the
first few lines of a deployment log.

`/api/health` reports it too, as a driver and a yes/no:

```json
{"status":"ok","database":"connected","storage":{"driver":"local","writable":true}}
```

The path is **not** in that response. The endpoint is unauthenticated, and
`/data/uploads` in a public body tells a stranger about the filesystem for no
operational gain.

To confirm persistence on a real deployment: upload a file, note its URL,
redeploy, and load the URL again. If it 404s, `UPLOAD_DIR` is not on a
persistent volume.
