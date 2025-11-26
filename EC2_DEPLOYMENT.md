# EC2 Deployment Checklist

## Pre-Deployment

- [ ] AWS account created
- [ ] SSH key pair created in AWS console (or upload existing)
- [ ] Google Sheets API credentials ready (`credentials.json`)
- [ ] Generate secure JWT secret: `openssl rand -hex 32`

---

## 1. Launch EC2 Instance

- [ ] Go to AWS Console → EC2 → Launch Instance
- [ ] **AMI:** Amazon Linux 2023
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
# Connect to instance
ssh -i your-key.pem ec2-user@<PUBLIC_IP>

# Install Docker
sudo yum update -y
sudo yum install -y docker git
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# IMPORTANT: Log out and back in for docker group to take effect
exit
```

- [ ] Docker installed
- [ ] Docker Compose installed
- [ ] Reconnected to instance

---

## 3. Clone & Configure

```bash
ssh -i your-key.pem ec2-user@<PUBLIC_IP>

# Clone repo
git clone https://github.com/YOUR_USERNAME/beach-kings.git
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

## 4. Deploy

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

## 5. Verify

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

## 6. Setup Backups (Recommended)

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
| "Permission denied" on docker | Run `sudo usermod -aG docker ec2-user` then log out/in |
| Container won't start | Check logs: `docker-compose logs backend` |
| Can't connect to app | Verify security group allows port 8000 |
| Database connection error | Wait for postgres healthcheck, check `docker-compose logs postgres` |

