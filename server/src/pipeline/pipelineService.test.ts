import { describe, expect, it, vi } from "vitest";
import { createPipelineService } from "./pipelineService.js";

describe("pipeline service", () => {
  it("starts a step with the expected previous status", () => {
    const projects = {
      setStepRunning: vi.fn(() => true),
      finishStep: vi.fn(),
      failStep: vi.fn(),
      clearFailedStep: vi.fn(),
      clearStaleRunningStep: vi.fn()
    };
    const service = createPipelineService(projects);

    expect(
      service.startStep({
        projectId: "project-1",
        userId: "user-1",
        step: "chapters",
        now: "2026-08-14T00:00:00.000Z"
      })
    ).toBe(true);
    expect(projects.setStepRunning).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
      step: "chapters",
      expectedStatus: "portraits_done",
      now: "2026-08-14T00:00:00.000Z"
    });
  });

  it("finishes a step with the correct next status", () => {
    const projects = {
      setStepRunning: vi.fn(),
      finishStep: vi.fn(() => true),
      failStep: vi.fn(),
      clearFailedStep: vi.fn(),
      clearStaleRunningStep: vi.fn()
    };
    const service = createPipelineService(projects);

    expect(
      service.finishStep({
        projectId: "project-1",
        userId: "user-1",
        step: "illustrations"
      })
    ).toBe(true);
    expect(projects.finishStep).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
      step: "illustrations",
      nextStatus: "done"
    });
  });
});
