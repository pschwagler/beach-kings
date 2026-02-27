#!/bin/bash
# SSL Setup Script for beachleaguevb.com (or subdomains like dev.beachleaguevb.com)
# This script installs nginx, certbot, and configures SSL certificates.
# - Root domain: DNS challenge (manual TXT records) for domain + www
# - Subdomains: HTTP-01 challenge (automatic via --nginx), no www
#
# Usage:
#   sudo bash deployment/setup-ssl.sh                          # prod (beachleaguevb.com)
#   sudo bash deployment/setup-ssl.sh dev.beachleaguevb.com    # dev

set -e

DOMAIN="${1:-beachleaguevb.com}"

# Detect if this is a subdomain (contains more than one dot)
IS_SUBDOMAIN=false
if [[ "$DOMAIN" == *.*.* ]]; then
    IS_SUBDOMAIN=true
fi

NGINX_CONFIG_SOURCE="deployment/nginx/${DOMAIN}.conf"
NGINX_CONFIG_DEST="/etc/nginx/sites-available/${DOMAIN}"

# Helper functions
log_info() {
    echo "✅ $1"
}

log_warn() {
    echo "⚠️  $1"
}

log_error() {
    echo "❌ Error: $1"
    exit 1
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run with sudo\n   Usage: sudo bash deployment/setup-ssl.sh"
    fi
}

check_files() {
    if [ ! -f "$NGINX_CONFIG_SOURCE" ]; then
        log_error "nginx config file not found at ${NGINX_CONFIG_SOURCE}\n   Make sure you're running this script from the repository root"
    fi
}

install_packages() {
    echo "📦 Installing nginx and certbot..."
    apt-get update -qq

    if ! command -v nginx &> /dev/null; then
        apt-get install -y nginx
        log_info "nginx installed"
    else
        log_info "nginx already installed"
    fi

    if ! command -v certbot &> /dev/null; then
        apt-get install -y certbot python3-certbot-nginx
        log_info "certbot installed"
    else
        log_info "certbot already installed"
    fi
}

setup_nginx_service() {
    echo "🚀 Starting nginx service..."
    if systemctl is-active --quiet nginx; then
        log_info "nginx is already running"
    else
        systemctl start nginx
        log_info "nginx started"
    fi
    systemctl enable nginx
    log_info "nginx enabled"
}

configure_nginx() {
    echo "📝 Configuring nginx..."

    if [ -f "$NGINX_CONFIG_DEST" ]; then
        log_warn "${NGINX_CONFIG_DEST} already exists"
        read -p "   Do you want to overwrite it? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "   Skipping nginx config copy..."
            return
        fi
    fi

    cp "$NGINX_CONFIG_SOURCE" "$NGINX_CONFIG_DEST"
    log_info "nginx config copied"

    # Enable site
    if [ ! -L "/etc/nginx/sites-enabled/${DOMAIN}" ]; then
        ln -s "$NGINX_CONFIG_DEST" "/etc/nginx/sites-enabled/${DOMAIN}"
        log_info "nginx site enabled"
    fi

    # Remove default site
    if [ -L "/etc/nginx/sites-enabled/default" ]; then
        rm /etc/nginx/sites-enabled/default
        log_info "Default nginx site removed"
    fi

    # Test and reload
    echo "🧪 Testing nginx configuration..."
    if nginx -t; then
        log_info "nginx configuration is valid"
        systemctl reload nginx
        log_info "nginx reloaded"
    else
        log_error "nginx configuration test failed"
    fi
}

obtain_certificates() {
    echo ""

    # Check if certificates already exist
    if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
        log_warn "SSL certificates already exist for ${DOMAIN}"
        read -p "   Do you want to renew them? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            certbot renew
            log_info "Certificates renewed"
            return
        else
            echo "   Skipping certificate generation..."
            return
        fi
    fi

    # Subdomains: use HTTP-01 challenge via nginx plugin (automatic, auto-renewable)
    if [ "$IS_SUBDOMAIN" = true ]; then
        echo "🔐 Obtaining SSL certificate for ${DOMAIN} using HTTP-01 challenge..."
        echo ""
        echo "Let's Encrypt requires an email address for renewal notifications."
        read -p "Enter your email address: " EMAIL
        echo ""

        certbot --nginx -d "${DOMAIN}" \
            --agree-tos --email "${EMAIL}" \
            --non-interactive

        if [ $? -ne 0 ]; then
            log_error "Certificate generation failed"
        fi

        log_info "SSL certificate obtained (HTTP-01 via nginx plugin — auto-renewable)"
        return
    fi

    # Root domain: use DNS challenge (manual TXT records for domain + www)
    echo "🔐 Obtaining SSL certificates from Let's Encrypt using DNS challenge..."
    echo ""

    echo "Let's Encrypt requires an email address for renewal notifications."
    read -p "Enter your email address: " EMAIL
    echo ""

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 DNS CHALLENGE INSTRUCTIONS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Certbot will now show you TXT records to add to your GoDaddy DNS."
    echo ""
    echo "Steps:"
    echo "  1. Certbot will display TXT record values"
    echo "  2. Go to GoDaddy DNS management: https://dcc.godaddy.com/manage/${DOMAIN}/dns"
    echo "  3. Add TXT records:"
    echo "     - Name: _acme-challenge (for ${DOMAIN})"
    echo "     - Name: _acme-challenge.www (for www.${DOMAIN})"
    echo "     - Value: (the value certbot shows you)"
    echo "  4. Wait 1-2 minutes for DNS propagation"
    echo "  5. Press Enter in this terminal to continue"
    echo ""
    echo "Press Enter when you're ready to start the DNS challenge..."
    read
    echo ""

    certbot certonly --manual --preferred-challenges dns \
        -d "${DOMAIN}" -d "www.${DOMAIN}" \
        --agree-tos --email "${EMAIL}" \
        --manual-public-ip-logging-ok

    if [ $? -ne 0 ]; then
        log_error "Certificate generation failed"
    fi

    log_info "SSL certificates obtained successfully"
}

setup_auto_renewal() {
    echo ""
    echo "🔄 Verifying auto-renewal setup..."
    if systemctl is-active --quiet certbot.timer; then
        log_info "certbot renewal timer is active"
    else
        log_warn "certbot timer is not active"
        systemctl enable certbot.timer
        systemctl start certbot.timer
        log_info "certbot timer enabled and started"
    fi

    echo "🧪 Testing certificate renewal (dry-run)..."
    if certbot renew --dry-run > /dev/null 2>&1; then
        log_info "Certificate renewal test passed"
    else
        log_warn "Certificate renewal test failed - you may need to check your DNS configuration"
    fi
}

# Main execution
main() {
    echo "🔒 Setting up SSL for ${DOMAIN}"
    echo "=================================="
    echo ""

    check_root
    check_files
    install_packages
    setup_nginx_service
    configure_nginx
    obtain_certificates
    setup_auto_renewal

    # Final status
    echo ""
    echo "=================================="
    echo "✅ SSL setup complete!"
    echo ""
    echo "Your site should now be accessible at:"
    echo "  - https://${DOMAIN}"
    if [ "$IS_SUBDOMAIN" = false ]; then
        echo "  - https://www.${DOMAIN}"
    fi
    echo ""
    echo "HTTP traffic will automatically redirect to HTTPS."
    echo ""
    echo "Certificate auto-renewal is configured and will run automatically."
    echo "You can check renewal status with: sudo systemctl status certbot.timer"
    echo ""
}

main "$@"
