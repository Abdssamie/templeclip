import { z } from "zod";

const opt = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullish().transform((v) => v ?? (undefined as z.infer<T> | undefined));

/**
 * POST /api/r2/confirm-upload
 * Confirm that a file upload to R2 has completed successfully
 */
export const ConfirmUploadBodySchema = z.object({
  assetId: z.string().uuid(),
});

/**
 * POST /api/r2/presigned-upload
 * Generate a presigned URL for uploading a file directly to R2
 */
export const PresignedUploadBodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  width: opt(z.number().int().positive()),
  height: opt(z.number().int().positive()),
  durationSeconds: opt(z.number().positive()),
  projectId: opt(z.string().uuid()),
});

/**
 * GET /api/r2/presigned-download?assetId=xxx
 * Generate a presigned URL for downloading a file from R2
 */
export const PresignedDownloadQuerySchema = z.object({
  assetId: z.string().uuid(),
});

/**
 * Response: Presigned upload URL
 */
export const PresignedUploadResponseSchema = z.object({
  presignedUrl: z.string().url(),
  assetId: z.string().uuid(),
  r2Key: z.string(),
  expiresIn: z.number().int().positive(),
});

/**
 * Response: Presigned download URL
 */
export const PresignedDownloadResponseSchema = z.object({
  presignedUrl: z.string().url(),
  expiresIn: z.number().int().positive(),
});

/**
 * Response: Upload confirmation
 */
export const ConfirmUploadResponseSchema = z.object({
  success: z.literal(true),
  asset: z.object({
    id: z.string().uuid(),
    originalName: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int(),
    r2Key: z.string(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    durationSeconds: z.number().nullable(),
  }),
});
