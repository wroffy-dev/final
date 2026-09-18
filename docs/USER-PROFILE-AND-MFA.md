# My Profile and mandatory two-factor authentication

Every account on this admin panel signs in with a password **and** a 6-digit
code from Microsoft Authenticator. There is no role that is exempt, no skip
button, no master code and no environment variable that turns it off.

Screens: **/admin/profile**, and the enrolment and verification steps at
**/auth/setup-2fa** and **/auth/verify-2fa**.

---

## The authentication architecture this is built on

| Piece | Where |
| --- | --- |
| Auth.js (NextAuth v5) with a Credentials provider | `src/lib/auth/index.ts` |
| Edge-safe config: JWT strategy, 8-hour cookie | `src/lib/auth/config.ts` |
| Server-side session records | `src/lib/auth/session.service.ts` |
| Guards used by every page, action and API route | `src/lib/auth/guards.ts` |
| Permission keys and seeded roles | `src/lib/auth/permissions.ts` |
| bcrypt hashing (cost 12) and the password policy | `src/lib/auth/password.ts` |
| Signed-in bounce off the sign-in screen | `src/middleware.ts` |

### Why there is a session table under a JWT strategy

Auth.js runs on stateless JWTs here, and a JWT cannot be revoked: once issued
it stays valid until it expires, whatever happens to the account meanwhile.
That is incompatible with three things this feature needs — signing other
devices out after a password change, holding a sign-in at "password accepted,
second factor still outstanding", and letting an administrator cut off a
compromised session now rather than in eight hours.

So the token carries **only an identifier** — `sid`, the id of an `AuthSession`
row. The row is what grants access:

```
password accepted  ->  AuthSession { mfaVerifiedAt: null }   (grants nothing)
code verified      ->  AuthSession { mfaVerifiedAt: <now> }  (full session)
password changed   ->  AuthSession { revokedAt: <now> }      (dead immediately)
```

`getAuthState()` in `guards.ts` reads that row, plus the account's current role
and permissions, on every request. Nothing about privilege is trusted from the
token, so a role change, a suspension or a revocation takes effect on the very
next request.

### Where MFA is enforced

**Server-side, in `getAuthState()`** — the single function behind
`getCurrentUser()`, `requireUser()`, `requirePermission()`, `authorize()` and
the API guard. Because the existing guards were rewritten rather than
supplemented, every admin page, Server Action and API route in the application
became MFA-enforcing at once; there is no per-route opt-in that a new route
could forget.

`src/middleware.ts` deliberately does **not** decide this. Middleware runs on
the edge with no database access, so it could only read the claim from the
token — which is exactly what must not be trusted.

It no longer turns anonymous requests away either. It used to redirect them to
the sign-in screen, which put that screen's path in a Location header, so
anything probing `/admin` was handed it. The guards answer instead, and what
they answer an anonymous request with is a 404 — the same answer a URL that
does not exist gets.

```
anonymous            -> 404 (never a redirect: it would name the sign-in screen)
password only, no authenticator -> /auth/setup-2fa
password only, enrolled         -> /auth/verify-2fa
verified                        -> the route proceeds
```

---

## Sign-in flow

```
Email + password
   |
   +-- wrong ------> "Those details did not match an active account."
   |                 (never says which field, never says if the address exists)
   |
   +-- correct ----> pending session, no privileges
                        |
                        +-- not enrolled -> /auth/setup-2fa  (forced)
                        |                      scan QR -> verify -> recovery codes -> dashboard
                        |
                        +-- enrolled     -> /auth/verify-2fa
                                               6-digit code, or a recovery code
                                                  |
                                                  v
                                              full session -> dashboard
```

Enrolling also satisfies that session's second factor — the user has just
proved possession of the authenticator, so asking for another code immediately
would be theatre.

---

## TOTP details

Standards-based RFC 6238, so Microsoft Authenticator, Google Authenticator,
Authy and 1Password all work. The UI says "Microsoft Authenticator" because
that is what the organisation uses.

