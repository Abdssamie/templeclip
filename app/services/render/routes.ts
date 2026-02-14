import type express from "express";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { Redis } from "ioredis";
import { RenderRequestSchema } from "~/schemas/apis/render";
import { CONFIG } from "./config";
import { authenticateToken } from "./auth";
import { renderQueue, jobStatusCache } from "./queue";
import type { RenderJobResult } from "./types";

const redisClient = new Redis(CONFIG.REDIS_URL);

export const rateLimiter = rateLimit({
  windowMs: CONFIG.RATE_LIMIT.WINDOW_MS,
  max: CONFIG.RATE_LIMIT.MAX_REQUESTS,
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

function jsonError(res: express.Response, error: string, status = 500) {
  return res.status(status).json({ error });
}

export function setupRoutes(app: express.Express) {
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.post("/render", rateLimiter, authenticateToken, async (req, res) => {
    const validation = RenderRequestSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request data", details: validation.error.issues });
    }

    try {
      const job = await renderQueue.add("render-video", validation.data, { jobId: crypto.randomUUID() });
      if (!job.id) {
        return jsonError(res, "Failed to create job", 500);
      }
      jobStatusCache.set(job.id, { status: "queued", progress: 0 });
      res.json({ renderId: job.id });
    } catch (error) {
      console.error("[Render Error]", error);
      jsonError(res, "Internal server error", 500);
    }
  });

  app.get("/render/:jobId", async (req, res) => {
    const { jobId } = req.params;
    
    

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

    try {
      const job = await renderQueue.getJob(jobId);
      if (!job) {
        return jsonError(res, "Job not found", 404);
      }

      const state = await job.getState();
      const returnValue = job.returnvalue as RenderJobResult | undefined;

      res.json({
        done: state === "completed" || state === "failed",
        status: state,
        progress: (job.progress as number) || 0,
        outputFile: returnValue?.outputUrl,
        errors: job.failedReason ? [job.failedReason] : undefined,
      });
    } catch (error) {
      console.error("[Status Error]", error);
      jsonError(res, "Failed to get job status", 500);
    }
  });

  return redisClient;
}
