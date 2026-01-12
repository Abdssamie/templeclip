import React from "react";
import { useOutletContext } from "react-router";
import { ScenesPanel } from "./ScenesPanel";
import type { Scene } from "~/components/timeline/types";

interface ScenesContext {
    scenes: Scene[];
    activeSceneId: string | null;
    onCreateScene: (name: string) => Promise<string | null>;
    onSelectScene: (sceneId: string | null) => void;
    onDeleteScene: (sceneId: string) => Promise<boolean>;
    onRenameScene: (sceneId: string, newName: string) => Promise<boolean>;
}

export default function ScenesPage() {
    const {
        scenes,
        activeSceneId,
        onCreateScene,
        onSelectScene,
        onDeleteScene,
        onRenameScene,
    } = useOutletContext<ScenesContext>();

    return (
        <ScenesPanel
            scenes={scenes}
            activeSceneId={activeSceneId}
            onCreateScene={onCreateScene}
            onSelectScene={onSelectScene}
            onDeleteScene={onDeleteScene}
            onRenameScene={onRenameScene}
        />
    );
}