| Setting | Value |
| --- | --- |
| Library | [`otpauth`](https://github.com/hectorm/otpauth) (`src/lib/mfa/totp.ts`) |
| QR rendering | `qrcode`, as a PNG data URI generated server-side |
| Algorithm | SHA1 |
| Digits | 6 |
| Period | 30 seconds |
| Validation window | ±1 step |
| Secret | 160 bits, base32 |

No cryptography is implemented by hand: the HMAC, the counter arithmetic and
the constant-time comparison are all the library's.

The provisioning URI is exactly:

```
otpauth://totp/Dropbox%20Reseller:user@example.com
  ?issuer=Dropbox%20Reseller&secret=...&algorithm=SHA1&digits=6&period=30
```

### Replay protection

Each account records the highest TOTP time step it has accepted
(`User.twoFactorLastStep`). A code whose step is not newer is refused, so the
same six digits cannot be used twice even inside the thirty seconds they stay
mathematically valid.

One consequence is worth knowing: immediately after enrolling, the code on
screen has already been spent. At sign-in the user will naturally be on a later
code, but inside My Profile — where a user might enrol and then straight away
regenerate recovery codes — the server returns *"That code has already been
used. Wait for your authenticator to show the next one."* rather than the
generic error. That specific message is used **only** for already-authenticated
users; the sign-in screen keeps one generic message for every failure, so
someone holding a captured code cannot learn whether the owner has used it.

---

## Encryption at rest

`src/lib/mfa/crypto.ts`.

- **TOTP secrets**: AES-256-GCM, with the IV and auth tag packed into the
  column as `mfa:v1:<iv>:<tag>:<ciphertext>`. Never stored or logged in the
  clear.
- **Recovery codes**: HMAC-SHA256 keyed with a value derived from the same key.
  A keyed digest rather than a bare hash because a 12-character code carries
  about 60 bits of entropy, which is within reach of an offline attack on a
  leaked table — keying it with a secret the database does not contain makes a
  database dump on its own useless.

The key is `MFA_ENCRYPTION_KEY`, kept separate from `AUTH_SECRET` on purpose:
rotating `AUTH_SECRET` to invalidate sessions would otherwise make every
authenticator in the company stop working at the same moment.

`decryptTotpSecret()` returns `null` rather than throwing when a value cannot
be read — a wrong key, a truncated column, a restore taken against a different
key. Callers treat that as "this user must enrol again", which is the only safe
response.

---

## Recovery codes

Ten codes, issued when enrolment completes, in the form `ABCD-EFGH-IJKL`. The
alphabet excludes `I`, `O`, `0` and `1` so a code read off a printout cannot be
mistyped into a silent failure.

- Shown **once**. There is no screen that can show them again, because only
  the hashes are stored.
- One use each. Consumption is a single conditional update, so two simultaneous
  attempts with the same code cannot both succeed.
- Input is normalised: case and punctuation do not matter.
- Regenerating invalidates every previous code.
- My Profile shows only the remaining count.

---

## My Profile — `/admin/profile`

Four tabs, reachable from the account menu (**My profile** and **Security**).
No permission is required: managing your own account is not an administrative
action.

### Profile
Full name, phone, job title, department, timezone, photo, and the sign-in
email. Role is displayed read-only.

### Password & Security
Change password; Microsoft Authenticator status and setup/reset; recovery-code
count and regeneration; signed-in devices.

### Personal Details
Address, alternate phone and a short bio. All optional and nullable.

### Activity
Account created, last sign-in, password last changed, authenticator enabled on,
last verification, and the last 25 security events **for this account only**.

### What self-service cannot do

Role, permissions, account status, `twoFactorRequired` and any other privilege
field are not writable by these actions. The Zod schemas list the allowed
fields explicitly, so an extra key in the payload is dropped rather than
applied — there is a test that posts `roleId`, `status`, `permissions` and
`twoFactorRequired` and asserts none of them moves.

### Identity comes from the session

Every action calls `authorizeSelf()`, which reads the id from the server
session:

```ts
const user = await authorizeSelf();          // id from the session
await prisma.user.update({ where: { id: user.id }, ... });
```

No action accepts a user id as an argument. A test posts a victim's `id`,
`userId` and `email` in the payload and asserts the victim's record is
untouched.

---

## Re-authentication

| Action | Password | Live TOTP |
| --- | --- | --- |
| Edit profile / personal details | – | – |
| Change photo | – | – |
| Change password | ✅ | – |
| Change sign-in email | ✅ | – |
| Set up authenticator from My Profile | ✅ | – |
| Reset authenticator | ✅ | ✅ |
| Regenerate recovery codes | ✅ | ✅ |

Anything that replaces an existing authenticator needs a code from the
authenticator being replaced, so a session left open on an unattended machine
is not enough to re-point someone's second factor. Losing the phone is
therefore *not* a way in — that case is a recovery code, or an administrator.

---

## Session revocation

| Trigger | Effect |
| --- | --- |
| Password change | Every other session revoked; the current one survives |
| Email change | Every other session revoked |
| Self-service MFA reset | Every other session revoked |
| Administrator MFA reset | **Every** session revoked, including the user's own |
| "Sign out other devices" | Every other session revoked |
| Suspending or deleting the account | Refused on the next request by the account-status check |

Revocation is a column update, so it takes effect on the next request rather
than when a token expires.

---

## Administrator-assisted reset

**Admin → Staff → (user) → Security**, gated on `user.mfa.reset` — a new
permission held by super-admins only by default, and subject to the same rank
rule as the rest of staff management: you cannot reset an account more
privileged than your own.

It clears the secret, deletes every recovery code and revokes every session.
The next password sign-in lands on forced enrolment with a fresh secret. It
never reveals a secret, never issues a code and cannot be used to sign in as
anyone.

The screen carries a deliberate warning: verify who you are speaking to over a
channel **other than** the email address on the account, because an attacker
who has taken over an inbox will ask for exactly this.

---

## Rollout

### Existing users
The migration sets `twoFactorRequired = true` and `twoFactorEnabled = false`
for everyone. Nobody is locked out: their next successful password sign-in
lands on forced enrolment, and the admin panel is unreachable until it
completes.

Existing session tokens have no `sid` and are treated as anonymous, so everyone
signs in once after deployment. That is intentional — a token minted before
server-side sessions existed cannot be revoked.

### New users
Created with the same defaults. First sign-in is password → forced enrolment →
verify → recovery codes → dashboard.

### Super admins
Not exempt. Recovery is a recovery code, or another super admin performing an
assisted reset.

---

## Environment variables

```env
MFA_ISSUER="Dropbox Reseller"
MFA_ENCRYPTION_KEY=""      # openssl rand -base64 32
```

`MFA_ENCRYPTION_KEY` is **required in production**. Without it nobody can
enrol, and the Password & Security tab says so rather than failing obscurely.

**Changing it makes every stored authenticator and recovery code unreadable.**
There is no rotation procedure yet (see Limitations); treat it as permanent and
store it with your other long-lived secrets.

### Coolify

1. **Environment Variables** → add `MFA_ISSUER` and `MFA_ENCRYPTION_KEY`.
   Runtime scope; they are not needed at build time.
2. Redeploy. The entrypoint applies the migration automatically.
3. Confirm host time is synchronised — see below.

---

## Server time

TOTP is a function of the clock. The ±1 step window absorbs about 30 seconds of
drift; beyond that, valid codes start being rejected and users cannot sign in.

Make sure NTP is running on the host:

```sh
timedatectl status          # expect "System clock synchronized: yes"
sudo timedatectl set-ntp true
```

Containers inherit the host clock, so this is a host-level setting. If several
users report "invalid verification code" at once and nothing has been deployed,
check the clock first.

---

## Backup and restore

The MFA and profile columns live on `User`, plus the `AuthSession` and
`RecoveryCode` tables, so they are included in database backups like any other
table.

**`MFA_ENCRYPTION_KEY` is not in the backup archive**, and must not be: an
archive containing both the encrypted secrets and the key that opens them is an
archive with no encryption at all. It belongs in environment configuration.

The consequence for disaster recovery: **restoring a database onto a deployment
with a different `MFA_ENCRYPTION_KEY` makes every restored TOTP secret and
recovery code unreadable.** The application degrades safely rather than
crashing — affected users are treated as not enrolled and are walked through
enrolment again at their next sign-in — but everyone has to re-enrol. Store the
key with your disaster-recovery notes.

`AuthSession` rows are restored along with everything else, so sessions valid
at backup time may become valid again. If that matters after a compromise,
clear the table after restoring:

```sql
UPDATE "AuthSession" SET "revokedAt" = NOW(), "revokedReason" = 'RESTORED';
```

---

## Emergency recovery

In order of preference:

1. **A recovery code** on the sign-in screen.
2. **Another administrator** with `user.mfa.reset` performs an assisted reset.
3. **Database access**, if nobody can sign in at all — clears the second factor
   for one account, which then re-enrols at the next sign-in:

   ```sql
   UPDATE "User"
      SET "twoFactorEnabled" = false,
          "twoFactorSecret" = NULL,
          "twoFactorPending" = NULL,
          "twoFactorVerifiedAt" = NULL,
          "twoFactorLastStep" = NULL
    WHERE email = 'locked-out@example.com';

   DELETE FROM "RecoveryCode"
    WHERE "userId" = (SELECT id FROM "User" WHERE email = 'locked-out@example.com');
   ```

   This requires production database access, which is itself a privileged act —
   that is the point. It is the last resort, not a convenience.

There is no master code, no developer bypass and no `MFA_DISABLED` flag, by
design. Adding one would make every other control here decorative.

---

## Rate limiting

Uses the existing in-memory limiter (`src/lib/utils/rate-limit.ts`).

| Action | Limit |
| --- | --- |
| Password sign-in (per email / per IP) | 8 / 20 per 15 min |
| TOTP verification | 5 per 5 min, per account and purpose |
| Enrolment verification | 5 per 5 min |
| Recovery code attempts | 5 per 5 min |
| MFA reset, recovery regeneration | 5 per 15 min |
| Password and email change | 5 per 15 min |

Buckets are keyed by account *and* purpose, so a failed enrolment cannot lock
someone out of signing in. On a single container this is sufficient; if the app
is ever scaled horizontally the store needs to move to Redis — the call sites
do not change.

---

## Audit logging

Security events go to the existing `AuditLog` table with `entity = "Security"`
and `entityId` set to the account the event concerns, which is what the
Activity tab filters on. A separate table was not needed: `AuditLog` already
carries actor, IP hash, user agent and timestamp.

Recorded: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `MFA_SETUP_STARTED`, `MFA_ENABLED`,
`MFA_LOGIN_VERIFIED`, `MFA_VERIFICATION_FAILED`, `MFA_RESET_BY_USER`,
`MFA_RESET_BY_ADMIN`, `RECOVERY_CODE_USED`, `RECOVERY_CODES_REGENERATED`,
`PASSWORD_CHANGED`, `EMAIL_CHANGED`, `PROFILE_UPDATED`,
`OTHER_SESSIONS_REVOKED`, `SESSION_REVOKED`.

Never recorded: passwords, TOTP codes, TOTP secrets, recovery codes, the
encryption key, or raw IP addresses (only a salted hash). Call sites pass a
summary they have written by hand — never a raw input or a caught error — and a
test asserts that no secret, code or key appears anywhere in the security
audit trail.

---

## Limitations

1. **No key rotation.** Changing `MFA_ENCRYPTION_KEY` orphans every stored
   secret. Rotation needs a re-encryption pass over the table with both keys
   available, which is not built.
2. **Rate limits are per-container.** In-memory, so horizontal scaling would
   multiply the effective limit by the number of containers.
3. **New email addresses are not verified.** The project has no email
   verification flow; the change is gated on the current password instead. If
   one is added later, this is the place to hook it in.
4. **No WebAuthn or passkeys.** TOTP only.
5. **No "trust this device for 30 days".** A code is required at every sign-in.
   This is deliberate but is the usual first request once a team is using it.
6. **Session lifetime is fixed at eight hours** and is not configurable from
   the admin UI.
