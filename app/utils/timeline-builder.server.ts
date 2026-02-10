import type { Scene, TimelineDataItem } from "~/components/timeline/types";
import { transformTimelineToData } from "~/utils/timeline-utils";
import { PIXELS_PER_SECOND } from "~/components/timeline/types";

export interface SceneRenderRequest {
  sceneId: string;
  variables: Record<string, string>;
  duration?: number; // Optional override duration
}

/**
 * Build a complete timeline from an array of scene requests
 * Expands each scene into its actual media scrubbers (video, image, text, audio)
 */
export function buildTimelineFromScenes(
  sceneRequests: SceneRenderRequest[],
  availableScenes: Scene[],
): { timelineData: TimelineDataItem[]; totalDuration: number } {
  // Validate scene requests
  for (const request of sceneRequests) {
    if (!request.sceneId || typeof request.sceneId !== "string") {
      throw new Error("Invalid scene request: sceneId is required and must be a string");
    }
    if (request.variables && typeof request.variables !== "object") {
      throw new Error("Invalid scene request: variables must be an object");
    }
  }

  const sceneMap = new Map(availableScenes.map((s) => [s.id, s]));
  const allScrubbers: TimelineDataItem["scrubbers"] = [];
  const allTransitions: TimelineDataItem["transitions"] = {};
  let currentTime = 0;

  for (const request of sceneRequests) {
    const scene = sceneMap.get(request.sceneId);
    if (!scene) {
      throw new Error(`Scene not found: ${request.sceneId}`);
    }

    // Transform scene timeline to get actual scrubbers
    const sceneTimelineData = transformTimelineToData(scene.timeline, PIXELS_PER_SECOND);

    // Calculate scene duration from its scrubbers
    const sceneDuration = request.duration || calculateSceneDuration(sceneTimelineData);

    // Extract all scrubbers from the scene and adjust their timing
    for (const item of sceneTimelineData) {
      for (const scrubber of item.scrubbers) {
        // Adjust timing to place this scene sequentially
        allScrubbers.push({
          ...scrubber,
          startTime: scrubber.startTime + currentTime,
          endTime: scrubber.endTime + currentTime,
        });
      }

      // Also merge transitions
      Object.assign(allTransitions, item.transitions);
    }

    currentTime += sceneDuration;
  }

  return {
    timelineData: [{ scrubbers: allScrubbers, transitions: allTransitions }],
    totalDuration: currentTime,
  };
}

function calculateSceneDuration(timelineData: TimelineDataItem[]): number {
  let maxEndTime = 0;
  for (const item of timelineData) {
    for (const scrubber of item.scrubbers) {
      if (scrubber.endTime > maxEndTime) {
        maxEndTime = scrubber.endTime;
      }
    }
  }
  return maxEndTime;
}
