import type { TimelineDataItem, Transition } from "~/components/timeline/types";

export function getAllTransitions(timelineData: TimelineDataItem[]): Record<string, Transition> {
  if (!timelineData.length) return {};
  return timelineData[0].transitions || {};
}
