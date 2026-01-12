import { useState, useCallback } from "react";
import type { Scene, SceneVariableSchema, ElasticityRule, TimelineState } from "~/components/timeline/types";
import { generateUUID } from "~/utils/uuid";
import { toast } from "sonner";

export const useScenes = (projectId: string) => {
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [loading, setLoading] = useState(false);

    // Load scenes from server
    const loadScenes = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
                credentials: "include",
            });
            if (res.ok) {
                const data = await res.json();
                setScenes(data.scenes || []);
            }
        } catch (error) {
            console.error("Failed to load scenes:", error);
            toast.error("Failed to load scenes");
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    // Save scenes to server
    const saveScenes = useCallback(
        async (updatedScenes: Scene[]) => {
            try {
                const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ scenes: updatedScenes }),
                });
                if (res.ok) {
                    setScenes(updatedScenes);
                    return true;
                }
                toast.error("Failed to save scenes");
                return false;
            } catch (error) {
                console.error("Failed to save scenes:", error);
                toast.error("Failed to save scenes");
                return false;
            }
        },
        [projectId],
    );

    // Create new scene
    const createScene = useCallback(
        async (name: string) => {
            const newScene: Scene = {
                id: generateUUID(),
                name,
                description: "",
                timeline: {
                    tracks: [
                        { id: "track-1", scrubbers: [], transitions: [] },
                        { id: "track-2", scrubbers: [], transitions: [] },
                        { id: "track-3", scrubbers: [], transitions: [] },
                        { id: "track-4", scrubbers: [], transitions: [] },
                    ],
                },
                variableSchema: [],
                elasticityRules: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            const updatedScenes = [...scenes, newScene];
            const success = await saveScenes(updatedScenes);
            if (success) {
                toast.success(`Scene "${name}" created`);
                return newScene.id;
            }
            return null;
        },
        [scenes, saveScenes],
    );

    // Update scene
    const updateScene = useCallback(
        async (
            sceneId: string,
            updates: {
                name?: string;
                description?: string;
                timeline?: TimelineState;
                variableSchema?: SceneVariableSchema[];
                elasticityRules?: ElasticityRule[];
            },
        ) => {
            const updatedScenes = scenes.map((scene) =>
                scene.id === sceneId
                    ? {
                        ...scene,
                        ...updates,
                        updatedAt: new Date().toISOString(),
                    }
                    : scene,
            );

            const success = await saveScenes(updatedScenes);
            if (success) {
                toast.success("Scene updated");
                return true;
            }
            return false;
        },
        [scenes, saveScenes],
    );

    // Delete scene
    const deleteScene = useCallback(
        async (sceneId: string) => {
            const scene = scenes.find((s) => s.id === sceneId);
            if (!scene) return false;

            const updatedScenes = scenes.filter((s) => s.id !== sceneId);
            const success = await saveScenes(updatedScenes);
            if (success) {
                toast.success(`Scene "${scene.name}" deleted`);
                return true;
            }
            return false;
        },
        [scenes, saveScenes],
    );

    // Get scene by ID
    const getScene = useCallback(
        (sceneId: string) => {
            return scenes.find((s) => s.id === sceneId);
        },
        [scenes],
    );

    return {
        scenes,
        loading,
        loadScenes,
        createScene,
        updateScene,
        deleteScene,
        getScene,
    };
};
