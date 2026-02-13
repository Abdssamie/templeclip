import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import { fileURLToPath } from "url";
import { uploadToR2, getPresignedDownloadUrl } from "~/lib/r2-client";
import { CONFIG } from "./config";
import type { RenderJobData } from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function executeRender(
  jobId: string,
  data: RenderJobData,
  onProgress: (progress: number) => void | Promise<void>,
): Promise<string> {
  const { timelineData, compositionWidth, compositionHeight, durationInFrames, scenes, variableValues } = data;
  const bundleLocation = path.join(__dirname, "../../videorender");

  const inputProps = {
    timelineData,
    compositionWidth,
    compositionHeight,
    durationInFrames,
    scenes,
    variableValues,
  };

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "TimelineComposition",
    inputProps,
  });

  const { buffer } = await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    inputProps,
    timeoutInMilliseconds: CONFIG.RENDER_TIMEOUT_MS,
    onProgress: async ({ progress }) => {
      await onProgress(Math.round(progress * 100));
    },
  });

  if (!buffer) {
    throw new Error("Failed to render video: no buffer returned");
  }

  const r2Key = `renders/${jobId}.mp4`;
  await uploadToR2(r2Key, buffer, "video/mp4");

  return getPresignedDownloadUrl(r2Key);
}
