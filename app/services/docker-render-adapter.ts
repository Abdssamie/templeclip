// app/services/docker-render-adapter.ts
import type {
  RenderAdapter,
  RenderInput,
  RenderProgressResult,
  RenderStatus,
  StartRenderResult,
} from "./render-adapter.interface";

interface DockerProgressResponse {
  done: boolean;
  status: RenderStatus;
  progress: number;
  outputFile?: string;
  errors?: string[];
}

/**
 * Docker-based implementation of RenderAdapter
 * Communicates with the Docker render service via HTTP
 */
export class DockerRenderAdapter implements RenderAdapter {
  private baseUrl: string;
  private apiToken: string | undefined;

  constructor(baseUrl: string = process.env.RENDER_SERVER_URL || "http://localhost:8080") {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiToken = process.env.RENDER_API_TOKEN;
    if (!this.apiToken) {
      console.warn(
        "[DockerRenderAdapter] Warning: RENDER_API_TOKEN not set - render requests will fail if server requires authentication",
      );
    }
  }

  /**
   * Get headers with Authorization token if configured
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiToken) {
      headers["Authorization"] = `Bearer ${this.apiToken}`;
    }
    return headers;
  }

  /**
   * Validate render input parameters
   */
  private validateRenderInput(input: RenderInput): void {
    if (input.durationInFrames <= 0) {
      throw new Error(`Invalid durationInFrames: ${input.durationInFrames}. Must be a positive number.`);
    }

    if (input.compositionWidth < 320 || input.compositionWidth > 3840) {
      throw new Error(`Invalid compositionWidth: ${input.compositionWidth}. Must be between 320 and 3840.`);
    }

    if (input.compositionHeight < 240 || input.compositionHeight > 2160) {
      throw new Error(`Invalid compositionHeight: ${input.compositionHeight}. Must be between 240 and 2160.`);
    }

    if (!Array.isArray(input.timelineData)) {
      throw new Error("Invalid timelineData: Must be an array.");
    }
  }

  /**
   * Validate render progress parameters
   */
  private validateProgressParams(renderId: string, bucketName: string): void {
    if (!renderId || renderId.trim() === "") {
      throw new Error("Invalid renderId: Must not be empty.");
    }

    if (!bucketName || bucketName.trim() === "") {
      throw new Error("Invalid bucketName: Must not be empty.");
    }
  }

  /**
   * Start a render job on the Docker render service
   */
  async startRender(input: RenderInput): Promise<StartRenderResult> {
    this.validateRenderInput(input);

    try {
      // Map interface fields to schema fields
      const requestBody = {
        timelineData: input.timelineData,
        scenes: input.scenes ?? [],
        width: input.compositionWidth,
        height: input.compositionHeight,
        durationInSeconds: Math.ceil(input.durationInFrames / 30), // Convert frames to seconds (assuming 30fps)
        outputFormat: "mp4" as const,
      };

      const response = await fetch(`${this.baseUrl}/render`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Docker render service error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      return {
        renderId: data.renderId,
        bucketName: "docker-local", // Docker doesn't use S3 buckets
      };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch failed")) {
        throw new Error(
          `Cannot connect to Docker render service at ${this.baseUrl}. ` +
            "Ensure the render service is running (docker-compose up render)",
          { cause: error },
        );
      }
      throw new Error(`Failed to start Docker render: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }

  /**
   * Poll the progress of a Docker render job
   */
  async pollRenderProgress(renderId: string, bucketName: string): Promise<RenderProgressResult> {
    this.validateProgressParams(renderId, bucketName);

    try {
      const response = await fetch(`${this.baseUrl}/render/${encodeURIComponent(renderId)}`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Render job not found: ${renderId}`);
        }
        const errorText = await response.text();
        throw new Error(`Docker render service error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as DockerProgressResponse;

      return {
        done: data.done,
        status: data.status,
        progress: data.progress,
        outputFile: data.outputFile,
        errors: data.errors,
      };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch failed")) {
        throw new Error(
          `Cannot connect to Docker render service at ${this.baseUrl}. ` +
            "Ensure the render service is running (docker-compose up render)",
          { cause: error },
        );
      }
      throw new Error(`Failed to get render progress: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }
}
