import { Player, type PlayerRef } from "@remotion/player";
import { Sequence, AbsoluteFill, Img, Html5Video, Html5Audio } from "remotion";
import { linearTiming, springTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { iris } from "@remotion/transitions/iris";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { slide } from "@remotion/transitions/slide";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import React, { useMemo } from "react";
import {
  FPS,
  PIXELS_PER_SECOND,
  type ScrubberState,
  type TimelineDataItem,
  type TimelineState,
  type Transition,
  type Scene,
} from "../timeline/types";
import { SortedOutlines, layerContainer, outer } from "./DragDrop";
import { transformTimelineToData } from "../../utils/timeline-utils";
import { getAllTransitions } from "~/utils/video-player-utils";

type TimelineCompositionProps = {
  timelineData: TimelineDataItem[];
  isRendering: boolean; // it's either render (True) or preview (False)
  selectedItem: string | null;
  setSelectedItem: React.Dispatch<React.SetStateAction<string | null>>;
  timeline: TimelineState;
  handleUpdateScrubber: (updateScrubber: ScrubberState) => void;
  getPixelsPerSecond: number | (() => number);
  variableValues?: Record<string, string>;
  scenes?: Scene[];
  videoDimensions?: { width: number; height: number };
};

// props for the preview mode player
export type VideoPlayerProps = {
  timelineData: TimelineDataItem[];
  durationInFrames: number; // this is for the player to know how long to render (used in preview mode)
  ref: React.Ref<PlayerRef>;
  compositionWidth: number | null; // if null, the player width = max(width)
  compositionHeight: number | null; // if null, the player height = max(height)
  timeline: TimelineState;
  handleUpdateScrubber: (updateScrubber: ScrubberState) => void;
  selectedItem: string | null;
  setSelectedItem: React.Dispatch<React.SetStateAction<string | null>>;
  getPixelsPerSecond: number | (() => number);
  variableValues?: Record<string, string>;
  scenes?: Scene[];
};

const MediaMissingFallback = () => (
  <div
    style={{
      width: "100%",
      height: "100%",
      backgroundColor: "#1f1f1f",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      color: "#e5e5e5",
      border: "1px solid #333",
      boxSizing: "border-box",
    }}>
    <div style={{ fontSize: "24px", marginBottom: "8px" }}>⚠️</div>
    <div style={{ fontSize: "12px", fontFamily: "sans-serif" }}>Media Missing</div>
  </div>
);

const SafeImg = (props: React.ComponentProps<typeof Img>) => {
  const [error, setError] = React.useState(false);
  if (error) return <MediaMissingFallback />;
  return (
    <Img
      {...props}
      onError={(e) => {
        console.warn(`[VideoPlayer] Image load failed: ${props.src}`);
        if (props.onError) props.onError(e);
        setError(true);
      }}
    />
  );
};

const SafeVideo = (props: React.ComponentProps<typeof Html5Video>) => {
  const [error, setError] = React.useState(false);
  if (error) return <MediaMissingFallback />;
  return (
    <Html5Video
      {...props}
      onError={(e) => {
        console.warn(`[VideoPlayer] Video load failed: ${props.src}`);
        if (props.onError) props.onError(e);
        setError(true);
      }}
    />
  );
};

const SafeAudio = (props: React.ComponentProps<typeof Html5Audio>) => {
  const [error, setError] = React.useState(false);
  if (error) return null;
  return (
    <Html5Audio
      {...props}
      onError={(e) => {
        console.warn(`[VideoPlayer] Audio load failed: ${props.src}`);
        if (props.onError) props.onError(e);
        setError(true);
      }}
    />
  );
};

export function TimelineComposition({
  timelineData,
  isRendering,
  selectedItem,
  setSelectedItem,
  timeline,
  handleUpdateScrubber,
  getPixelsPerSecond,
  variableValues,
  scenes = [],
  videoDimensions = { width: 1920, height: 1080 },
}: TimelineCompositionProps) {
  console.log(`[VideoPlayer] TimelineComposition received variableValues:`, JSON.stringify(variableValues, null, 2));

  // Resolve pixels per second based on rendering mode
  const resolvedPixelsPerSecond = typeof getPixelsPerSecond === "function" ? getPixelsPerSecond() : getPixelsPerSecond;
  // Get all transitions from timelineData
  const allTransitions = getAllTransitions(timelineData);

  // Create a map of scenes for faster lookup (O(1))
  const sceneMap = useMemo(() => {
    return new Map(scenes.map((s) => [s.id, s]));
  }, [scenes]);

  // Helper to resolve variables - supports both variableName field and {{ varName }} syntax in content
  const resolveVariable = (value: string | null, variableName?: string | null) => {
    console.log(
      `[VideoPlayer] resolveVariable called with value="${value}", variableName="${variableName}", variableValues=`,
      variableValues,
    );

    // First check if variableName field is set
    if (variableName && variableValues && variableValues[variableName]) {
      console.log(`[VideoPlayer] Resolved via variableName field: ${variableName} -> ${variableValues[variableName]}`);
      return variableValues[variableName];
    }

    // Then check for {{ varName }} pattern in the value itself
    if (value && variableValues) {
      // Replace all {{ variableName }} patterns with their values
      const resolved = value.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, varName) => {
        const replacement = variableValues[varName] || match;
        console.log(`[VideoPlayer] Resolved template: ${match} -> ${replacement}`);
        return replacement; // Keep original if no value set
      });
      return resolved;
    }

    return value;
  };

  // Step 1: Group scrubbers by trackIndex (memoized for performance)
  const trackGroups = React.useMemo(() => {
    const groups: {
      [trackIndex: number]: {
        content: TimelineDataItem["scrubbers"][0];
        type: string;
      }[];
    } = {};

    for (const timelineItem of timelineData) {
      for (const scrubber of timelineItem.scrubbers) {
        if (!groups[scrubber.trackIndex]) {
          groups[scrubber.trackIndex] = [];
        }
        groups[scrubber.trackIndex].push({
          content: scrubber,
          type: "scrubber",
        });
      }
    }

    // Step 2: Sort scrubbers within each track by startTime
    for (const trackIndex in groups) {
      groups[parseInt(trackIndex)].sort((a, b) => a.content.startTime - b.content.startTime);
    }

    return groups;
  }, [timelineData]);

  // Helper function to create media content
  const createMediaContent = (scrubber: TimelineDataItem["scrubbers"][0] | ScrubberState): React.ReactNode => {
    let content: React.ReactNode = null;

    switch (scrubber.mediaType) {
      case "text":
        content = (
          <AbsoluteFill
            style={{
              left: scrubber.left_player,
              top: scrubber.top_player,
              width: scrubber.width_player,
              height: scrubber.height_player,
              justifyContent: "center",
              alignItems: "center",
            }}>
            <div
              style={{
                textAlign: scrubber.text?.textAlign || "center",
                width: "100%",
              }}>
              <p
                style={{
                  color: scrubber.text?.color || "white",
                  fontSize: scrubber.text?.fontSize ? `${scrubber.text.fontSize}px` : "48px",
                  fontFamily: scrubber.text?.fontFamily || "Arial, sans-serif",
                  fontWeight: scrubber.text?.fontWeight || "normal",
                  margin: 0,
                  padding: "20px",
                }}>
                {resolveVariable(scrubber.text?.textContent || "", scrubber.variableName)}
              </p>
            </div>
          </AbsoluteFill>
        );
        break;
      case "image": {
        const shouldUseLocal = scrubber.mediaUrlLocal && !scrubber.assetId;
        const rawUrl = scrubber.mediaUrlRemote || (shouldUseLocal ? scrubber.mediaUrlLocal : null);
        const imageUrl = resolveVariable(rawUrl, scrubber.variableName);
        if (!imageUrl) {
          console.warn(`[VideoPlayer] Image scrubber ${scrubber.id} has no valid URL`);
          return <MediaMissingFallback />;
        }
        content = (
          <AbsoluteFill
            style={{
              left: scrubber.left_player,
              top: scrubber.top_player,
              width: scrubber.width_player,
              height: scrubber.height_player,
            }}>
            <SafeImg src={imageUrl} />
          </AbsoluteFill>
        );
        break;
      }
      case "video": {
        const shouldUseLocal = scrubber.mediaUrlLocal && !scrubber.assetId;
        const rawUrl = scrubber.mediaUrlRemote || (shouldUseLocal ? scrubber.mediaUrlLocal : null);
        const videoUrl = resolveVariable(rawUrl, scrubber.variableName);
        if (!videoUrl) {
          console.warn(`[VideoPlayer] Video scrubber ${scrubber.id} has no valid URL`);
          return <MediaMissingFallback />;
        }
        content = (
          <AbsoluteFill
            style={{
              left: scrubber.left_player,
              top: scrubber.top_player,
              width: scrubber.width_player,
              height: scrubber.height_player,
            }}>
            <SafeVideo
              src={videoUrl}
              trimBefore={scrubber.trimBefore || undefined}
              trimAfter={scrubber.trimAfter || undefined}
            />
          </AbsoluteFill>
        );
        break;
      }
      case "audio": {
        const shouldUseLocal = scrubber.mediaUrlLocal && !scrubber.assetId;
        const rawUrl = scrubber.mediaUrlRemote || (shouldUseLocal ? scrubber.mediaUrlLocal : null);
        const audioUrl = resolveVariable(rawUrl, scrubber.variableName);
        if (!audioUrl) {
          console.warn(`[VideoPlayer] Audio scrubber ${scrubber.id} has no valid URL`);
          return null;
        }
        content = (
          <AbsoluteFill
            style={{
              left: scrubber.left_player,
              top: scrubber.top_player,
              width: scrubber.width_player,
              height: scrubber.height_player,
            }}>
            <SafeAudio
              src={audioUrl}
              trimBefore={scrubber.trimBefore || undefined}
              trimAfter={scrubber.trimAfter || undefined}
            />
          </AbsoluteFill>
        );
        break;
      }
      case "scene": {
        // Find the scene definition
        const sceneId = "sceneId" in scrubber ? scrubber.sceneId : null;

        if (!sceneId) {
          console.warn(`Scene scrubber ${scrubber.id} missing sceneId`);
          return null;
        }

        const scene = sceneMap.get(sceneId);

        if (!scene) {
          console.warn(`Scene not found: ${sceneId}`);
          return null; // Don't render anything if scene is missing
        }

        // Transform the scene's timeline into renderable data
        // For nested scenes, we assume standard pixels per second for now to keep internal timing consistent relative to the scrubber duration
        const sceneTimelineData = transformTimelineToData(scene.timeline, PIXELS_PER_SECOND);

        // Merge parent variables with scene instance variables
        // Parent variables take precedence if there's conflict, but typically scene variables
        // are scoped to the instance. Using a simple merge here.
        const instanceVariables = "variables" in scrubber ? scrubber.variables : {};
        const mergedVariables = { ...(variableValues || {}), ...instanceVariables };

        // Calculate duration in seconds, handling both type variants
        const durationInSeconds = "duration" in scrubber ? scrubber.duration : scrubber.width / resolvedPixelsPerSecond;

        content = (
          <AbsoluteFill
            style={{
              left: scrubber.left_player,
              top: scrubber.top_player,
              width: scrubber.width_player,
              height: scrubber.height_player,
              overflow: "hidden", // Clip content to scene bounds
            }}>
            <Sequence durationInFrames={Math.round(durationInSeconds * FPS)}>
              <TimelineComposition
                timelineData={sceneTimelineData}
                // Recursive call for nested structure
                isRendering={isRendering}
                selectedItem={null} // Don't select items inside nested scenes
                setSelectedItem={() => {}} // No-op for nested selection
                timeline={scene.timeline} // Pass scene timeline
                handleUpdateScrubber={() => {}} // No-op for nested updates (read-only)
                getPixelsPerSecond={PIXELS_PER_SECOND} // Use standard PPS for internal relative sizing
                variableValues={mergedVariables}
                scenes={scenes} // Pass scene context down for deeper recursion
              />
            </Sequence>
          </AbsoluteFill>
        );
        break;
      }
      default:
        console.warn(`Unknown media type: ${scrubber.mediaType}`);
        break;
    }

    return content;
  };

  // Helper function to get transition presentation
  const getTransitionPresentation = (transition: Transition) => {
    switch (transition.presentation) {
      case "fade":
        return fade();
      case "wipe":
        return wipe();
      case "slide":
        return slide();
      case "flip":
        return flip();
      case "iris":
        return iris({ width: videoDimensions.width, height: videoDimensions.height });
      case "clockWipe":
        return clockWipe({
          width: videoDimensions.width,
          height: videoDimensions.height,
          innerEnterStyle: { WebkitBorderRadius: "50%" },
        });
    }
  };

  // Helper function to get transition timing
  const getTransitionTiming = (transition: Transition) => {
    switch (transition.timing) {
      case "spring":
        return springTiming({ durationInFrames: transition.durationInFrames });
      case "linear":
        return linearTiming({ durationInFrames: transition.durationInFrames });
      default:
        return linearTiming({ durationInFrames: transition.durationInFrames });
    }
  };

  // Step 3 & 4: Create tracks with gaps filled and transitions added
  const trackElements: React.ReactNode[] = [];

  for (const trackIndex in trackGroups) {
    const trackIndexNum = parseInt(trackIndex);
    const scrubbers = trackGroups[trackIndexNum];

    if (scrubbers.length === 0) continue;

    const transitionSeriesElements: React.ReactNode[] = [];
    let totalDurationInFrames = 0;

    // Calculate total duration for this track
    if (scrubbers.length > 0) {
      const lastScrubber = scrubbers[scrubbers.length - 1].content;
      totalDurationInFrames = Math.round(lastScrubber.endTime * FPS);
    }

    for (let i = 0; i < scrubbers.length; i++) {
      const scrubber = scrubbers[i].content;
      const isFirstScrubber = i === 0;
      const isLastScrubber = i === scrubbers.length - 1;

      // Add gap before first scrubber if it doesn't start at 0
      if (isFirstScrubber && scrubber.startTime > 0) {
        transitionSeriesElements.push(
          <TransitionSeries.Sequence
            key={`gap-start-${trackIndex}`}
            durationInFrames={Math.max(Math.round(scrubber.startTime * FPS), 1)}>
            <AbsoluteFill style={{ backgroundColor: "transparent" }} />
          </TransitionSeries.Sequence>,
        );
      }

      // Add left transition if exists (only for first scrubber)
      if (isFirstScrubber && scrubber.left_transition_id && allTransitions[scrubber.left_transition_id]) {
        const transition = allTransitions[scrubber.left_transition_id];
        transitionSeriesElements.push(
          <TransitionSeries.Transition
            key={`left-transition-${scrubber.id}`}
            // @ts-expect-error - NOTE: typescript is being stoopid. The fix is nasty so let it be. it is not an error.
            presentation={getTransitionPresentation(transition)}
            timing={getTransitionTiming(transition)}
          />,
        );
      }

      // NOTE: groupped nested transitions are not supported yet. I'm too tired to implement it. idc. just dont use it. wtv.
      // Process grouped scrubbers - render all children in parallel within a single sequence
      if (scrubber.mediaType === "groupped_scrubber") {
        const groupedScrubbers = scrubber.groupped_scrubbers || [];

        // Calculate the bounds of the group to determine total duration
        const groupLeftmost = Math.min(...groupedScrubbers.map((s) => s.left));
        const groupRightmost = Math.max(...groupedScrubbers.map((s) => s.left + s.width));
        const groupDurationInFrames = Math.max(
          Math.round(((groupRightmost - groupLeftmost) / resolvedPixelsPerSecond) * FPS),
          1,
        );

        // Collect all child sequences to render in parallel
        const parallelSequences: React.ReactNode[] = [];

        for (let j = 0; j < groupedScrubbers.length; j++) {
          const grouppedScrubber = groupedScrubbers[j];

          // Calculate relative timing within the group
          const relativeStartFrame = Math.round(
            ((grouppedScrubber.left - groupLeftmost) / resolvedPixelsPerSecond) * FPS,
          );
          const childDurationInFrames = Math.max(
            Math.round((grouppedScrubber.width / resolvedPixelsPerSecond) * FPS),
            1,
          );

          // Use stack approach to handle potential nesting
          const scrubberStack: Array<{
            scrubber: TimelineDataItem["scrubbers"][0] | ScrubberState;
            keyPrefix: string;
            from: number;
            duration: number;
          }> = [];

          scrubberStack.push({
            scrubber: grouppedScrubber,
            keyPrefix: `grouped-${grouppedScrubber.id}`,
            from: relativeStartFrame,
            duration: childDurationInFrames,
          });

          // Process the stack for this grouped scrubber
          while (scrubberStack.length > 0) {
            const stackItem = scrubberStack.pop()!;
            const { scrubber: currentScrubber, keyPrefix, from, duration } = stackItem;

            if (currentScrubber.mediaType === "groupped_scrubber") {
              // For nested groups, calculate their bounds and add children
              const nestedScrubbers = currentScrubber.groupped_scrubbers || [];
              const nestedLeftmost = Math.min(...nestedScrubbers.map((s) => s.left));

              for (let k = nestedScrubbers.length - 1; k >= 0; k--) {
                const nestedScrubber = nestedScrubbers[k];
                const nestedRelativeStart = Math.round(
                  ((nestedScrubber.left - nestedLeftmost) / resolvedPixelsPerSecond) * FPS,
                );
                const nestedDuration = Math.max(Math.round((nestedScrubber.width / resolvedPixelsPerSecond) * FPS), 1);

                scrubberStack.push({
                  scrubber: nestedScrubber,
                  keyPrefix: `${keyPrefix}-nested-${nestedScrubber.id}`,
                  from: from + nestedRelativeStart,
                  duration: nestedDuration,
                });
              }
            } else {
              // Create media content for non-grouped scrubber
              const mediaContent = createMediaContent(currentScrubber);
              if (mediaContent) {
                parallelSequences.push(
                  <Sequence key={keyPrefix} from={from} durationInFrames={duration}>
                    {mediaContent}
                  </Sequence>,
                );
              }
            }
          }
        }

        // Wrap all parallel sequences in a single TransitionSeries.Sequence
        transitionSeriesElements.push(
          <TransitionSeries.Sequence key={`group-${scrubber.id}`} durationInFrames={groupDurationInFrames}>
            <AbsoluteFill>{parallelSequences}</AbsoluteFill>
          </TransitionSeries.Sequence>,
        );
      } else {
        // Process regular scrubbers using the stack approach
        const scrubberStack: Array<{
          scrubber: TimelineDataItem["scrubbers"][0] | ScrubberState;
          keyPrefix: string;
          durationCalculation: () => number;
        }> = [];

        scrubberStack.push({
          scrubber: scrubber,
          keyPrefix: `scrubber-${scrubber.id}`,
          durationCalculation: () => Math.max(Math.round(scrubber.duration * FPS), 1),
        });

        // Process the stack
        while (scrubberStack.length > 0) {
          const stackItem = scrubberStack.pop()!;
          const { scrubber: currentScrubber, keyPrefix, durationCalculation } = stackItem;

          if (currentScrubber.mediaType === "groupped_scrubber") {
            // Add nested grouped scrubbers to the stack in reverse order
            for (let k = (currentScrubber.groupped_scrubbers || []).length - 1; k >= 0; k--) {
              const nestedScrubber = (currentScrubber.groupped_scrubbers || [])[k];
              scrubberStack.push({
                scrubber: nestedScrubber,
                keyPrefix: `${keyPrefix}-nested-${nestedScrubber.id}`,
                durationCalculation: () =>
                  Math.max(Math.round((nestedScrubber.width / resolvedPixelsPerSecond) * FPS), 1),
              });
            }
          } else {
            // Create media content for non-grouped scrubber
            const mediaContent = createMediaContent(currentScrubber);
            if (mediaContent) {
              transitionSeriesElements.push(
                <TransitionSeries.Sequence key={keyPrefix} durationInFrames={durationCalculation()}>
                  {mediaContent}
                </TransitionSeries.Sequence>,
              );
            }
          }
        }
      }

      // Add right transition if exists
      if (scrubber.right_transition_id && allTransitions[scrubber.right_transition_id]) {
        const transition = allTransitions[scrubber.right_transition_id];
        transitionSeriesElements.push(
          <TransitionSeries.Transition
            key={`right-transition-${scrubber.id}`}
            // @ts-expect-error - NOTE: typescript is being stoopid. The fix is nasty so let it be. it is not an error.
            presentation={getTransitionPresentation(transition)}
            timing={getTransitionTiming(transition)}
          />,
        );
      }

      // Add gap between scrubbers if there's a gap
      if (!isLastScrubber) {
        const nextScrubber = scrubbers[i + 1].content;
        const gapStart = scrubber.endTime;
        const gapEnd = nextScrubber.startTime;

        if (gapEnd > gapStart) {
          const gapDuration = gapEnd - gapStart;
          transitionSeriesElements.push(
            <TransitionSeries.Sequence
              key={`gap-${trackIndex}-${i}`}
              durationInFrames={Math.max(Math.round(gapDuration * FPS), 1)}>
              <AbsoluteFill style={{ backgroundColor: "transparent" }} />
            </TransitionSeries.Sequence>,
          );
        }
      }
    }

    // Create the track sequence
    if (transitionSeriesElements.length > 0) {
      trackElements.push(
        <Sequence key={`track-${trackIndex}`} durationInFrames={totalDurationInFrames}>
          <TransitionSeries>{transitionSeriesElements}</TransitionSeries>
        </Sequence>,
      );
    }
  }

  if (isRendering) {
    return (
      <AbsoluteFill style={outer}>
        <AbsoluteFill style={layerContainer}>{trackElements}</AbsoluteFill>
      </AbsoluteFill>
    );
  } else {
    return (
      <AbsoluteFill style={outer}>
        <AbsoluteFill style={layerContainer}>{trackElements}</AbsoluteFill>
        <SortedOutlines
          handleUpdateScrubber={handleUpdateScrubber}
          selectedItem={selectedItem}
          timeline={timeline}
          setSelectedItem={setSelectedItem}
        />
      </AbsoluteFill>
    );
  }
}

