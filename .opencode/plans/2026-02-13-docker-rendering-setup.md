# Docker Rendering Setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Docker-based rendering service using Remotion with headless Chrome for video rendering as an alternative to AWS Lambda.

**Architecture:** Build a standalone render service that runs in a Docker container with Chrome installed. The service exposes an HTTP API to accept render jobs, processes them using `@remotion/renderer` with headless Chrome, stores results in R2 storage, and provides progress tracking.

**Tech Stack:** Node.js, Remotion Renderer, Puppeteer/Chrome Headless, Express/Fastify, R2 Storage, Docker

---

## Prerequisites

**Docs to review:**

- [Remotion Docker Documentation](https://www.remotion.dev/docs/docker)
- Current Lambda implementation: `app/services/lambda-render.server.ts`
- Current video composition: `app/videorender/Composition.tsx`

**Key insight:** The current `Dockerfile.backend` is broken - it references `app/videorender/videorender.ts` which doesn't exist. We need to create a proper render service from scratch.

---

## Task 1: Create Render Service Entry Point

**Files:**

- Create: `app/services/render-server.ts`
- Test: `scripts/test-render-server.sh`

**Step 1: Create the render service HTTP server**

```typescript
// app/services/render-server.ts
import express from "express";
import { renderMedia, openBrowser, provideSchema } from "@remotion/renderer";
import { webpackOverride } from "@remotion/bundler";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { uploadToR2 } from "../lib/r2-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// In-memory job storage (replace with Redis/DB for production)
const jobs = new Map<string, RenderJob>();

interface RenderJob {
  id: string;
  status: "pending" | "rendering" | "completed" | "failed";
  progress: number;
  outputUrl?: string;
  error?: string;
  input: RenderInput;
}

interface RenderInput {
  timelineData: unknown[];
  compositionWidth: number;
  compositionHeight: number;
  durationInFrames: number;
  scenes?: unknown[];
  variableValues?: Record<string, string>;
}

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start render job
app.post("/render", async (req, res) => {
  const jobId = crypto.randomUUID();
  const input = req.body as RenderInput;

  // Validate input
  if (!input.timelineData || !input.compositionWidth || !input.compositionHeight || !input.durationInFrames) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const job: RenderJob = {
    id: jobId,
    status: "pending",
    progress: 0,
    input,
  };

  jobs.set(jobId, job);

  // Start render asynchronously
  renderJob(job).catch(console.error);

  res.json({ renderId: jobId });
});

// Get render progress
app.get("/render/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }

  res.json({
    done: job.status === "completed" || job.status === "failed",
    status: job.status,
    progress: job.progress,
    outputFile: job.outputUrl,
    errors: job.error ? [job.error] : undefined,
  });
});

async function renderJob(job: RenderJob): Promise<void> {
  const outputPath = path.join("/tmp", `${job.id}.mp4`);

  try {
    job.status = "rendering";

    const bundleLocation = path.join(__dirname, "../videorender");

    const { renderMedia: render } = await import("@remotion/renderer");

    await render({
      composition: {
        id: "TimelineComposition",
        durationInFrames: job.input.durationInFrames,
        fps: 30,
        width: job.input.compositionWidth,
        height: job.input.compositionHeight,
      },
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: {
        timelineData: job.input.timelineData,
        compositionWidth: job.input.compositionWidth,
        compositionHeight: job.input.compositionHeight,
        durationInFrames: job.input.durationInFrames,
        scenes: job.input.scenes,
        variableValues: job.input.variableValues,
      },
      onProgress: ({ progress }) => {
        job.progress = progress;
      },
    });

    // Upload to R2
    const fileBuffer = await fs.promises.readFile(outputPath);
    const r2Key = `renders/${job.id}.mp4`;
    await uploadToR2(r2Key, fileBuffer, "video/mp4");

    // Clean up local file
    await fs.promises.unlink(outputPath);

    job.status = "completed";
    job.outputUrl = `${process.env.R2_PUBLIC_URL}/${r2Key}`;
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    console.error(`Render job ${job.id} failed:`, error);
  }
}

const PORT = process.env.RENDER_SERVER_PORT || 8080;
app.listen(PORT, () => {
  console.log(`Render server listening on port ${PORT}`);
});
```

**Step 2: Install required dependencies**

Add to `package.json` dependencies:

```json
{
  "express": "^4.18.2"
}
```

Run: `pnpm install`

**Step 3: Create test script**

```bash
#!/bin/bash
# scripts/test-render-server.sh

echo "Testing render server..."

# Health check
curl http://localhost:8080/health

# Test render (requires valid input)
curl -X POST http://localhost:8080/render \
  -H "Content-Type: application/json" \
  -d '{
    "timelineData": [],
    "compositionWidth": 1920,
    "compositionHeight": 1080,
    "durationInFrames": 30
  }'
```

Run: `chmod +x scripts/test-render-server.sh`

**Step 4: Commit**

```bash
git add app/services/render-server.ts scripts/test-render-server.sh package.json pnpm-lock.yaml
git commit -m "feat: create Docker render service HTTP server"
```

---

## Task 2: Create Production-Ready Dockerfile for Rendering

**Files:**

- Create: `Dockerfile.render`
- Modify: `.dockerignore`

**Step 1: Create Dockerfile based on Remotion's recommended setup**

```dockerfile
# Dockerfile.render
# Multi-stage build for Remotion rendering service with Chrome headless

FROM node:22-bookworm-slim AS base

# Install Chrome dependencies and Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    --no-install-recommends \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Chrome path for Remotion
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy source code
COPY . .

# Build Remotion bundle
RUN pnpm exec remotion bundle app/videorender/index.ts --out-dir=/app/bundle

# Create output directory
RUN mkdir -p /tmp/renders

# Expose render server port
EXPOSE 8080

# Run render server
CMD ["node", "--experimental-vm-modules", "app/services/render-server.ts"]
```

**Step 2: Update .dockerignore to exclude unnecessary files**

```
# .dockerignore - add these if not present
node_modules
out
.git
.github
.env
.env.local
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.DS_Store
dist
build
```

**Step 3: Build and test the Docker image locally**

```bash
# Build the image
docker build -f Dockerfile.render -t kimu-render:latest .

# Test the build
docker run --rm -p 8080:8080 \
  -e R2_ACCOUNT_ID=test \
  -e R2_ACCESS_KEY_ID=test \
  -e R2_SECRET_ACCESS_KEY=test \
  -e R2_BUCKET_NAME=test \
  kimu-render:latest
```

Expected output: Server starts, health endpoint responds

**Step 4: Commit**

```bash
git add Dockerfile.render .dockerignore
git commit -m "feat: add production Dockerfile for render service"
```

---

## Task 3: Update Docker Compose for Render Service

**Files:**

- Modify: `docker-compose.yml`

**Step 1: Add render service to docker-compose**

```yaml
# Add to docker-compose.yml services section:

  render:
    build:
      context: .
      dockerfile: Dockerfile.render
    container_name: kimu-render
    env_file:
      - .env
    environment:
      NODE_ENV: production
      RENDER_SERVER_PORT: 8080
      # R2 credentials from .env
    ports:
      - "8080:8080"
    volumes:
      - render-output:/tmp/renders
    # Resource limits for video rendering
    mem_limit: 4g
    memswap_limit: 4g
    shm_size: 2g
    restart: unless-stopped

# Add to volumes section:
volumes:
  render-output:
```

**Step 2: Test the compose setup**

```bash
# Build and start only the render service
docker-compose up --build render

# In another terminal, test health endpoint
curl http://localhost:8080/health
```

Expected: `{"status":"ok","timestamp":"..."}`

**Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add render service to docker-compose"
```

---

## Task 4: Update Environment Variables

**Files:**

- Modify: `.env.example`

**Step 1: Add render service configuration**

```bash
# Add to .env.example:

# Docker Render Service Configuration
RENDER_SERVER_PORT=8080
RENDER_SERVER_URL=http://localhost:8080  # Internal URL for render service
ENABLE_DOCKER_RENDER=false  # Set to true to use Docker rendering instead of Lambda
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add render service environment variables"
```

---

## Task 5: Documentation

**Files:**

- Create: `docs/architecture/docker-rendering.md`

**Step 1: Write documentation**

````markdown
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
````

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

````

**Step 2: Commit**

```bash
git add docs/architecture/docker-rendering.md
git commit -m "docs: add Docker rendering architecture documentation"
````

---

## Summary

This plan sets up a complete Docker-based rendering service:

1. **Render Service** (`app/services/render-server.ts`) - HTTP API for render jobs
2. **Dockerfile** (`Dockerfile.render`) - Production container with Chrome
3. **Docker Compose** - Integrated with existing services
4. **Environment Config** - New variables for render service
5. **Documentation** - Usage and troubleshooting guide

**Next:** Implement Plan 2 to create the adapter pattern for switching between Lambda and Docker rendering.
