import React from "react";
import { Download, Clapperboard, FileVideo, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import type { Scene, TimelineDataItem, TimelineState } from "~/components/timeline/types";

interface ExportMenuProps {
  projectId: string;
  scenes: Scene[];
  isRendering: boolean;
  // For timeline export
  activeSceneId: string | null;
  projectTimeline: TimelineState | null;
  getTimelineData: () => TimelineDataItem[];
  getTimelineState: () => TimelineState;
  setTimelineFromServer: (t: TimelineState) => void;
  updateScene: (sceneId: string, updates: Partial<Scene>) => Promise<boolean>;
  durationInFrames: number;
  width: number;
  height: number;
  isAutoSize: boolean;
  // Save handler
  onSave: () => Promise<void>;
  // Render handlers
  onRenderTimeline: (
    timelineData: TimelineDataItem[],
    compositionWidth: number,
    compositionHeight: number,
    durationInFrames: number,
  ) => void;
  onRenderScenes: (
    projectId: string,
    scenes: Array<{ sceneId: string; variables: Record<string, string>; duration?: number }>,
    compositionWidth: number,
    compositionHeight: number,
    applyElasticity?: boolean,
  ) => void;
}

export function ExportMenu({
  projectId,
  scenes,
  isRendering,
  activeSceneId,
  projectTimeline,
  getTimelineData,
  getTimelineState,
  setTimelineFromServer,
  updateScene,
  durationInFrames,
  width,
  height,
  isAutoSize,
  onSave,
  onRenderTimeline,
  onRenderScenes,
}: ExportMenuProps) {
  const handleExportTimeline = async () => {
    // Auto-save the project before exporting
    await onSave();

    // If we're editing a scene, save it first and switch to main timeline
    if (activeSceneId !== null) {
      const currentScene = scenes.find((s) => s.id === activeSceneId);
      if (currentScene) {
        await updateScene(activeSceneId, { timeline: getTimelineState() });
      }
      // Load main timeline
      if (projectTimeline) {
        setTimelineFromServer(projectTimeline);
      }
      // Give React a tick to update the timeline state
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const timelineData = getTimelineData();
    const duration = durationInFrames;

    if (timelineData.length === 0 || timelineData.every((item) => item.scrubbers.length === 0)) {
      toast.error("Timeline is empty. Add some media first!");
      return;
    }

    onRenderTimeline(timelineData, isAutoSize ? 1920 : width, isAutoSize ? 1080 : height, duration);
  };

  const handleExportAllScenes = async () => {
    // Auto-save the project before exporting
    await onSave();

    if (!projectId || projectId === "") {
      toast.error("No project ID found");
      return;
    }

    if (scenes.length === 0) {
      toast.error("No scenes to render. Create scenes first!");
      return;
    }

    // Build scene requests for all scenes
    const sceneRequests = scenes.map((scene) => ({
      sceneId: scene.id,
      variables: {},
      // Use default duration for each scene - the backend will calculate from timeline
    }));

    onRenderScenes(projectId, sceneRequests, isAutoSize ? 1920 : width, isAutoSize ? 1080 : height, true);
  };

  const handleExportSingleScene = async (scene: Scene) => {
    // Auto-save the project before exporting
    await onSave();

    if (!projectId || projectId === "") {
      toast.error("No project ID found");
      return;
    }

    const sceneRequest = [
      {
        sceneId: scene.id,
        variables: {},
      },
    ];

    onRenderScenes(projectId, sceneRequest, isAutoSize ? 1920 : width, isAutoSize ? 1080 : height, true);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="default" size="sm" disabled={isRendering} className="h-7 px-2 text-xs">
          <Download className="h-3 w-3 mr-1" />
          {isRendering ? "Rendering..." : "Export"}
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuItem onClick={handleExportTimeline} disabled={isRendering}>
          <FileVideo className="h-4 w-4 mr-2" />
          <span className="text-xs">Export Timeline</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportAllScenes} disabled={isRendering || scenes.length === 0}>
          <Clapperboard className="h-4 w-4 mr-2" />
          <span className="text-xs">Export All Scenes</span>
        </DropdownMenuItem>

        {scenes.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">Individual Scenes</DropdownMenuLabel>
            {scenes.map((scene) => (
              <DropdownMenuItem key={scene.id} onClick={() => handleExportSingleScene(scene)} disabled={isRendering}>
                <Clapperboard className="h-4 w-4 mr-2" />
                <span className="text-xs">{scene.name}</span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
