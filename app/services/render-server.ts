import express from "express";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { Queue, Worker, Job } from "bullmq";
import { Redis } from "ioredis";
import { uploadToR2, getPresignedDownloadUrl } from "../lib/r2-client";
import type { TimelineDataItem, Scene } from "../components/timeline/types";
import { RenderRequestSchema } from "../schemas/apis/render";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Limit JSON body to 10MB
app.use(express.json({ limit: "10mb" }));
app.use(cors());

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const connection = { host: "localhost", port: 6379 };
if (process.env.REDIS_URL) {
  const url = new URL(process.env.REDIS_URL);
  connection.host = url.hostname;
  connection.port = parseInt(url.port) || 6379;
}

// Bearer Token Authentication
const RENDER_API_TOKEN = process.env.RENDER_API_TOKEN;

if (!RENDER_API_TOKEN) {
  console.warn("[Warning] RENDER_API_TOKEN not set - render service is insecure!");
}

function authenticateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!RENDER_API_TOKEN) {
    return next(); // Skip auth if no token configured (development)
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized - Bearer token required" });
  }

  const token = authHeader.substring(7);
  if (token !== RENDER_API_TOKEN) {
    return res.status(401).json({ error: "Unauthorized - Invalid token" });
  }

  next();
}

// Rate Limiting with Redis
const redisClient = new Redis(redisUrl);

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: async (...args: string[]) => {
      const result = await redisClient.call(args[0], ...args.slice(1));
      return result as string | number | boolean | (string | number | boolean)[];
    },
  }),
  message: { error: "Rate limit exceeded", retryAfter: 3600 },
});

interface RenderJobData {
  timelineData: TimelineDataItem[];
  compositionWidth: number;
  compositionHeight: number;
  durationInFrames: number;
  scenes?: Scene[];
  variableValues?: Record<string, string>;
}

interface RenderJobResult {
  outputUrl: string;
}

const renderQueue = new Queue<RenderJobData, RenderJobResult>("video-render", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 100,
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60,
    },
  },
});

const jobStatusCache = new Map<
  string,
  {
    status: "queued" | "active" | "completed" | "failed";
    progress: number;
    outputUrl?: string;
    error?: string;
  }
>();

const RENDER_TIMEOUT_MS = 30 * 60 * 1000;

const renderWorker = new Worker<RenderJobData, RenderJobResult>(
  "video-render",
  async (job) => {
    const { timelineData, compositionWidth, compositionHeight, durationInFrames, scenes, variableValues } = job.data;
    const jobId = job.id!;

    jobStatusCache.set(jobId, { status: "active", progress: 0 });

    const outputPath = path.join("/tmp", `${jobId}.mp4`);
    const bundleLocation = path.join(__dirname, "../videorender");

    try {
      const composition = await selectComposition({
        serveUrl: bundleLocation,
        id: "TimelineComposition",
        inputProps: {
          timelineData,
          compositionWidth,
          compositionHeight,
          durationInFrames,
          scenes,
          variableValues,
        },
      });

      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: "h264",
        outputLocation: outputPath,
        inputProps: {
          timelineData,
          compositionWidth,
          compositionHeight,
          durationInFrames,
          scenes,
          variableValues,
        },
        timeoutInMilliseconds: RENDER_TIMEOUT_MS,
        onProgress: ({ progress }) => {
          job.updateProgress(Math.round(progress * 100));
          jobStatusCache.set(jobId, {
            status: "active",
            progress: Math.round(progress * 100),
          });
        },
      });

      const fileBuffer = await fs.promises.readFile(outputPath);
      const r2Key = `renders/${jobId}.mp4`;
      await uploadToR2(r2Key, fileBuffer, "video/mp4");

      await fs.promises.unlink(outputPath);

      const outputUrl = await getPresignedDownloadUrl(r2Key);

      return { outputUrl };
    } catch (error) {
      console.error(`[Job ${jobId}] Render failed:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 60000,
    },
  },
);

renderWorker.on("completed", (job, result) => {
  const jobId = job.id;
  if (jobId && result) {
    jobStatusCache.set(jobId, {
      status: "completed",
      progress: 100,
      outputUrl: result.outputUrl,
    });
    console.log(`[Job ${jobId}] Render completed: ${result.outputUrl}`);
  }
});

renderWorker.on("failed", (job, err) => {
  if (job) {
    const jobId = job.id;
    if (jobId) {
      jobStatusCache.set(jobId, {
        status: "failed",
        progress: 0,
        error: err.message,
      });
    }
    console.error(`[Job ${job.id}] Render failed:`, err);
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/render", limiter, authenticateToken, async (req, res) => {
  try {
    // Validate request body
    const result = RenderRequestSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Invalid request data",
        details: result.error.issues,
      });
    }

    const input = req.body as RenderJobData;

    if (!input.timelineData || !input.compositionWidth || !input.compositionHeight || !input.durationInFrames) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const job = await renderQueue.add("render-video", input, {
      jobId: crypto.randomUUID(),
    });

    const jobId = job.id;
    if (jobId) {
      jobStatusCache.set(jobId, { status: "queued", progress: 0 });
      res.json({ renderId: jobId });
    } else {
      res.status(500).json({ error: "Failed to create job" });
    }
  } catch (error) {
    // Don't leak internal error details
    console.error("[Render Error]", error);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
});

app.get("/render/:jobId", async (req, res) => {
  const { jobId } = req.params;

  try {
    const cached = jobStatusCache.get(jobId);
    if (cached) {
      return res.json({
        done: cached.status === "completed" || cached.status === "failed",
        status: cached.status,
        progress: cached.progress,
        outputFile: cached.outputUrl,
        errors: cached.error ? [cached.error] : undefined,
      });
    }

    const job = await renderQueue.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    const state = await job.getState();
    const progress = (job.progress as number) || 0;

    const returnValue = job.returnvalue as RenderJobResult | undefined;

    res.json({
      done: state === "completed" || state === "failed",
      status: state,
      progress,
      outputFile: returnValue?.outputUrl,
      errors: job.failedReason ? [job.failedReason] : undefined,
    });
  } catch (error) {
    console.error("[Status Error]", error);
    res.status(500).json({ error: "Failed to get job status" });
  }
});

process.on("SIGTERM", async () => {
  console.log("[Shutdown] Closing BullMQ connections...");
  await renderWorker.close();
  await renderQueue.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Shutdown] Closing BullMQ connections...");
  await renderWorker.close();
  await renderQueue.close();
  process.exit(0);
});

const PORT = process.env.RENDER_SERVER_PORT || 8080;
app.listen(PORT, () => {
  console.log(`Render server listening on port ${PORT}`);
});
