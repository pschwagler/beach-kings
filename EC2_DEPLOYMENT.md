# EC2 Deployment Checklist

## Pre-Deployment

- [ ] AWS account created
- [ ] SSH key pair created in AWS console (or upload existing)
- [ ] Google Sheets API credentials ready (`credentials.json`)
- [ ] Generate secure JWT secret: `openssl rand -hex 32`

---

## 1. Launch EC2 Instance

- [ ] Go to AWS Console → EC2 → Launch Instance
- [ ] **AMI:** Ubuntu Server 22.04 LTS (or Ubuntu Server 24.04 LTS)
- [ ] **Instance type:** t3.small (2 vCPU, 2GB RAM, ~$15/mo)
- [ ] **Key pair:** Select your SSH key
- [ ] **Security group:** Create new with these rules:
  - SSH (22) - Your IP only
  - HTTP (80) - Anywhere (required for Let's Encrypt)
  - HTTPS (443) - Anywhere (for SSL, can add after initial setup)
  - Custom TCP (3000) - Anywhere (optional, for direct frontend access before SSL setup)
  - Custom TCP (8000) - Anywhere (optional, for direct backend API access before SSL setup)
- [ ] **Storage:** 20GB gp3
- [ ] Launch instance

---

## 2. Connect & Install Docker

```bash
# Connect to instance (Ubuntu default user is 'ubuntu')
ssh -i your-key.pem ubuntu@<PUBLIC_IP>

# Update system packages
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker from Ubuntu repos
sudo apt-get install -y docker.io git

# Install Docker Compose as standalone binary
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add your user to docker group (so you don't need sudo)
sudo usermod -aG docker ubuntu

# IMPORTANT: Log out and back in for docker group to take effect
exit
```

- [ ] Docker installed
- [ ] Docker Compose installed
- [ ] Reconnected to instance

---

## 3. Setup SSH Key for GitHub (if using private repo)

**From your local machine**, copy your existing SSH key to EC2:

```bash
# Find your SSH key name (usually id_ed25519 or id_rsa)
ls ~/.ssh/

# Copy your private key to EC2 (replace KEY_NAME with your actual key name)
scp -i your-key.pem ~/.ssh/KEY_NAME ubuntu@<PUBLIC_IP>:~/.ssh/KEY_NAME

# Copy your public key too (replace KEY_NAME with your actual key name)
scp -i your-key.pem ~/.ssh/KEY_NAME.pub ubuntu@<PUBLIC_IP>:~/.ssh/KEY_NAME.pub
```

**Then on the EC2 instance**, fix permissions and test:

```bash
ssh -i your-key.pem ubuntu@<PUBLIC_IP>

# Create .ssh directory and set permissions
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Fix permissions on the keys (replace KEY_NAME with your actual key name)
chmod 600 ~/.ssh/KEY_NAME
chmod 644 ~/.ssh/KEY_NAME.pub

# Test GitHub connection
ssh -T git@github.com
# Should say: "Hi username! You've successfully authenticated..."
```

**Note:** Make sure your public key is already added to your GitHub account (Settings → SSH and GPG keys).

- [ ] SSH key copied to EC2
- [ ] Permissions set correctly
- [ ] GitHub connection tested

---

## 4. Clone & Configure

```bash
ssh -i your-key.pem ubuntu@<PUBLIC_IP>

# Clone repo using SSH (or use HTTPS if repo is public)
git clone git@github.com:YOUR_USERNAME/beach-kings.git
cd beach-kings

# Create environment file
cp .env.example .env
nano .env
```

Edit `.env` with production values:
- [ ] Set strong `POSTGRES_PASSWORD`
- [ ] Set `JWT_SECRET_KEY` (use the one you generated earlier)
- [ ] Set `ENV=production`
- [ ] Add `CREDENTIALS_JSON` (paste entire JSON on one line)
- [ ] Configure Twilio if using SMS

---

## 5. Deploy

```bash
# Build and start containers
docker-compose up -d --build

# Watch logs (Ctrl+C to exit)
docker-compose logs -f
```

- [ ] Containers started successfully
- [ ] Database migrations completed
- [ ] No errors in logs

---

## 6. Verify

```bash
# Check containers are running
docker-compose ps

# Test API health
curl http://localhost:8000/api/health
```

- [ ] All containers showing "Up"
- [ ] Health check returns OK
- [ ] Frontend accessible at `http://<PUBLIC_IP>:3000`
- [ ] Backend API accessible at `http://<PUBLIC_IP>:8000/api/health`

---

## 7. Setup SSL with Let's Encrypt (Recommended)

**Prerequisites:**
- Domain name (e.g., `beachleaguevb.com`) pointing to your EC2 instance's Elastic IP
- DNS records configured (see `DOMAIN_SETUP.md` for GoDaddy setup)

### Step 1: Update Security Group

- [ ] Go to AWS Console → EC2 → Security Groups
- [ ] Add inbound rule: **HTTPS (443)** from anywhere (0.0.0.0/0)
- [ ] Ensure **HTTP (80)** is open (required for Let's Encrypt validation)

### Step 2: Run SSL Setup Script

**On your EC2 instance:**

```bash
ssh -i your-key.pem ubuntu@<PUBLIC_IP>
cd beach-kings

# Run the automated SSL setup script
sudo bash deployment/setup-ssl.sh
```

The script will:
- Install nginx and certbot
- Configure nginx as a reverse proxy to your Docker container
- Obtain SSL certificates from Let's Encrypt
- Set up automatic certificate renewal
- Test the configuration

**Manual setup (if you prefer):**

```bash
# Install nginx and certbot
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Copy nginx config
sudo cp deployment/nginx/beachleaguevb.com.conf /etc/nginx/sites-available/beachleaguevb.com

# Enable the site
sudo ln -s /etc/nginx/sites-available/beachleaguevb.com /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default site

# Test nginx config
sudo nginx -t
sudo systemctl reload nginx

# Obtain SSL certificates
sudo certbot --nginx -d beachleaguevb.com -d www.beachleaguevb.com

# Verify auto-renewal
sudo certbot renew --dry-run
sudo systemctl status certbot.timer
```

- [ ] SSL certificates obtained
- [ ] Site accessible at `https://beachleaguevb.com`
- [ ] HTTP redirects to HTTPS
- [ ] Auto-renewal verified

### How It Works

- **nginx** runs on the EC2 host (not in Docker) and listens on ports 80 and 443
- **Frontend container** (Next.js) runs on port 3000 (internal only)
- **Backend container** (FastAPI) runs on port 8000 (internal only)
- **nginx** acts as a reverse proxy:
  - `/api/*` requests → `localhost:8000` (backend)
  - All other requests → `localhost:3000` (frontend)
- **Let's Encrypt** certificates are stored in `/etc/letsencrypt/`
- **Auto-renewal** runs via systemd timer (checks twice daily, renews when <30 days remaining)

### Troubleshooting SSL Setup

| Issue | Solution |
|-------|----------|
| "Domain not pointing to this server" | Verify DNS records: `nslookup beachleaguevb.com` |
| "Port 80 not accessible" | Check security group allows HTTP (80) from anywhere |
| "nginx test fails" | Check nginx config: `sudo nginx -t` |
| "Certbot fails" | Ensure domain DNS has propagated (can take up to 24 hours) |
| "Can't access site after SSL" | Check security group allows HTTPS (443), verify nginx is running: `sudo systemctl status nginx` |
| "Certificate renewal fails" | Check DNS still points to server, verify port 80 is accessible |

### Useful SSL Commands

```bash
# Check certificate status
sudo certbot certificates

# Manually renew certificates
sudo certbot renew

# Test renewal (dry-run)
sudo certbot renew --dry-run

# Check renewal timer status
sudo systemctl status certbot.timer

# View nginx logs
sudo tail -f /var/log/nginx/beachleaguevb.com.error.log
sudo tail -f /var/log/nginx/beachleaguevb.com.access.log

# Reload nginx after config changes
sudo nginx -t && sudo systemctl reload nginx
```

---

## 8. Setup Backups (Recommended)

```bash
# Create backup directory
mkdir -p ~/backups

# Create backup script
cat > ~/backup.sh << 'EOF'
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec beach-kings-postgres pg_dump -U beachkings -d beachkings | gzip > ~/backups/db_$TIMESTAMP.sql.gz
find ~/backups -name "*.sql.gz" -mtime +7 -delete
echo "Backup complete: db_$TIMESTAMP.sql.gz"
EOF

chmod +x ~/backup.sh

# Schedule daily backup at 2am
(crontab -l 2>/dev/null; echo "0 2 * * * ~/backup.sh") | crontab -
```

- [ ] Backup script created
- [ ] Cron job scheduled

---

## Useful Commands

```bash
# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Stop everything
docker-compose down

# Update to latest code
git pull
docker-compose up -d --build

# Manual backup
~/backup.sh

# Restore from backup
gunzip -c ~/backups/db_TIMESTAMP.sql.gz | docker exec -i beach-kings-postgres psql -U beachkings -d beachkings
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Permission denied" on docker | Run `sudo usermod -aG docker ubuntu` then log out/in |
| Container won't start | Check logs: `docker-compose logs backend` |
| Can't connect to app | Verify security group allows ports 3000/8000 (or 443 if using SSL) |
| Database connection error | Wait for postgres healthcheck, check `docker-compose logs postgres` |
| SSL certificate issues | See SSL troubleshooting section above |


