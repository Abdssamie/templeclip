# Critical Runtime Fixes - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix critical runtime issues using BullMQ for reliable job processing.

**Architecture:** Replace in-memory Map with BullMQ queue backed by Redis for persistence, retries, and proper cleanup.

**Tech Stack:** TypeScript, BullMQ, Redis, ioredis

---

## Task 1: Add BullMQ Dependencies

**Files:**

- Modify: `package.json`

**Step 1:** Add BullMQ and ioredis

```bash
pnpm add bullmq ioredis
```

---

## Task 2: Add Missing Crypto Import

**Files:**

- Modify: `app/services/render-server.ts:1-10`

**Step 1:** Add crypto import

```typescript
import express from "express";
import cors from "cors";
import { createWriteStream } from "fs";
import { mkdir, access } from "fs/promises";
import { join } from "path";
import { renderMedia } from "@remotion/renderer";
import { Queue, Worker, Job as BullJob } from "bullmq";
import Redis from "ioredis";
import { crypto } from "node:crypto";

const app = express();
```

---

## Task 3: Setup BullMQ Queue and Redis Connection

**Files:**

- Modify: `app/services/render-server.ts:15-40`

**Step 1:** Initialize Redis and BullMQ queue

```typescript
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });

interface RenderJobData {
  timelineData: unknown[];
  scenes: unknown[];
  width: number;
  height: number;
  durationInSeconds: number;
  outputFormat: string;
}

interface RenderJobResult {
  outputFile: string;
}

const renderQueue = new Queue<RenderJobData, RenderJobResult>("video-render", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 60 * 60, // 24 hours
      count: 100,
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60, // 7 days
    },
  },
});

// Track job status for API responses
const jobStatusCache = new Map<
  string,
  {
    status: "queued" | "active" | "completed" | "failed";
    progress: number;
    outputFile?: string;
    error?: string;
  }
>();
```

---

## Task 4: Create BullMQ Worker for Render Processing

**Files:**

- Modify: `app/services/render-server.ts:45-80`

**Step 1:** Implement worker with progress tracking

```typescript
const RENDER_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const renderWorker = new Worker<RenderJobData, RenderJobResult>(
  "video-render",
  async (job) => {
    const { timelineData, scenes, width, height, durationInSeconds, outputFormat } = job.data;

    // Update cache
    jobStatusCache.set(job.id!, { status: "active", progress: 0 });

    const outputDir = join(process.cwd(), "renders");
    await mkdir(outputDir, { recursive: true });
    const outputFile = join(outputDir, `${job.id}.${outputFormat}`);

    const composition = {
      id: "video",
      durationInFrames: Math.ceil(durationInSeconds * 30),
      fps: 30,
      width,
      height,
      defaultProps: { timelineData, scenes },
    };

    await renderMedia({
      composition,
      serveUrl: process.env.REMOTION_SERVE_URL!,
      codec: outputFormat === "webm" ? "vp8" : "h264",
      outputLocation: outputFile,
      timeoutInMilliseconds: RENDER_TIMEOUT_MS,
      onProgress: ({ progress }) => {
        job.updateProgress(Math.round(progress * 100));
        jobStatusCache.set(job.id!, {
          status: "active",
          progress: Math.round(progress * 100),
        });
      },
    });

    return { outputFile };
  },
  {
    connection: redis,
    concurrency: 2, // Max 2 concurrent renders
    limiter: {
      max: 10,
      duration: 60000, // 10 per minute
    },
  },
);

// Handle completed jobs
renderWorker.on("completed", (job, result) => {
  jobStatusCache.set(job.id, {
    status: "completed",
    progress: 100,
    outputFile: result.outputFile,
  });
  console.log(`[Job ${job.id}] Render completed: ${result.outputFile}`);
});

// Handle failed jobs
renderWorker.on("failed", (job, err) => {
  jobStatusCache.set(job.id!, {
    status: "failed",
    progress: 0,
    error: err.message,
  });
  console.error(`[Job ${job.id}] Render failed:`, err);
});
```

---

## Task 5: Update API Endpoints to Use BullMQ

**Files:**

- Modify: `app/services/render-server.ts` (render and status endpoints)

**Step 1:** Update render endpoint to add jobs to queue

```typescript
app.post("/render", async (req, res) => {
  try {
    const jobData: RenderJobData = req.body;

    const job = await renderQueue.add("render-video", jobData, {
      jobId: crypto.randomUUID(),
    });

    jobStatusCache.set(job.id, { status: "queued", progress: 0 });

    res.json({
      jobId: job.id,
      status: "queued",
      message: "Render job queued successfully",
    });
  } catch (error) {
    console.error("[Queue Error]", error);
    res.status(500).json({ error: "Failed to queue render job" });
  }
});

// Get job status
app.get("/status/:jobId", async (req, res) => {
  const { jobId } = req.params;

  try {
    // Check cache first
    const cached = jobStatusCache.get(jobId);
    if (cached) {
      return res.json({ jobId, ...cached });
    }

    // Check BullMQ for job state
    const job = await renderQueue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const state = await job.getState();
    const progress = job.progress || 0;

    res.json({
      jobId,
      status: state,
      progress,
      outputFile: job.returnvalue?.outputFile,
      error: job.failedReason,
    });
  } catch (error) {
    console.error("[Status Error]", error);
    res.status(500).json({ error: "Failed to get job status" });
  }
});
```

---

## Task 6: Graceful Shutdown

**Files:**

- Modify: `app/services/render-server.ts` (end of file)

**Step 1:** Add graceful shutdown handler

```typescript
// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[Shutdown] Closing BullMQ connections...");
  await renderWorker.close();
  await renderQueue.close();
  await redis.quit();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Shutdown] Closing BullMQ connections...");
  await renderWorker.close();
  await renderQueue.close();
  await redis.quit();
  process.exit(0);
});
```

---

## Task 7: Add Redis to Docker Compose

**Files:**

- Modify: `docker-compose.yml`

**Step 1:** Add Redis service

```yaml
services:
  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  render:
    build:
      context: .
      dockerfile: Dockerfile.render
    environment:
      - REDIS_URL=redis://redis:6379
      - RENDER_SERVER_PORT=8080
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - app-network

volumes:
  redis-data:
```

---

## Task 8: Commit Changes

```bash
git add package.json pnpm-lock.yaml app/services/render-server.ts docker-compose.yml
git commit -m "feat: implement BullMQ for reliable job processing

- Add BullMQ and ioredis dependencies
- Replace in-memory Map with BullMQ queue backed by Redis
- Implement Worker with progress tracking and timeout handling
- Add automatic job cleanup (24h for completed, 7d for failed)
- Configure concurrency limit (2) and rate limiting (10/min)
- Add Redis service to docker-compose
- Implement graceful shutdown for queue connections"
```
