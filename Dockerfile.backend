# Runtime-only image; the retired WhatsApp service no longer needs Node.js.
FROM python:3.11-slim AS runtime

RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends \
    bash postgresql-client \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements-runtime.lock .
RUN python -m pip install --no-cache-dir --require-hashes -r requirements-runtime.lock \
    && python -m pip uninstall -y pip setuptools wheel
COPY apps/backend ./backend
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]

# Local debugging remains available without shipping development tools.
FROM runtime AS development
COPY requirements*.txt requirements-runtime.lock ./
RUN python -m ensurepip --upgrade \
    && python -m pip install --no-cache-dir -r requirements-dev.txt

FROM runtime AS production
