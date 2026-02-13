import express from "express";
import cors from "cors";
import { CONFIG } from "./config";
import { setupRoutes } from "./routes";
import { closeQueue } from "./queue";

if (!CONFIG.API_TOKEN) {
  console.warn("[Warn] RENDER_API_TOKEN not set - render service is insecure!");
}

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(cors());

const redisClient = setupRoutes(app);

async function gracefulShutdown(signal: string) {
  console.log(`[Shutdown] ${signal} received, closing connections...`);
  await closeQueue();
  await redisClient.quit();
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

app.listen(CONFIG.PORT, () => {
  console.log(`[Render Server] Listening on port ${CONFIG.PORT}`);
});
