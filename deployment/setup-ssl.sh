#!/bin/bash
# SSL Setup Script for beachleaguevb.com
# This script installs nginx, certbot, and configures SSL certificates
# Run this script on your EC2 instance with sudo privileges

set -e

DOMAIN="beachleaguevb.com"
NGINX_CONFIG_SOURCE="deployment/nginx/${DOMAIN}.conf"
NGINX_CONFIG_DEST="/etc/nginx/sites-available/${DOMAIN}"

echo "🔒 Setting up SSL for ${DOMAIN}"
echo "=================================="
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Error: This script must be run with sudo"
    echo "   Usage: sudo bash deployment/setup-ssl.sh"
    exit 1
fi

# Check if we're in the correct directory
if [ ! -f "$NGINX_CONFIG_SOURCE" ]; then
    echo "❌ Error: nginx config file not found at ${NGINX_CONFIG_SOURCE}"
    echo "   Make sure you're running this script from the repository root"
    exit 1
fi

# Step 1: Update system packages
echo "📦 Updating system packages..."
apt-get update -qq

# Step 2: Install nginx and certbot
echo "📦 Installing nginx and certbot..."
if ! command -v nginx &> /dev/null; then
    apt-get install -y nginx
    echo "✅ nginx installed"
else
    echo "✅ nginx already installed"
fi

if ! command -v certbot &> /dev/null; then
    apt-get install -y certbot python3-certbot-nginx
    echo "✅ certbot installed"
else
    echo "✅ certbot already installed"
fi

# Step 3: Start and enable nginx (if not already running)
echo "🚀 Starting nginx service..."
if systemctl is-active --quiet nginx; then
    echo "✅ nginx is already running"
else
    systemctl start nginx
    echo "✅ nginx started"
fi
systemctl enable nginx
echo "✅ nginx enabled"

# Step 4: Copy nginx configuration
echo "📝 Configuring nginx..."
if [ -f "$NGINX_CONFIG_DEST" ]; then
    echo "⚠️  Warning: ${NGINX_CONFIG_DEST} already exists"
    read -p "   Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "   Skipping nginx config copy..."
    else
        cp "$NGINX_CONFIG_SOURCE" "$NGINX_CONFIG_DEST"
        echo "✅ nginx config copied"
    fi
else
    cp "$NGINX_CONFIG_SOURCE" "$NGINX_CONFIG_DEST"
    echo "✅ nginx config copied"
fi

# Step 5: Create symlink to enable site
if [ ! -L "/etc/nginx/sites-enabled/${DOMAIN}" ]; then
    ln -s "$NGINX_CONFIG_DEST" "/etc/nginx/sites-enabled/${DOMAIN}"
    echo "✅ nginx site enabled"
else
    echo "✅ nginx site already enabled"
fi

# Step 6: Remove default nginx site if it exists
if [ -L "/etc/nginx/sites-enabled/default" ]; then
    rm /etc/nginx/sites-enabled/default
    echo "✅ Default nginx site removed"
fi

# Step 7: Test nginx configuration
echo "🧪 Testing nginx configuration..."
if nginx -t; then
    echo "✅ nginx configuration is valid"
    systemctl reload nginx
    echo "✅ nginx reloaded"
else
    echo "❌ Error: nginx configuration test failed"
    exit 1
fi

# Step 8: Obtain SSL certificates with certbot
echo ""
echo "🔐 Obtaining SSL certificates from Let's Encrypt..."
echo ""

# Check if certificates already exist
if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
    echo "⚠️  SSL certificates already exist for ${DOMAIN}"
    read -p "   Do you want to renew them? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        certbot renew
        echo "✅ Certificates renewed"
    else
        echo "   Skipping certificate generation..."
    fi
else
    # Prompt for email address (required by Let's Encrypt)
    echo "Let's Encrypt requires an email address for renewal notifications."
    read -p "Enter your email address: " EMAIL
    echo ""
    
    certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos --email "${EMAIL}" --redirect
    echo "✅ SSL certificates obtained and configured"
fi

# Step 9: Verify auto-renewal setup
echo ""
echo "🔄 Verifying auto-renewal setup..."
if systemctl is-active --quiet certbot.timer; then
    echo "✅ certbot renewal timer is active"
else
    echo "⚠️  Warning: certbot timer is not active"
    systemctl enable certbot.timer
    systemctl start certbot.timer
    echo "✅ certbot timer enabled and started"
fi

# Step 10: Test certificate renewal
echo "🧪 Testing certificate renewal (dry-run)..."
if certbot renew --dry-run > /dev/null 2>&1; then
    echo "✅ Certificate renewal test passed"
else
    echo "⚠️  Warning: Certificate renewal test failed"
    echo "   You may need to check your DNS configuration"
fi

# Final status
echo ""
echo "=================================="
echo "✅ SSL setup complete!"
echo ""
echo "Your site should now be accessible at:"
echo "  - https://${DOMAIN}"
echo "  - https://www.${DOMAIN}"
echo ""
echo "HTTP traffic will automatically redirect to HTTPS."
echo ""
echo "Certificate auto-renewal is configured and will run automatically."
echo "You can check renewal status with: sudo systemctl status certbot.timer"
echo ""

