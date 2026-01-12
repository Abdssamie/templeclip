import React from "react";
import { Card } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Film, Music } from "lucide-react";
import type { ElasticityRule, ScrubberState } from "~/components/timeline/types";

interface ElasticityRulesEditorProps {
    scrubbers: ScrubberState[];
    elasticityRules: ElasticityRule[];
    onChange: (rules: ElasticityRule[]) => void;
}

export const ElasticityRulesEditor: React.FC<ElasticityRulesEditorProps> = ({
    scrubbers,
    elasticityRules,
    onChange,
}) => {
    // Only show video and audio scrubbers (images/text can't stretch)
    const stretchableScrubbers = scrubbers.filter(
        (s) => s.mediaType === "video" || s.mediaType === "audio"
    );

    const getRule = (scrubberId: string): "fixed" | "stretch" => {
        const rule = elasticityRules.find((r) => r.scrubberId === scrubberId);
        return rule?.strategy || "fixed";
    };

    const toggleStrategy = (scrubberId: string) => {
        const currentStrategy = getRule(scrubberId);
        const newStrategy = currentStrategy === "fixed" ? "stretch" : "fixed";

        const existingRuleIndex = elasticityRules.findIndex(
            (r) => r.scrubberId === scrubberId
        );

        let newRules: ElasticityRule[];
        if (existingRuleIndex >= 0) {
            // Update existing rule
            newRules = elasticityRules.map((r, i) =>
                i === existingRuleIndex ? { ...r, strategy: newStrategy } : r
            );
        } else {
            // Add new rule
            newRules = [...elasticityRules, { scrubberId, strategy: newStrategy }];
        }

        onChange(newRules);
    };

    if (stretchableScrubbers.length === 0) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Elasticity Rules</h3>
                </div>
                <Card className="p-6 bg-muted/30">
                    <p className="text-sm text-muted-foreground text-center">
                        No video or audio scrubbers in this scene.
                        <br />
                        Add video/audio to configure elasticity.
                    </p>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Elasticity Rules</h3>
                <span className="text-xs text-muted-foreground">
                    {stretchableScrubbers.length} stretchable item
                    {stretchableScrubbers.length !== 1 ? "s" : ""}
                </span>
            </div>

            <div className="space-y-2">
                {stretchableScrubbers.map((scrubber) => {
                    const strategy = getRule(scrubber.id);
                    const isStretch = strategy === "stretch";

                    return (
                        <Card key={scrubber.id} className="p-3">
                            <div className="flex items-center gap-3">
                                <div className="flex-shrink-0">
                                    {scrubber.mediaType === "video" ? (
                                        <Film className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <Music className="h-4 w-4 text-muted-foreground" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">
                                        {scrubber.name || "Unnamed"}
                                    </p>
                                    <p className="text-xs text-muted-foreground capitalize">
                                        {scrubber.mediaType}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant={isStretch ? "default" : "outline"}
                                    onClick={() => toggleStrategy(scrubber.id)}
                                    className="h-7 text-xs"
                                >
                                    {isStretch ? "Stretch" : "Fixed"}
                                </Button>
                            </div>
                            {isStretch && (
                                <p className="text-xs text-muted-foreground mt-2 ml-7">
                                    Will expand to match actual media duration during rendering
                                </p>
                            )}
                        </Card>
                    );
                })}
            </div>

            <Card className="p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground">
                    <strong>Stretch:</strong> Scrubber expands to match actual media duration at render time.
                    <br />
                    <strong>Fixed:</strong> Scrubber keeps the duration set in the editor.
                </p>
            </Card>
        </div>
    );
};
