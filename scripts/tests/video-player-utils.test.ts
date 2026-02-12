import { describe, expect, it } from "vitest";

import { getAllTransitions } from "~/utils/video-player-utils";

describe("getAllTransitions", () => {
  it("returns an empty map for empty timeline", () => {
    const emptyTransitions = getAllTransitions([]);
    expect(emptyTransitions).toEqual({});
  });
});
