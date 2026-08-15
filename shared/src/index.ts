export const PIPELINE_STEPS = [
  "style",
  "characters",
  "portraits",
  "chapters",
  "illustrations"
] as const;

export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export type ProjectStatus =
  | "created"
  | "style_done"
  | "characters_done"
  | "portraits_done"
  | "chapters_done"
  | "done";

export type StepState = "idle" | "running" | "failed";

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface Character {
  id: string;
  name: string;
  prompt: string;
  portraitPath: string | null;
  sortOrder: number;
}

export interface Chapter {
  id: string;
  title: string;
  prompt: string;
  illustrationPath: string | null;
  sortOrder: number;
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  bookPath: string;
  status: ProjectStatus;
  stepState: StepState;
  runningStep: PipelineStep | null;
  stepStartedAt: string | null;
  stepError: string | null;
  createdAt: string;
  updatedAt: string;
  style: string | null;
  characters: Character[];
  chapters: Chapter[];
}
