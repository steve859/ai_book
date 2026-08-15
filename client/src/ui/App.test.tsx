import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project, User } from "@ai-book/shared";
import { App } from "./App";

const user: User = {
  id: "user-1",
  name: "Mira Hassan",
  email: "mira@example.com",
  createdAt: "2026-08-15T00:00:00.000Z",
};

const project: Project = {
  id: "project-1",
  userId: user.id,
  title: "The River Book",
  bookPath: "books/project-1.txt",
  status: "created",
  stepState: "idle",
  runningStep: null,
  stepStartedAt: null,
  stepError: null,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
  style: null,
  characters: [],
  chapters: [],
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("signs in and loads the user's projects", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "No active session." }, 401))
      .mockResolvedValueOnce(jsonResponse({ user }))
      .mockResolvedValueOnce(jsonResponse({ projects: [project] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.change(await screen.findByLabelText("Full name"), {
      target: { value: "Mira Hassan" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "mira@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(await screen.findByRole("heading", { name: "Your projects" })).toBeInTheDocument();
    expect(screen.getByText("The River Book")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/session",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("shows an empty state when the user has no projects", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ user }))
      .mockResolvedValueOnce(jsonResponse({ projects: [] }));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "No projects yet" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /new project/i })).toHaveLength(2);
  });

  it("restores a session and opens a project detail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ user }))
      .mockResolvedValueOnce(jsonResponse({ projects: [project] }))
      .mockResolvedValueOnce(
        jsonResponse({ project: { ...project, bookText: "Once upon a river." } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /The River Book/i }));

    await waitFor(() => {
      expect(screen.getByText("Next step")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Generate Style/i })).toBeInTheDocument();
    expect(screen.getByText("Once upon a river.")).toBeInTheDocument();
  });

  it("names the pipeline step that is currently running", async () => {
    const runningProject: Project = {
      ...project,
      status: "characters_done",
      stepState: "running",
      runningStep: "portraits",
      stepStartedAt: "2026-08-15T00:01:00.000Z",
      style: "Watercolor",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ user }))
      .mockResolvedValueOnce(jsonResponse({ projects: [runningProject] }))
      .mockResolvedValueOnce(
        jsonResponse({ project: { ...runningProject, bookText: "Once upon a river." } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /The River Book/i }));

    expect(await screen.findByRole("heading", { name: "Portraits" })).toBeInTheDocument();
    expect(screen.getByText("Generating")).toBeInTheDocument();
    expect(
      screen.getByText("Generation is running. This page only polls existing progress."),
    ).toBeInTheDocument();
  });

  it("shows a failed step and resets only that step for retry", async () => {
    const failedProject: Project = {
      ...project,
      status: "style_done",
      stepState: "failed",
      runningStep: "characters",
      stepStartedAt: "2026-08-15T00:01:00.000Z",
      stepError: "Gemini request failed.",
      style: "Watercolor",
    };
    const resetProject: Project = {
      ...failedProject,
      stepState: "idle",
      runningStep: null,
      stepStartedAt: null,
      stepError: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ user }))
      .mockResolvedValueOnce(jsonResponse({ projects: [failedProject] }))
      .mockResolvedValueOnce(
        jsonResponse({ project: { ...failedProject, bookText: "Once upon a river." } }),
      )
      .mockResolvedValueOnce(jsonResponse({ project: resetProject }));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /The River Book/i }));
    expect(await screen.findByRole("heading", { name: "Characters failed" })).toBeInTheDocument();
    expect(screen.getByText("Gemini request failed.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reset for retry/i }));

    expect(await screen.findByRole("button", { name: /generate characters/i })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/projects/project-1/steps/characters/retry",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
});
