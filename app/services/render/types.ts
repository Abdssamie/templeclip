import type { TimelineDataItem, Scene } from "~/components/timeline/types";

export type JobStatus = "queued" | "active" | "completed" | "failed";

export interface RenderJobData {
  timelineData: TimelineDataItem[];
  compositionWidth: number;
  compositionHeight: number;
  durationInFrames: number;
  scenes?: Scene[];
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
