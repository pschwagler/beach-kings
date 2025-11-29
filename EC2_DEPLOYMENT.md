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
  - HTTP (80) - Anywhere
  - Custom TCP (8000) - Anywhere
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
- [ ] App accessible at `http://<PUBLIC_IP>:8000`

---

## 7. Setup Backups (Recommended)

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
| Can't connect to app | Verify security group allows port 8000 |
| Database connection error | Wait for postgres healthcheck, check `docker-compose logs postgres` |


