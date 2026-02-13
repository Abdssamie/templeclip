import { Queue, Worker } from "bullmq";
import { CONFIG, parseRedisConnection } from "./config";
import type { RenderJobData, RenderJobResult, CachedJobStatus } from "./types";
import { executeRender } from "./renderer";

export const redisConnection = process.env.REDIS_URL
  ? parseRedisConnection(CONFIG.REDIS_URL)
  : { host: "localhost", port: 6379 };

export const jobStatusCache = new Map<string, CachedJobStatus>();

export const renderQueue = new Queue<RenderJobData, RenderJobResult>(CONFIG.QUEUE.NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: CONFIG.QUEUE.ATTEMPTS,
    backoff: { type: "exponential", delay: CONFIG.QUEUE.BACKOFF_DELAY },
    removeOnComplete: { age: CONFIG.QUEUE.COMPLETED_AGE, count: CONFIG.QUEUE.COMPLETED_COUNT },
    removeOnFail: { age: CONFIG.QUEUE.FAILED_AGE },
  },
});

export const renderWorker = new Worker<RenderJobData, RenderJobResult>(
  CONFIG.QUEUE.NAME,
  async (job) => {
    const jobId = job.id!;
    jobStatusCache.set(jobId, { status: "active", progress: 0 });

    try {
      const outputUrl = await executeRender(jobId, job.data, async (progress) => {
        await job.updateProgress(progress);
        jobStatusCache.set(jobId, { status: "active", progress });
      });

      return { outputUrl };
    } catch (error) {
      console.error(`[Job ${jobId}] Render failed:`, error);
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: CONFIG.WORKER.CONCURRENCY,
    limiter: {
      max: CONFIG.WORKER.RATE_LIMIT_MAX,
      duration: CONFIG.WORKER.RATE_LIMIT_DURATION_MS,
    },
  },
);

renderWorker.on("completed", (job, result) => {
  if (job?.id && result) {
    jobStatusCache.set(job.id, { status: "completed", progress: 100, outputUrl: result.outputUrl });
    console.log(`[Job ${job.id}] Completed: ${result.outputUrl}`);
  }
});

renderWorker.on("failed", (job, err) => {
  if (job?.id) {
    jobStatusCache.set(job.id, { status: "failed", progress: 0, error: err.message });
    console.error(`[Job ${job.id}] Failed:`, err.message);
  }
});

export async function closeQueue() {
  await renderWorker.close();
  await renderQueue.close();
}
