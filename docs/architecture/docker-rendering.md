# Docker-Based Video Rendering

## Overview

This document describes the Docker-based video rendering setup as an alternative to AWS Lambda rendering.

## Architecture

The Docker render service runs as a standalone container with:

- Express HTTP server on port 8080
- Chrome headless browser for video composition
- Direct access to R2 storage for output

## Usage

### Starting the Render Service

```bash
# Using Docker Compose (recommended)
docker-compose up render

# Or build and run manually
docker build -f Dockerfile.render -t kimu-render .
docker run -p 8080:8080 --env-file .env kimu-render
```

### API Endpoints

- `GET /health` - Health check
- `POST /render` - Start a render job
- `GET /render/:jobId` - Get render progress

### Configuration

Set `ENABLE_DOCKER_RENDER=true` in your `.env` file to use Docker rendering instead of Lambda.

## Resource Requirements

- Memory: 4GB minimum (configured in docker-compose.yml)
- Shared memory: 2GB (for Chrome)
- CPU: 2+ cores recommended

## Troubleshooting

### Chrome crashes

Increase `shm_size` in docker-compose.yml (Chrome needs shared memory for GPU acceleration).

### Out of memory

Increase `mem_limit` in docker-compose.yml.

### Slow renders

Ensure the container has access to sufficient CPU cores.
