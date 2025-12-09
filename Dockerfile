# Use Python 3.11 slim image
FROM python:3.11-slim

# Install Node.js, bash, Chromium dependencies for WhatsApp Web.js, and PostgreSQL client
RUN apt-get update && apt-get install -y \
    curl \
    bash \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    postgresql-client \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set working directory
WORKDIR /app

# Copy Python requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Frontend build removed - handled by separate frontend service

# Copy WhatsApp service and install dependencies
COPY whatsapp-service/package*.json ./whatsapp-service/
RUN cd whatsapp-service && npm install

COPY whatsapp-service ./whatsapp-service

# Copy backend code
COPY backend ./backend

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Conditionally copy credentials file if it exists (for local development)
# In production (Railway), credentials should be provided via CREDENTIALS_JSON env var
# Using bracket notation makes the COPY optional - won't fail if file doesn't exist
COPY credentials.jso[n] ./

# Environment variable to control WhatsApp service (default: enabled)
ENV ENABLE_WHATSAPP=true

# Expose ports (8000 for backend, 3001 for WhatsApp)
EXPOSE 8000 3001

# Use entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]

