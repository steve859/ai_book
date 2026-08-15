import type { PipelineStep, Project, User } from "@ai-book/shared";

export type ProjectDetail = Project & { bookText?: string };

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly project?: Project | null,
  ) {
    super(message);
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const body = (await response.json()) as {
    error?: string;
    project?: Project | null;
  } & T;
  if (!response.ok) {
    throw new ApiError(body.error ?? `Request failed with status ${response.status}.`, response.status, body.project);
  }

  return body;
}

export const api = {
  getSession: () => request<{ user: User }>("/api/session"),

  signIn: (input: { name: string; email: string }) =>
    request<{ user: User }>("/api/session", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  signOut: () => request<void>("/api/session", { method: "DELETE" }),

  listProjects: () => request<{ projects: Project[] }>("/api/projects"),

  createProject: (input: { title: string; bookText: string }) =>
    request<{ project: Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getProject: (projectId: string) =>
    request<{ project: ProjectDetail }>(`/api/projects/${projectId}`),

  runStep: (projectId: string, step: PipelineStep, body: Record<string, unknown> = {}) =>
    request<{ project: Project }>(`/api/projects/${projectId}/steps/${step}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  retryStep: (projectId: string, step: PipelineStep) =>
    request<{ project: Project }>(`/api/projects/${projectId}/steps/${step}/retry`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
};

export function assetUrl(assetPath: string | null) {
  return assetPath ? `/api/assets/${assetPath.split("\\").join("/")}` : null;
}
