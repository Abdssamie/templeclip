import express from "express";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { uploadToR2, getPublicR2Url } from "../lib/r2-client";
import type { TimelineDataItem, Scene } from "../components/timeline/types";

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
  timelineData: TimelineDataItem[];
  compositionWidth: number;
  compositionHeight: number;
  durationInFrames: number;
  scenes?: Scene[];
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

    // Select composition to get full VideoConfig with all required properties
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "TimelineComposition",
      inputProps: {
        timelineData: job.input.timelineData,
        compositionWidth: job.input.compositionWidth,
        compositionHeight: job.input.compositionHeight,
        durationInFrames: job.input.durationInFrames,
        scenes: job.input.scenes,
        variableValues: job.input.variableValues,
      },
    });

    await renderMedia({
      composition,
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
    job.outputUrl = getPublicR2Url(r2Key);
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
