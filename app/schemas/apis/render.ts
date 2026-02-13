import { z } from "zod";

export const RenderRequestSchema = z.object({
  timelineData: z.array(z.record(z.string(), z.any())).max(1000, "Timeline too large (max 1000 items)"),
  scenes: z.array(z.record(z.string(), z.any())).max(100, "Too many scenes (max 100)"),
  width: z.number().int().min(320).max(3840).default(1920),
  height: z.number().int().min(240).max(2160).default(1080),
  durationInSeconds: z.number().positive().max(3600, "Video too long (max 1 hour)"),
  outputFormat: z.enum(["mp4", "webm"]).default("mp4"),
});

export type RenderRequest = z.infer<typeof RenderRequestSchema>;
