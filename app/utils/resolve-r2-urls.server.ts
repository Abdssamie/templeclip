import type {
  TimelineDataItem,
  Scene,
  ScrubberState,
  Transition,
  ScrubberRuntimeProps,
  BaseScrubber,
  SceneInstanceScrubber,
} from "~/components/timeline/types";
import { getAssetById } from "~/lib/assets.repo.server";
import { getPresignedDownloadUrl } from "~/lib/r2-client";

/**
 * Extract asset ID from a server-relative URL like "/api/assets/:id/raw"
 */
function extractAssetIdFromUrl(url: string | null): string | null {
  if (!url) return null;

  // Match pattern: /api/assets/{uuid}/raw
  const match = url.match(/\/api\/assets\/([a-f0-9-]{36})\/raw/i);
  return match ? match[1] : null;
}

type ResolvableScrubber = (BaseScrubber & ScrubberRuntimeProps) | (SceneInstanceScrubber & ScrubberRuntimeProps);

/**
 * Resolve a single media URL to an R2 presigned URL
 * @param mediaUrl - Original media URL (may be server-relative or already resolved)
 * @param userId - User ID for ownership verification
 * @param expiresIn - Presigned URL expiration in seconds
 * @returns R2 presigned URL or original URL if not resolvable
 */
async function resolveMediaUrl(
  mediaUrl: string | null,
  userId: string,
  expiresIn: number,
  urlCache: Map<string, string>,
): Promise<string | null> {
  if (!mediaUrl) return null;

  // If already resolved (not a server path), return as-is
  if (!mediaUrl.startsWith("/api/assets/")) {
    return mediaUrl;
  }

  // Check cache first
  if (urlCache.has(mediaUrl)) {
    return urlCache.get(mediaUrl)!;
  }

  // Extract asset ID
  const assetId = extractAssetIdFromUrl(mediaUrl);
  if (!assetId) {
    console.warn(`Failed to extract asset ID from URL: ${mediaUrl}`);
    return mediaUrl;
  }

  try {
    // Fetch asset record to get R2 key
    const asset = await getAssetById(assetId);
    if (!asset || !asset.r2_key) {
      console.warn(`Asset ${assetId} not found or missing R2 key`);
      return mediaUrl;
    }

    // SECURITY: Verify asset ownership
    if (asset.user_id !== userId) {
      console.warn(`Access denied: User ${userId} attempted to access asset ${assetId} owned by ${asset.user_id}`);
      return mediaUrl; // Return original URL without resolving
    }

    // Generate presigned download URL
    const presignedUrl = await getPresignedDownloadUrl(asset.r2_key, expiresIn);

    // Cache the result
    urlCache.set(mediaUrl, presignedUrl);

    return presignedUrl;
  } catch (error) {
    console.error(`Failed to resolve R2 URL for asset ${assetId}:`, error);
    return mediaUrl; // Return original on error
  }
}

/**
 * Recursively resolve all asset URLs in timeline data to R2 presigned URLs
 *
 * @param userId - User ID for ownership verification (SECURITY)
 * @param timelineData - Timeline data with potential asset references
 * @param scenes - Scene definitions for recursive scene resolution
 * @param expiresIn - Presigned URL expiration in seconds (default: 24 hours for long renders)
 * @returns Timeline data with resolved R2 URLs
 */
export async function resolveR2UrlsInTimeline(
  userId: string,
  timelineData: TimelineDataItem[],
  scenes: Scene[] = [],
  expiresIn: number = 86400, // 24 hours
): Promise<TimelineDataItem[]> {
  // Cache to avoid generating duplicate presigned URLs for the same asset
  const urlCache = new Map<string, string>();

  // Helper to resolve URLs in a single scrubber
  const resolveScrubber = async (scrubber: ResolvableScrubber) => {
    const resolved = { ...scrubber };

    // Resolve direct media URLs
    if (scrubber.mediaUrlRemote) {
      resolved.mediaUrlRemote = await resolveMediaUrl(scrubber.mediaUrlRemote, userId, expiresIn, urlCache);
    }

    // Handle grouped scrubbers recursively
    if (scrubber.mediaType === "groupped_scrubber" && scrubber.groupped_scrubbers) {
      // @ts-ignore
      resolved.groupped_scrubbers = await Promise.all(scrubber.groupped_scrubbers.map(resolveScrubber));
    }

    // Handle scene scrubbers - resolve the scene's timeline recursively
    if (scrubber.mediaType === "scene" && "sceneId" in scrubber && scrubber.sceneId) {
      const scene = scenes.find((s) => s.id === scrubber.sceneId);
      if (scene) {
        // Transform scene timeline to timeline data format
        const sceneTimelineData: TimelineDataItem[] = [
          {
            scrubbers: scene.timeline.tracks.flatMap((track) =>
              track.scrubbers.map((s) => ({
                ...s,
                startTime: s.left / 100, // Convert pixels to seconds
                endTime: (s.left + s.width) / 100,
                duration: s.width / 100,
                trackIndex: parseInt(track.id.split("-")[1]) || 0,
                left_player: s.left_player,
                top_player: s.top_player,
                width_player: s.width_player,
                height_player: s.height_player,
                trimBefore: s.trimBefore,
                trimAfter: s.trimAfter,
                assetId: s.assetId,
              })),
            ),
            transitions: scene.timeline.tracks.reduce(
              (acc, track) => {
                track.transitions.forEach((t) => {
                  acc[t.id] = t;
                });
                return acc;
              },
              {} as { [id: string]: Transition },
            ),
          },
        ];

        // Recursively resolve the scene's timeline
        await resolveR2UrlsInTimeline(userId, sceneTimelineData, scenes, expiresIn);
      }
    }

    return resolved;
  };

  // Process all timeline items
  const resolvedTimelineData = await Promise.all(
    timelineData.map(async (item) => ({
      ...item,
      scrubbers: await Promise.all(item.scrubbers.map(resolveScrubber)),
    })),
  );

  return resolvedTimelineData;
}
