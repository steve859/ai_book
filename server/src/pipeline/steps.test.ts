import { describe, expect, it } from "vitest";
import { expectedStatusBefore, isPipelineStep } from "./steps.js";

describe("pipeline steps", () => {
  it("recognizes only the five required user-triggered steps", () => {
    expect(isPipelineStep("style")).toBe(true);
    expect(isPipelineStep("characters")).toBe(true);
    expect(isPipelineStep("portraits")).toBe(true);
    expect(isPipelineStep("chapters")).toBe(true);
    expect(isPipelineStep("illustrations")).toBe(true);
    expect(isPipelineStep("animation")).toBe(false);
  });

  it("maps each step to the required previous project status", () => {
    expect(expectedStatusBefore("style")).toBe("created");
    expect(expectedStatusBefore("characters")).toBe("style_done");
    expect(expectedStatusBefore("portraits")).toBe("characters_done");
    expect(expectedStatusBefore("chapters")).toBe("portraits_done");
    expect(expectedStatusBefore("illustrations")).toBe("chapters_done");
  });
});
