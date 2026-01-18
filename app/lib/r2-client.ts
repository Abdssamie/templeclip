import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";

/**
 * Cloudflare R2 Client
 *
 * R2 is S3-compatible, so we use the AWS SDK with custom endpoint configuration.
 * Key benefits: Zero egress fees, simpler pricing, S3-compatible API.
 */

// Environment variables (support both naming conventions)
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "kimu-media";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // Optional custom domain

// Validate required environment variables
if (!CLOUDFLARE_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.warn(
    "⚠️  R2 credentials not configured. Set R2_ACCOUNT_ID (or CLOUDFLARE_ACCOUNT_ID), R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY in .env",
  );
}

// Initialize R2 client with S3-compatible configuration
const r2Client = new S3Client({
  region: "auto", // R2 uses 'auto' for region
  endpoint: CLOUDFLARE_ACCOUNT_ID ? `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID || "",
    secretAccessKey: R2_SECRET_ACCESS_KEY || "",
  },
});

/**
 * Generate a presigned URL for uploading a file to R2
 *
 * @param userId - User ID for organizing files
 * @param assetId - Asset ID (UUID)
 * @param filename - Original filename
 * @param expiresIn - URL expiration time in seconds (default: 15 minutes)
 * @returns Presigned upload URL
 */
export async function getPresignedUploadUrl(
  userId: string,
  assetId: string,
  filename: string,
  expiresIn: number = 900, // 15 minutes
): Promise<string> {
  const key = `${userId}/${assetId}/${filename}`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn });
  return presignedUrl;
}

/**
 * Generate a presigned URL for downloading a file from R2
 *
 * @param r2Key - R2 object key (e.g., "userId/assetId/filename")
 * @param expiresIn - URL expiration time in seconds (default: 15 minutes)
 * @returns Presigned download URL
 */
export async function getPresignedDownloadUrl(
  r2Key: string,
  expiresIn: number = 900, // 15 minutes
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: r2Key,
  });

  const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn });
  return presignedUrl;
}

/**
 * Upload a file to R2 using streaming (for server-side uploads)
 *
 * @param r2Key - R2 object key
 * @param fileStream - Readable stream or Buffer
 * @param contentType - MIME type
 * @returns Upload result
 */
export async function uploadToR2(
  r2Key: string,
  fileStream: Buffer | ReadableStream,
  contentType?: string,
): Promise<{ success: boolean; key: string }> {
  try {
    const upload = new Upload({
      client: r2Client,
      params: {
        Bucket: R2_BUCKET_NAME,
        Key: r2Key,
        Body: fileStream,
        ContentType: contentType,
      },
    });

    await upload.done();

    return {
      success: true,
      key: r2Key,
    };
  } catch (error) {
    console.error("R2 upload error:", error);
    throw error;
  }
}

/**
 * Delete a file from R2
 *
 * @param r2Key - R2 object key
 * @returns Deletion result
 */
export async function deleteFromR2(r2Key: string): Promise<{ success: boolean }> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
    });

    await r2Client.send(command);

    return { success: true };
  } catch (error) {
    console.error("R2 delete error:", error);
    throw error;
  }
}

/**
 * Copy a file in R2
 *
 * @param sourceKey - Source R2 object key
 * @param destinationKey - Destination R2 object key
 * @returns Copy result
 */
export async function copyInR2(sourceKey: string, destinationKey: string): Promise<{ success: boolean }> {
  try {
    const command = new CopyObjectCommand({
      Bucket: R2_BUCKET_NAME,
      CopySource: `${R2_BUCKET_NAME}/${sourceKey}`,
      Key: destinationKey,
    });

    await r2Client.send(command);

    return { success: true };
  } catch (error) {
    console.error("R2 copy error:", error);
    throw error;
  }
}

/**
 * Generate R2 key from user ID, asset ID, and filename

 *
 * @param userId - User ID
 * @param assetId - Asset ID (UUID)
 * @param filename - Original filename
 * @returns R2 object key
 */
export function generateR2Key(userId: string, assetId: string, filename: string): string {
  return `${userId}/${assetId}/${filename}`;
}

/**
 * Generate public R2 URL for an asset
 *
 * @param r2Key - R2 object key
 * @returns Public URL (uses custom domain if configured, otherwise R2 default)
 */
export function getPublicR2Url(r2Key: string): string {
  if (R2_PUBLIC_URL) {
    // Use custom public domain (e.g., https://bucket.tripixir.com)
    return `${R2_PUBLIC_URL}/${r2Key}`;
  }

  // Fallback to R2 default public URL format
  // Note: Bucket must have public access enabled for this to work
  if (CLOUDFLARE_ACCOUNT_ID) {
    return `https://${R2_BUCKET_NAME}.${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${r2Key}`;
  }

  throw new Error("Cannot generate public R2 URL: missing R2_PUBLIC_URL or CLOUDFLARE_ACCOUNT_ID");
}

/**
 * Check if R2 is properly configured
 *
 * @returns true if R2 credentials are set
 */
export function isR2Configured(): boolean {
  return !!(CLOUDFLARE_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}

export { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL };
