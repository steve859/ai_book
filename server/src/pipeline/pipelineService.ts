import type { PipelineStep } from "@ai-book/shared";
import { expectedStatusBefore, statusAfter } from "./steps.js";

interface ProjectTransitionRepository {
  setStepRunning(input: {
    projectId: string;
    userId: string;
    step: PipelineStep;
    expectedStatus: ReturnType<typeof expectedStatusBefore>;
    now?: string;
  }): boolean;
  finishStep(input: {
    projectId: string;
    userId: string;
    step: PipelineStep;
    nextStatus: ReturnType<typeof statusAfter>;
    now?: string;
  }): boolean;
  failStep(input: {
    projectId: string;
    userId: string;
    step: PipelineStep;
    error: string;
    now?: string;
  }): boolean;
  clearFailedStep(input: {
    projectId: string;
    userId: string;
    step: PipelineStep;
    now?: string;
  }): boolean;
  clearStaleRunningStep(input: {
    projectId: string;
    userId: string;
    step: PipelineStep;
    staleBefore: string;
    now?: string;
  }): boolean;
}

export function createPipelineService(projects: ProjectTransitionRepository) {
  return {
    startStep(input: {
      projectId: string;
      userId: string;
      step: PipelineStep;
      now?: string;
    }): boolean {
      return projects.setStepRunning({
        ...input,
        expectedStatus: expectedStatusBefore(input.step),
      });
    },

    finishStep(input: {
      projectId: string;
      userId: string;
      step: PipelineStep;
      now?: string;
    }): boolean {
      return projects.finishStep({
        ...input,
        nextStatus: statusAfter(input.step),
      });
    },

    failStep(input: {
      projectId: string;
      userId: string;
      step: PipelineStep;
      error: string;
      now?: string;
    }): boolean {
      return projects.failStep(input);
    },

    clearFailedStep(input: {
      projectId: string;
      userId: string;
      step: PipelineStep;
      now?: string;
    }): boolean {
      return projects.clearFailedStep(input);
    },

    clearStaleRunningStep(input: {
      projectId: string;
      userId: string;
      step: PipelineStep;
      staleBefore: string;
      now?: string;
    }): boolean {
      return projects.clearStaleRunningStep(input);
    },
  };
}
