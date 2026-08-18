# Dev Environment Setup

Pre-merge validation environment at `dev.beachleaguevb.com`. Mirrors prod (EC2 + Docker Compose + nginx). Deployable via manual GitHub Actions dispatch.

**Estimated cost**: ~$19/month (t3.small ~$15 + Elastic IP ~$3.60)

---

## One-Time Setup

### 1. Launch EC2

- **Instance type**: t3.small
- **AMI**: Ubuntu 22.04+
- **Storage**: 20GB gp3
- **Security group**: SSH (your IP), HTTP (80), HTTPS (443)

### 2. Elastic IP

Allocate an Elastic IP and associate it to the instance.

### 3. DNS

In GoDaddy, add an A record:

- **Name**: `dev`
- **Value**: the Elastic IP

### 4. SSH in and bootstrap

```bash
ssh ubuntu@<elastic-ip>
git clone <repo-url> ~/beach-kings
cd ~/beach-kings
sudo bash deployment/dev/setup-dev-ec2.sh
```

This installs Docker, nginx, certbot, creates a 4GB swap file, and sets up `~/snapshots/`.

### 5. Nginx config

```bash
sudo cp ~/beach-kings/deployment/dev/nginx/dev.beachleaguevb.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/dev.beachleaguevb.com.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 6. SSL

Wait for DNS propagation, then:

```bash
cd ~/beach-kings
sudo bash deployment/setup-ssl.sh dev.beachleaguevb.com
```

Uses HTTP-01 challenge (automatic, auto-renewable).

### 7. HTTP basic auth

```bash
sudo apt-get install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd <username>
sudo systemctl reload nginx
```

### 8. Protected GitHub environment and secrets

Create the GitHub Actions environment `dev-provider-validation`. Configure at
least one required reviewer and restrict deployment branches to `main` and the
currently approved TestFlight integration ref only. The workflow also exposes
only those refs as dispatch choices and checks the selected ref before invoking
the secret-bearing deployment step.

Store the provider values as **environment secrets**, not repository-level
secrets, so unapproved jobs and refs cannot receive them. Add these in
**repo Settings > Environments > dev-provider-validation** (the non-provider
deployment secrets may remain at their existing protected scope):

| Secret                           | Value                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DEV_EC2_HOST`                   | Elastic IP                                                                                                            |
| `DEV_EC2_USER`                   | `ubuntu`                                                                                                              |
| `DEV_EC2_SSH_KEY`                | PEM private key contents                                                                                              |
| `DEV_JWT_SECRET_KEY`             | `openssl rand -hex 32`                                                                                                |
| `DEV_POSTGRES_PASSWORD`          | Choose a strong password                                                                                              |
| `DEV_GOOGLE_CLIENT_ID`           | Existing approved web OAuth client ID; this remains the backend primary audience and the dev web client               |
| `DEV_GOOGLE_CLIENT_IDS`          | Comma-separated additional approved audiences, including the iOS client represented by the checked-in redirect scheme |
| `DEV_APPLE_CLIENT_ID`            | Apple App ID for the iOS bundle (`com.beachleague.app`)                                                               |
| `DEV_APPLE_CLIENT_IDS`           | Optional comma-separated additional approved App ID or Services ID audiences                                          |
| `DEV_APPLE_TEAM_ID`              | Apple Developer Program team identifier                                                                               |
| `DEV_APPLE_KEY_ID`               | Key identifier for a Sign in with Apple-enabled private key                                                           |
| `DEV_APPLE_PRIVATE_KEY`          | Complete Sign in with Apple `.p8` key encoded as one line with literal `\n` separators                                |
| `DEV_APPLE_TOKEN_ENCRYPTION_KEY` | Stable, dedicated URL-safe base64 Fernet key for encrypted Apple refresh tokens                                       |
| `PROD_EC2_HOST`                  | Prod IP (for DB snapshots)                                                                                            |
| `PROD_EC2_SSH_KEY`               | Prod PEM key (for DB snapshots)                                                                                       |

The Apple values must come from the app owner's Apple Developer account and
remain owner-only Actions secrets. Create or obtain a key authorized for Sign in
with Apple and record its Key ID, the membership Team ID, the native App ID, and
the downloaded `.p8` contents. Do not reuse the App Store Connect/TestFlight API
key: it is a different credential with different authority. Apple only permits a
private-key download once, so transfer it directly into the secret manager and
retain it according to the owner's credential-recovery policy.

`DEV_APPLE_PRIVATE_KEY` must contain the complete key on one physical line. For
example, convert each real newline to the two literal characters `\n`; do not
paste a multiline value into the generated `.env`. Generate
`DEV_APPLE_TOKEN_ENCRYPTION_KEY` independently and keep it stable while any
Apple refresh-token or revocation work exists.

---

## Deploying

Go to **Actions > Deploy Dev > Run workflow**:

- **branch**: branch to deploy (default: `main`)
- **refresh_db**: check to pull a fresh sanitized copy of prod data

The workflow handles: git checkout, `.env` creation, provider-configuration
preflight, optional DB snapshot/restore/sanitize, `docker compose up --build`,
and health checks. The provider preflight reports only presence/matching status
and stops before database restore or container build if either provider is
incomplete or mismatched.

When the approved TestFlight integration ref changes, update both the workflow
choice/guard and the protected environment's deployment-branch rule in the same
reviewed change. Do not temporarily broaden the rule to all branches.

---

## Verification

1. Trigger workflow with `refresh_db: false` — site loads at `https://dev.beachleaguevb.com` behind basic auth
2. Trigger with `refresh_db: true` — prod data appears, sanitized (no real phone/email/DOB/photos)
3. `curl https://dev.beachleaguevb.com/robots.txt` — returns `Disallow: /`
4. Check Twilio/Resend dashboards — no sends from dev

## What the DB sanitization does

When `refresh_db` is enabled, `deployment/dev/restore-db.sh` restores a prod snapshot and then:

- Truncates auth tokens (refresh_tokens, password_reset_tokens, verification_codes)
- Replaces all user phone numbers and emails with `dev-<id>@test.local` placeholders
- Sets a fixed password hash for all users
- Clears player PII (DOB, profile pictures, coordinates, AVP IDs)
- Nulls external identifiers (WhatsApp group IDs)
- Truncates league messages, feedback, and notifications
- Disables SMS and email via DB settings table
