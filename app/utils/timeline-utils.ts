import {
  type TimelineState,
  type TimelineDataItem,
  type Transition,
  type ScrubberState,
} from "../components/timeline/types";

export function transformTimelineToData(timeline: TimelineState, pixelsPerSecond: number): TimelineDataItem[] {
  const scrubbers: TimelineDataItem["scrubbers"] = [];

  for (const track of timeline.tracks) {
    if (!track.scrubbers) continue;
    for (const scrubber of track.scrubbers) {
      scrubbers.push({
        id: scrubber.id,
        mediaType: scrubber.mediaType,
        mediaUrlLocal: scrubber.mediaUrlLocal,
        mediaUrlRemote: scrubber.mediaUrlRemote,
        startTime: scrubber.left / pixelsPerSecond,
        endTime: (scrubber.left + scrubber.width) / pixelsPerSecond,
        duration: scrubber.width / pixelsPerSecond,
        trackIndex: scrubber.y || 0,
        media_width: scrubber.media_width,
        media_height: scrubber.media_height,
        text: scrubber.text,

        // the following are the properties of the scrubber in <Player>
        left_player: scrubber.left_player,
        top_player: scrubber.top_player,
        width_player: scrubber.width_player,
        height_player: scrubber.height_player,

        // for video scrubbers (and audio in the future)
        trimBefore: scrubber.trimBefore,
        trimAfter: scrubber.trimAfter,

        left_transition_id: scrubber.left_transition_id,
        right_transition_id: scrubber.right_transition_id,
        groupped_scrubbers: scrubber.groupped_scrubbers,

        // Scene specific properties
        variableName: scrubber.variableName,
        sceneId: scrubber.sceneId || "",
        variables: scrubber.variables || {},
        sceneName: scrubber.sceneName,
      });
    }
  }

  const transitions: { [id: string]: Transition } = {};
  for (const track of timeline.tracks) {
    if (!track.transitions) continue;
    for (const transition of track.transitions) {
      transitions[transition.id] = {
        id: transition.id,
        presentation: transition.presentation,
        timing: transition.timing,
        durationInFrames: transition.durationInFrames,
        leftScrubberId: transition.leftScrubberId,
        rightScrubberId: transition.rightScrubberId,
      };
    }
  }

  return [
    {
      scrubbers: scrubbers,
      transitions: transitions,
    },
  ];
}

/**
 * Sanitizes timeline state by removing local blob URLs which are session-specific
 * and shouldn't be persisted to database or used across reloads.
 */
export function sanitizeTimelineState(timeline: TimelineState): TimelineState {
  const sanitizeScrubber = (scrubber: ScrubberState): ScrubberState => {
    const sanitized = {
      ...scrubber,
      mediaUrlLocal: null, // Always clear local blob URLs
    };

    if (sanitized.groupped_scrubbers) {
      sanitized.groupped_scrubbers = sanitized.groupped_scrubbers.map(sanitizeScrubber);
    }

    return sanitized;
  };

  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      scrubbers: track.scrubbers.map(sanitizeScrubber),
    })),
  };
}
