# Use Python 3.11 slim image
FROM python:3.11-slim

# Install Node.js, bash, and PostgreSQL client
# Chromium dependencies for WhatsApp Web.js are commented out (WhatsApp service is inactive)
RUN apt-get update && apt-get install -y \
    curl \
    bash \
    # chromium \
    # chromium-sandbox \
    # fonts-liberation \
    # libappindicator3-1 \
    # libasound2 \
    # libatk-bridge2.0-0 \
    # libatk1.0-0 \
    # libcups2 \
    # libdbus-1-3 \
    # libnspr4 \
    # libnss3 \
    # libx11-xcb1 \
    # libxcomposite1 \
    # libxdamage1 \
    # libxrandr2 \
    # xdg-utils \
    postgresql-client \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use system Chromium (commented out - WhatsApp service is inactive)
# ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
#     PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set working directory
WORKDIR /app

# Copy Python requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Frontend build removed - handled by separate frontend service

# Copy WhatsApp service and install dependencies (commented out - WhatsApp service is inactive)
# COPY services/whatsapp/package*.json ./services/whatsapp/
# RUN cd services/whatsapp && npm install
# 
# COPY services/whatsapp ./services/whatsapp

# Copy backend code (from apps/backend to maintain backend.* import structure)
COPY apps/backend ./backend

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Conditionally copy credentials file if it exists (for local development)
# In production, credentials should be provided via CREDENTIALS_JSON env var
# Bracket notation makes the COPY optional — won't fail if file doesn't exist
COPY credentials.jso[n] ./

# Environment variable to control WhatsApp service (commented out - WhatsApp service is inactive)
# ENV ENABLE_WHATSAPP=true

# Expose ports (8000 for backend, 3001 for WhatsApp - WhatsApp port commented out)
EXPOSE 8000
# EXPOSE 3001  # WhatsApp service is inactive

# Use entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]

