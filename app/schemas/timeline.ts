import { z } from "zod";

export const TextPropertiesSchema = z.object({
  textContent: z.string(),
  fontSize: z.number(),
  fontFamily: z.string(),
  color: z.string(),
  textAlign: z.enum(["left", "center", "right"]),
  fontWeight: z.enum(["normal", "bold"]),
  template: z.enum(["normal", "glassy"]).nullable(),
});

export const TransitionSchema = z.object({
  id: z.string(),
  presentation: z.enum(["fade", "wipe", "clockWipe", "slide", "flip", "iris"]),
  timing: z.enum(["spring", "linear"]),
  durationInFrames: z.number().int().nonnegative(),
  leftScrubberId: z.string().nullable(),
  rightScrubberId: z.string().nullable(),
});

export const MediaBinBaseSchema = z.object({
  id: z.string(),
  mediaType: z.enum(["video", "image", "audio", "text", "groupped_scrubber", "scene"]),
  mediaUrlLocal: z.string().nullable(),
  mediaUrlRemote: z.string().nullable(),
  media_width: z.number(),
  media_height: z.number(),
  text: TextPropertiesSchema.nullable(),
  groupped_scrubbers: z.any().nullable(),
  left_transition_id: z.string().nullable(),
  right_transition_id: z.string().nullable(),
  variableName: z.string().nullable().optional(),
});

export const MediaBinItemSchema = MediaBinBaseSchema.extend({
  name: z.string(),
  durationInSeconds: z.number().nonnegative(),
  uploadProgress: z.number().nullable(),
  isUploading: z.boolean(),
  sceneId: z.string().optional(),
  variables: z.record(z.string(), z.string()).optional(),
  sceneName: z.string().optional(),
});

export const ScrubberStateSchema = MediaBinItemSchema.extend({
  left: z.number().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().nonnegative(),
  sourceMediaBinId: z.string(),
  left_player: z.number(),
  top_player: z.number(),
  width_player: z.number(),
  height_player: z.number(),
  is_dragging: z.boolean(),
  trimBefore: z.number().int().nullable(),
  trimAfter: z.number().int().nullable(),
});

export const TrackStateSchema = z.object({
  id: z.string(),
  scrubbers: z.array(ScrubberStateSchema),
  transitions: z.array(TransitionSchema),
});

export const TemplateVariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["text", "image", "video", "audio"]),
  defaultValue: z.string().optional(),
});

export const TimelineStateSchema = z.object({
  tracks: z.array(TrackStateSchema),
  variables: z.array(TemplateVariableSchema).optional(),
});

export const SceneVariableSchemaZod = z.object({
  name: z.string().min(1),
  type: z.enum(["text", "image", "video", "audio"]),
  required: z.boolean(),
});

export const ElasticityRuleSchema = z.object({
  scrubberId: z.string(),
  strategy: z.enum(["fixed", "stretch"]),
});

export const SceneSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  timeline: TimelineStateSchema,
  variableSchema: z.array(SceneVariableSchemaZod),
  elasticityRules: z.array(ElasticityRuleSchema),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const SceneCompositionSchema = z.object({
  sceneOrder: z.array(z.string()),
  transitions: z.array(
    z.object({
      fromSceneId: z.string(),
      toSceneId: z.string(),
      type: z.enum(["fade", "wipe", "slide", "clockWipe", "flip", "iris"]),
      durationFrames: z.number().int().positive(),
    }),
  ),
  testVariables: z.record(z.string(), z.record(z.string(), z.string())).optional(),
});

export type TimelineStateParsed = z.infer<typeof TimelineStateSchema>;
export type ScrubberStateParsed = z.infer<typeof ScrubberStateSchema>;
export type SceneParsed = z.infer<typeof SceneSchema>;
export type SceneCompositionParsed = z.infer<typeof SceneCompositionSchema>;
