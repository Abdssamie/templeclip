import { renderMedia, selectComposition } from "@remotion/renderer";
import { bundle } from "@remotion/bundler";
import path from "path";
import { fileURLToPath } from "url";
import { uploadToR2, getPresignedDownloadUrl } from "~/lib/r2-client";
import { CONFIG } from "./config";
import type { RenderJobData } from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function executeRender(
  jobId: string,
  userId: string,
  data: RenderJobData,
  onProgress: (progress: number) => void | Promise<void>,
): Promise<string> {
  const { timelineData, width, height, durationInSeconds, scenes, variableValues } = data;

  console.log(`[Renderer] Received variableValues:`, JSON.stringify(variableValues, null, 2));

  const bundled = await bundle({
    entryPoint: path.resolve(__dirname, "../../videorender/index.ts"),
    // If you have a webpack override in remotion.config.ts, pass it here as well.
    // webpackOverride: (config) => config,
    webpackOverride: (config) => {
      return {
        ...config,
        resolve: {
          ...config.resolve,
          alias: {
            ...config.resolve?.alias,
            // Map '~' to your 'app' directory
            "~": path.resolve(__dirname, "../../../app"),
          },
        },
      };
    },
  });

  // Map schema field names to composition expected names
  const inputProps = {
    timelineData,
    compositionWidth: width,
    compositionHeight: height,
    durationInFrames: Math.ceil(durationInSeconds * 30),
    scenes,
    variableValues,
  };

  console.log(
    `[Renderer] Passing inputProps to composition with variableValues:`,
    JSON.stringify(inputProps.variableValues, null, 2),
  );

  // TODO: Fix assets urls resolving issues inside docker renderer

  const composition = await selectComposition({
    serveUrl: bundled,
    id: "TimelineComposition",
    inputProps,
  });

  const { buffer } = await renderMedia({
    composition,
    serveUrl: bundled,
    outputLocation: null,
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

  const r2Key = `${userId}/renders/${jobId}.mp4`;
  await uploadToR2(r2Key, buffer, "video/mp4");

  return getPresignedDownloadUrl(r2Key);
}
