import { z } from "zod";
import { SceneSchema } from "../timeline";

// Request to export a scene template
export const ExportSceneRequestSchema = z.object({
  sceneId: z.string().uuid(),
});

// Response containing exported scene template
export const ExportSceneResponseSchema = z.object({
  scene: SceneSchema,
});

// Request to list all scene templates in a project
export const ListScenesResponseSchema = z.object({
  scenes: z.array(SceneSchema),
});

// Request to render video using scene template
export const RenderWithSceneRequestSchema = z.object({
  sceneId: z.string().uuid(),
  variableValues: z.record(z.string(), z.string()).optional(),
  compositionWidth: z.number().int().positive(),
  compositionHeight: z.number().int().positive(),
  applyElasticity: z.boolean().default(true),
});
