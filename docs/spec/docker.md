# Docker Deployment Spec

Status: draft | Updated: 2026-03-04

All Docker configs live in root `docker/` directory for unified management.

## Container Architecture

| Container | Image Base | Port | Lifecycle |
|-----------|-----------|------|-----------|
| backend | python:3.13-slim | 8000 (internal) | Always runs |
| web | nginx:1.27-alpine | 8001 (external) | Always runs, depends on backend |
| cortex | nvidia/cuda + onnxruntime-gpu | 9100 | Separate lifecycle, optional |

## File Layout

```
docker/
├── Dockerfile                  # Multi-stage: backend + web targets
├── Dockerfile.cortex           # Cortex GPU service
├── docker-compose.yml          # backend + web (always runs)
├── docker-compose.cortex.yml   # cortex (separate lifecycle)
└── nginx.conf                  # nginx reverse proxy config
```

## docker-compose.yml (backend + web)

```yaml
version: "3.9"

services:
  backend:
    build:
      context: ..
      dockerfile: docker/Dockerfile
      target: backend
    env_file:
      - ../.env
    environment:
      ENV: prod
      DATABASE_URL: sqlite+aiosqlite:///../data/toolii.db
      FILE_STORAGE_DIR: ../data/files
    volumes:
      - ../data:/app/data
    expose:
      - "8000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"]
      interval: 5s
      timeout: 5s
      retries: 30
      start_period: 30s

  web:
    build:
      context: ..
      dockerfile: docker/Dockerfile
      target: web
    ports:
      - "127.0.0.1:8001:8001"
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
```

## docker-compose.cortex.yml (GPU, separate lifecycle)

```yaml
version: "3.9"

services:
  cortex:
    build:
      context: ..
      dockerfile: docker/Dockerfile.cortex
    ports:
      - "9100:9100"
    volumes:
      - ../data/cortex:/app/data
    environment:
      CORTEX_DATA_DIR: /app/data
      CORTEX_LOG_LEVEL: INFO
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:9100/health')"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s
```

## Dockerfile.cortex

```dockerfile
FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.13 python3.13-venv python3-pip \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

WORKDIR /app/cortex
COPY cortex/ ./
RUN uv sync --no-dev

EXPOSE 9100
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9100"]
```

## Volume Mounts

| Volume | Container | Mount | Purpose |
|--------|-----------|-------|---------|
| `../data` | backend | `/app/data` | SQLite DB, uploaded files, FaceNet512 ONNX |
| `../data/cortex` | cortex | `/app/data` | GPU ONNX models, stats, VRAM profile |

## Networking

- **Local dev**: Backend uses `CORTEX_URL=http://localhost:9100`
- **Docker compose**: If running both compose files with shared network,
  Backend uses `CORTEX_URL=http://cortex:9100`

## Operations

```bash
# Start backend + web
docker compose -f docker/docker-compose.yml up -d

# Start cortex (separate)
docker compose -f docker/docker-compose.cortex.yml up -d

# View logs
docker compose -f docker/docker-compose.yml logs -f backend
docker compose -f docker/docker-compose.cortex.yml logs -f cortex

# Rebuild after code change
docker compose -f docker/docker-compose.yml build backend
docker compose -f docker/docker-compose.cortex.yml build cortex
```