export function VideoPlayer({
  timelineData,
  durationInFrames,
  ref,
  compositionWidth,
  compositionHeight,
  timeline,
  handleUpdateScrubber,
  selectedItem,
  setSelectedItem,
  getPixelsPerSecond,
  variableValues,
  scenes,
}: VideoPlayerProps) {
  // Calculate composition width if not provided
  if (compositionWidth === null) {
    let maxWidth = 0;
    for (const item of timelineData) {
      for (const scrubber of item.scrubbers) {
        if (scrubber.media_width !== null && scrubber.media_width > maxWidth) {
          maxWidth = scrubber.media_width;
        }
      }
    }
    compositionWidth = maxWidth || 1920; // Default to 1920 if no media found
  }

  // Calculate composition height if not provided
  if (compositionHeight === null) {
    let maxHeight = 0;
    for (const item of timelineData) {
      for (const scrubber of item.scrubbers) {
        if (scrubber.media_height !== null && scrubber.media_height > maxHeight) {
          maxHeight = scrubber.media_height;
        }
      }
    }
    compositionHeight = maxHeight || 1080; // Default to 1080 if no media found
  }

  // Guard against invalid dimensions (e.g., user typed 0, only-audio timelines)
  const safeWidth = !compositionWidth || compositionWidth <= 0 ? 1920 : compositionWidth;
  const safeHeight = !compositionHeight || compositionHeight <= 0 ? 1080 : compositionHeight;
  const safeDuration = Math.max(1, durationInFrames || 1);

  return (
    <Player
      ref={ref}
      component={TimelineComposition}
      inputProps={{
        timelineData,
        durationInFrames,
        isRendering: false,
        selectedItem,
        setSelectedItem,
        timeline,
        handleUpdateScrubber,
        getPixelsPerSecond,
        variableValues,
        scenes,
      }}
      durationInFrames={safeDuration}
      compositionWidth={safeWidth}
      compositionHeight={safeHeight}
      fps={30}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        zIndex: 1,
      }}
      acknowledgeRemotionLicense
    />
  );
}
