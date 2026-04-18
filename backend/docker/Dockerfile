FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# The following line installs uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install Python dependencies first for better Docker layer caching
COPY requirements.txt ./
# Use uv for faster installations
RUN uv pip install --system --no-cache -r requirements.txt

# Copy application code
COPY app/ ./app
COPY config/ ./config

# Expose API port
EXPOSE 8000

# Run as a non-root user for security
RUN adduser --system --group appuser && chown -R appuser:appuser /app
USER appuser

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
