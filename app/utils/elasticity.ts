import type { ElasticityRule, Scene, TimelineDataItem } from "~/components/timeline/types";

/**
 * Calculate the actual duration for a scrubber based on its elasticity rule.
 * This is ONLY used during server-side rendering, NOT in the UI editor.
 *
 * For "stretch" strategy: The scrubber will expand to match its actual media duration
 * For "fixed" strategy: The scrubber keeps its original duration
 *
 * @param scrubber - The scrubber with runtime props (startTime, endTime, duration)
 * @param elasticityRules - Elasticity rules from the scene
 * @returns Duration in seconds
 */
export function calculateElasticDuration(
  scrubber: any, // TimelineDataItem scrubber with runtime props
  elasticityRules: ElasticityRule[],
): number {
  // Find the elasticity rule for this scrubber
  const rule = elasticityRules.find((r) => r.scrubberId === scrubber.id);

  // If no rule or strategy is "fixed", use the scrubber's current duration
  if (!rule || rule.strategy === "fixed") {
    return scrubber.duration;
  }

  // For "stretch" strategy, we need to get the actual media duration
  if (rule.strategy === "stretch") {
    // For video/audio scrubbers, use durationInSeconds if available
    if (scrubber.durationInSeconds && scrubber.durationInSeconds > 0) {
      // Account for trimming if present
      let actualDuration = scrubber.durationInSeconds;

      if (scrubber.trimBefore || scrubber.trimAfter) {
        const fps = 30; // TODO: Get from composition settings
        const trimBeforeSeconds = (scrubber.trimBefore || 0) / fps;
        const trimAfterSeconds = (scrubber.trimAfter || 0) / fps;
        actualDuration = actualDuration - trimBeforeSeconds - trimAfterSeconds;
      }

      return Math.max(0.1, actualDuration); // Minimum 0.1 seconds
    }

    // Fallback to current duration if we can't determine actual duration
    console.warn(`Cannot determine actual duration for scrubber ${scrubber.id}, using fixed duration`);
    return scrubber.duration;
  }

  // Unknown strategy, use fixed duration
  console.warn(`Unknown elasticity strategy: ${rule.strategy}`);
  return scrubber.duration;
}

/**
 * Apply elasticity rules to all scrubbers in timeline data.
 * This modifies the scrubbers in-place to adjust their durations and positions.
 *
 * @param timelineData - The timeline data to modify
 * @param scenes - Available scene definitions (contains elasticity rules)
 */
export function applyElasticityToTimeline(timelineData: TimelineDataItem[], scenes: Scene[]): void {
  // Collect all elasticity rules from all scenes
  const allElasticityRules: ElasticityRule[] = [];
  for (const scene of scenes) {
    if (scene.elasticityRules) {
      allElasticityRules.push(...scene.elasticityRules);
    }
  }

  // If no elasticity rules, nothing to do
  if (allElasticityRules.length === 0) {
    return;
  }

  for (const item of timelineData) {
    for (const scrubber of item.scrubbers) {
      const originalDuration = scrubber.duration;
      const elasticDuration = calculateElasticDuration(scrubber, allElasticityRules);

      if (elasticDuration !== originalDuration) {
        console.log(`Elasticity: ${scrubber.id} duration ${originalDuration}s -> ${elasticDuration}s`);
        scrubber.duration = elasticDuration;
        scrubber.endTime = scrubber.startTime + elasticDuration;
      }
    }

    // Recalculate positions for scrubbers after the elastic ones
    // Sort by startTime and adjust subsequent scrubbers to prevent overlap
    item.scrubbers.sort((a: any, b: any) => a.startTime - b.startTime);

    for (let i = 1; i < item.scrubbers.length; i++) {
      const prev = item.scrubbers[i - 1];
      const curr = item.scrubbers[i];

      // If there's overlap, push the current scrubber forward
      if (curr.startTime < prev.endTime) {
        const shift = prev.endTime - curr.startTime;
        curr.startTime = prev.endTime;
        curr.endTime = curr.startTime + curr.duration;
        console.log(`Elasticity: Shifted ${curr.id} forward by ${shift}s to prevent overlap`);
      }
    }
  }
}
