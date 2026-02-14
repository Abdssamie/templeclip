export type JobStatus = "queued" | "active" | "completed" | "failed";

export interface RenderJobData {
  userId: string;
  timelineData: unknown[];
  width: number;
  height: number;
  durationInSeconds: number;
  scenes?: unknown[];
  variableValues?: Record<string, string>;
}

export interface RenderJobResult {
  outputUrl: string;
}

export interface CachedJobStatus {
  status: JobStatus;
  progress: number;
  outputUrl?: string;
  error?: string;
}
