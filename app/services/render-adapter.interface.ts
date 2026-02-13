// app/services/render-adapter.interface.ts

/**
 * Input props for rendering a timeline composition
 */
export interface RenderInput {
  timelineData: unknown[];
  compositionWidth: number;
  compositionHeight: number;
  durationInFrames: number;
  scenes?: unknown[];
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
 * Result of starting a render job
 */
export interface StartRenderResult {
  renderId: string;
  bucketName: string;
}

/**
 * Render adapter interface - abstracts the rendering mechanism
 * (Lambda vs Docker)
 */
export interface RenderAdapter {
  /**
   * Start a render job
   */
  startRender(input: RenderInput): Promise<StartRenderResult>;

  /**
   * Poll the progress of a render job
   */
  pollRenderProgress(renderId: string, bucketName: string): Promise<RenderProgressResult>;
}

/**
 * Configuration for render adapter factory
 */
export interface RenderAdapterConfig {
  useDocker: boolean;
  dockerUrl?: string;
}
