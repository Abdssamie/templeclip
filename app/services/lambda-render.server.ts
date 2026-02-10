import { renderMediaOnLambda, getRenderProgress as getRemotionRenderProgress } from "@remotion/lambda/client";
import { getLambdaConfig } from "~/lib/lambda-config.server";
import type { TimelineDataItem, Scene } from "~/components/timeline/types";

/**
 * Input props for rendering a timeline composition
 */
export interface RenderInput {
  timelineData: TimelineDataItem[];
  compositionWidth: number;
  compositionHeight: number;
  durationInFrames: number;
  scenes?: Scene[];
  variableValues?: Record<string, string>;
}

/**
 * Render status
 */
export type RenderStatus = "completed" | "failed" | "in_progress";

/**
 * Result of checking render progress
 */
export interface RenderProgressResult {
  done: boolean;
  status: RenderStatus;
  progress: number; // 0-1
  outputFile?: string;
  errors?: string[];
}

/**
 * Result of starting a Lambda render
 */
export interface StartRenderResult {
  renderId: string;
  bucketName: string;
}

/**
 * Validate render input parameters
 */
function validateRenderInput(input: RenderInput): void {
  if (input.durationInFrames <= 0) {
    throw new Error(`Invalid durationInFrames: ${input.durationInFrames}. Must be a positive number.`);
  }

  if (input.compositionWidth <= 0) {
    throw new Error(`Invalid compositionWidth: ${input.compositionWidth}. Must be a positive number.`);
  }

  if (input.compositionHeight <= 0) {
    throw new Error(`Invalid compositionHeight: ${input.compositionHeight}. Must be a positive number.`);
  }

  if (!Array.isArray(input.timelineData)) {
    throw new Error("Invalid timelineData: Must be an array.");
  }
}

/**
 * Validate render progress parameters
 */
function validateProgressParams(renderId: string, bucketName: string): void {
  if (!renderId || renderId.trim() === "") {
    throw new Error("Invalid renderId: Must not be empty.");
  }

  if (!bucketName || bucketName.trim() === "") {
    throw new Error("Invalid bucketName: Must not be empty.");
  }
}

/**
 * Map Remotion errors to string array
 */
function mapErrors(errors: Array<{ message: string }> | undefined): string[] | undefined {
  if (!errors || errors.length === 0) {
    return undefined;
  }
  return errors.map((e) => e.message);
}

/**
 * Validate domain format
 */
function isValidDomain(domain: string): boolean {
  // Basic domain validation: no protocol, no path, no whitespace
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return domainRegex.test(domain.trim());
}

/**
 * Get webhook URL for render completion notifications
 */
function getWebhookUrl(): string | undefined {
  const config = getLambdaConfig();
  const prodDomain = config.prodDomain;

  if (!prodDomain) {
    console.warn("PROD_DOMAIN not set - webhook notifications will not be configured");
    return undefined;
  }

  // Validate domain format
  if (!isValidDomain(prodDomain)) {
    console.error(`Invalid PROD_DOMAIN format: ${prodDomain} - webhook notifications will not be configured`);
    return undefined;
  }

  return `https://${prodDomain}/api/webhooks/render-complete`;
}

/**
 * Start a Lambda render job for a timeline composition
 */
export async function startLambdaRender(input: RenderInput): Promise<StartRenderResult> {
  validateRenderInput(input);

  const config = getLambdaConfig();
  const webhookUrl = getWebhookUrl();

  try {
    const result = await renderMediaOnLambda({
      region: config.region,
      functionName: config.functionName,
      serveUrl: config.serveUrl,
      composition: "TimelineComposition",
      inputProps: {
        timelineData: input.timelineData,
        compositionWidth: input.compositionWidth,
        compositionHeight: input.compositionHeight,
        durationInFrames: input.durationInFrames,
        scenes: input.scenes,
        variableValues: input.variableValues,
      },
      codec: "h264",
      imageFormat: "jpeg",
      maxRetries: 1,
      privacy: "public",
      framesPerLambda: 20,
      webhook: webhookUrl
        ? {
            url: webhookUrl,
            secret: config.webhookSecret || null,
          }
        : undefined,
    });

    return {
      renderId: result.renderId,
      bucketName: result.bucketName,
    };
  } catch (error) {
    throw new Error(`Failed to start Lambda render: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

/**
 * Check the progress of a Lambda render job
 */
export async function pollRenderProgress(renderId: string, bucketName: string): Promise<RenderProgressResult> {
  validateProgressParams(renderId, bucketName);

  const config = getLambdaConfig();

  try {
    const progress = await getRemotionRenderProgress({
      renderId,
      bucketName,
      functionName: config.functionName,
      region: config.region,
    });

    const errors = mapErrors(progress.errors);

    // Handle different progress states
    if (progress.done) {
      // Determine if render succeeded or failed
      const status: RenderStatus = errors && errors.length > 0 ? "failed" : "completed";

      return {
        done: true,
        status,
        progress: 1,
        outputFile: progress.outputFile || undefined,
        errors,
      };
    }

    return {
      done: false,
      status: "in_progress",
      progress: progress.overallProgress,
      errors,
    };
  } catch (error) {
    throw new Error(`Failed to get render progress: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}
