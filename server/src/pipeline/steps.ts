import { PIPELINE_STEPS, type PipelineStep, type ProjectStatus } from "@ai-book/shared";

export function isPipelineStep(value: string): value is PipelineStep {
  return PIPELINE_STEPS.includes(value as PipelineStep);
}

export function expectedStatusBefore(step: PipelineStep): ProjectStatus {
  switch (step) {
    case "style":
      return "created";
    case "characters":
      return "style_done";
    case "portraits":
      return "characters_done";
    case "chapters":
      return "portraits_done";
    case "illustrations":
      return "chapters_done";
  }
}

export function statusAfter(step: PipelineStep): ProjectStatus {
  switch (step) {
    case "style":
      return "style_done";
    case "characters":
      return "characters_done";
    case "portraits":
      return "portraits_done";
    case "chapters":
      return "chapters_done";
    case "illustrations":
      return "done";
  }
}
