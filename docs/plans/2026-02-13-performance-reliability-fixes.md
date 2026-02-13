# Performance & Reliability Fixes - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix performance issues with streaming downloads, Docker security, and deprecated dependencies.

**Architecture:** Stream video downloads, secure/unexpose render port, update Dockerfile with modern keyring approach.

**Tech Stack:** Node.js streams, Docker, BullMQ

---

## Task 1: Update Streaming Download for BullMQ

**Files:**

- Modify: `app/services/render-server.ts` (download endpoint)

**Issue:** Entire video loaded into RAM causing OOM for large videos.

**Step 1:** Stream video file using BullMQ job data

```typescript
import { createReadStream, stat } from "fs";
import { promisify } from "util";

const statAsync = promisify(stat);

app.get("/download/:jobId", async (req, res) => {
  const { jobId } = req.params;

  try {
    // Get job from BullMQ
    const job = await renderQueue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const state = await job.getState();
    if (state !== "completed") {
      return res.status(400).json({
        error: "Video not ready",
        status: state,
        progress: job.progress,
      });
    }

    const outputFile = job.returnvalue?.outputFile;
    if (!outputFile) {
      return res.status(404).json({ error: "Output file not found" });
    }

    const stats = await statAsync(outputFile);

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", stats.size);
    res.setHeader("Content-Disposition", `attachment; filename="render-${jobId}.mp4"`);

    const stream = createReadStream(outputFile);
    stream.pipe(res);

    stream.on("error", (error) => {
      console.error(`[Download Error] Job ${jobId}:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to stream video" });
      }
    });
  } catch (error) {
    console.error(`[Download Error] Job ${jobId}:`, error);
    res.status(500).json({ error: "Failed to access video file" });
  }
});
```

---

## Task 2: Remove/Unexpose Render Service Port

**Files:**

- Modify: `docker-compose.yml`

**Issue:** Port 8080 exposed without auth allows anyone to trigger expensive renders.

The whole project is intended to be deployed with docker compose, so the app server should only be able to communicate with the docker server using a docker network

**Step 1:** Remove port exposure from docker-compose

```yaml
services:
  render:
    build:
      context: .
      dockerfile: Dockerfile.render
    # Port is NOT exposed - only accessible within docker network
    environment:
      - REDIS_URL=redis://redis:6379
      - RENDER_SERVER_PORT=8080
      - RENDER_API_TOKEN=${RENDER_API_TOKEN}
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - app-network
```

**Step 2:** Add comment about internal access

```yaml
# Render service is NOT exposed externally
# Only accessible from app service via docker network
# Access through: http://render:8080 (internal DNS)
```

---

## Task 3: Fix Deprecated apt-key in Dockerfile

**Files:**

- Modify: `Dockerfile.render:15-25`

**Issue:** apt-key is deprecated and will break in future Debian versions.

**Step 1:** Replace apt-key with modern keyring approach

```dockerfile
# Install Chrome dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Add Chrome repository using modern keyring method
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | \
    gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list

RUN apt-get update && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
```

---

## Task 4: Add Redis Persistence Volume

**Files:**

- Modify: `docker-compose.yml`

**Step 1:** Ensure Redis has persistent storage

```yaml
services:
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  redis-data:
```

---

## Task 5: Commit Changes

```bash
git add app/services/render-server.ts docker-compose.yml Dockerfile.render
git commit -m "feat: improve render service performance and security

- Stream video downloads instead of loading to RAM
- Remove render service port exposure (internal only)
- Fix deprecated apt-key in Dockerfile (use keyrings)
- Add Redis persistence for job queue durability"
```
