#!/bin/bash
# One-time bootstrap script for dev EC2 instance.
# Installs Docker, Docker Compose, nginx, certbot, creates swap, snapshot dir.
#
# Usage: sudo bash deployment/dev/setup-dev-ec2.sh

set -e

log_info() { echo "✅ $1"; }
log_warn() { echo "⚠️  $1"; }

# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------
if [ "$EUID" -ne 0 ]; then
    echo "❌ This script must be run with sudo"
    exit 1
fi

echo "🏐 Beach League — Dev EC2 Bootstrap"
echo "==================================="
echo ""

# ---------------------------------------------------------------------------
# System updates
# ---------------------------------------------------------------------------
echo "📦 Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq
log_info "System packages updated"

# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------
echo ""
echo "🐳 Installing Docker..."
if command -v docker &> /dev/null; then
    log_info "Docker already installed ($(docker --version))"
else
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
        gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
      https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -qq
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    log_info "Docker installed"
fi

# Add ubuntu user to docker group
usermod -aG docker ubuntu 2>/dev/null || true
log_info "ubuntu user added to docker group"

# ---------------------------------------------------------------------------
# nginx
# ---------------------------------------------------------------------------
echo ""
echo "🌐 Installing nginx..."
if command -v nginx &> /dev/null; then
    log_info "nginx already installed"
else
    apt-get install -y nginx
    log_info "nginx installed"
fi

systemctl enable nginx
systemctl start nginx
log_info "nginx enabled and started"

# ---------------------------------------------------------------------------
# Certbot
# ---------------------------------------------------------------------------
echo ""
echo "🔐 Installing certbot..."
if command -v certbot &> /dev/null; then
    log_info "certbot already installed"
else
    apt-get install -y certbot python3-certbot-nginx
    log_info "certbot installed"
fi

# ---------------------------------------------------------------------------
# Swap (4GB)
# ---------------------------------------------------------------------------
echo ""
echo "💾 Configuring 4GB swap..."
if swapon --show | grep -q "/swapfile"; then
    log_info "Swap already configured"
else
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
    log_info "4GB swap created and enabled"
fi

# ---------------------------------------------------------------------------
# Snapshot directory
# ---------------------------------------------------------------------------
echo ""
echo "📁 Creating snapshot directory..."
mkdir -p /home/ubuntu/snapshots
chown ubuntu:ubuntu /home/ubuntu/snapshots
log_info "~/snapshots directory ready"

# ---------------------------------------------------------------------------
# Clone repo (if not already present)
# ---------------------------------------------------------------------------
echo ""
echo "📂 Checking for repository..."
if [ -d /home/ubuntu/beach-kings ]; then
    log_info "Repository already exists at ~/beach-kings"
else
    log_warn "Repository not found at ~/beach-kings"
    echo "   Clone it manually: git clone <repo-url> ~/beach-kings"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "==================================="
echo "✅ Bootstrap complete!"
echo ""
echo "Next steps:"
echo "  1. Clone repo if not done: git clone <url> ~/beach-kings"
echo "  2. Copy nginx config:"
echo "     sudo cp ~/beach-kings/deployment/dev/nginx/dev.beachleaguevb.com.conf /etc/nginx/sites-available/"
echo "     sudo ln -s /etc/nginx/sites-available/dev.beachleaguevb.com.conf /etc/nginx/sites-enabled/"
echo "     sudo rm -f /etc/nginx/sites-enabled/default"
echo "     sudo nginx -t && sudo systemctl reload nginx"
echo "  3. SSL: sudo certbot --nginx -d dev.beachleaguevb.com"
echo "  4. Basic auth: sudo htpasswd -c /etc/nginx/.htpasswd <username>"
echo ""
