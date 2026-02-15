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

### 8. GitHub Secrets

Add these in **repo Settings > Secrets and variables > Actions**:

| Secret | Value |
|--------|-------|
| `DEV_EC2_HOST` | Elastic IP |
| `DEV_EC2_USER` | `ubuntu` |
| `DEV_EC2_SSH_KEY` | PEM private key contents |
| `DEV_JWT_SECRET_KEY` | `openssl rand -hex 32` |
| `DEV_POSTGRES_PASSWORD` | Choose a strong password |
| `PROD_EC2_HOST` | Prod IP (for DB snapshots) |
| `PROD_EC2_SSH_KEY` | Prod PEM key (for DB snapshots) |

---

## Deploying

Go to **Actions > Deploy Dev > Run workflow**:

- **branch**: branch to deploy (default: `main`)
- **refresh_db**: check to pull a fresh sanitized copy of prod data

The workflow handles: git checkout, `.env` creation, optional DB snapshot/restore/sanitize, `docker compose up --build`, and health checks.

---

## Verification

1. Trigger workflow with `refresh_db: false` — site loads at `https://dev.beachleaguevb.com` behind basic auth
2. Trigger with `refresh_db: true` — prod data appears, sanitized (no real phone/email/DOB/photos)
3. `curl https://dev.beachleaguevb.com/robots.txt` — returns `Disallow: /`
4. Check Twilio/SendGrid dashboards — no sends from dev

## What the DB sanitization does

When `refresh_db` is enabled, `deployment/dev/restore-db.sh` restores a prod snapshot and then:

- Truncates auth tokens (refresh_tokens, password_reset_tokens, verification_codes)
- Replaces all user phone numbers and emails with `dev-<id>@test.local` placeholders
- Sets a fixed password hash for all users
- Clears player PII (DOB, profile pictures, coordinates, AVP IDs)
- Nulls external identifiers (WhatsApp group IDs)
- Truncates league messages, feedback, and notifications
- Disables SMS and email via DB settings table
