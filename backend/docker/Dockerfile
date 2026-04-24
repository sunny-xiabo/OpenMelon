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
COPY pyproject.toml uv.lock ./
# Sync dependencies securely from the lock file
RUN uv sync --frozen --no-cache --no-dev --no-install-project

# Copy application code
COPY app/ ./app
COPY config/ ./config

# Expose API port
EXPOSE 8000

# 禁用 Python 的标准输出缓冲，确保日志能实时打印到终端
ENV PYTHONUNBUFFERED=1

# Start the application using uv run to ensure it uses the created virtual environment
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
# Run as a non-root user for security
RUN adduser --system --group appuser && chown -R appuser:appuser /app
USER appuser

# Run using uv to auto-activate the virtual environment
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
