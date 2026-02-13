export const CONFIG = {
  PORT: parseInt(process.env.RENDER_SERVER_PORT || "8080", 10),
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  API_TOKEN: process.env.RENDER_API_TOKEN,
  RENDER_TIMEOUT_MS: 30 * 60 * 1000,
  RATE_LIMIT: {
    WINDOW_MS: 60 * 60 * 1000,
    MAX_REQUESTS: 10,
  },
  QUEUE: {
    NAME: "video-render",
    ATTEMPTS: 3,
    BACKOFF_DELAY: 5000,
    COMPLETED_AGE: 24 * 60 * 60,
    COMPLETED_COUNT: 100,
    FAILED_AGE: 7 * 24 * 60 * 60,
  },
  WORKER: {
    CONCURRENCY: 3,
    RATE_LIMIT_MAX: 10,
    RATE_LIMIT_DURATION_MS: 60000,
  },
} as const;

export function parseRedisConnection(redisUrl: string) {
  const url = new URL(redisUrl);
  return { host: url.hostname, port: parseInt(url.port) || 6379 };
}
