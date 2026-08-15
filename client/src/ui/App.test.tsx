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
      .mockResolvedValueOnce(jsonResponse({ projects: [] }));
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
    expect(screen.getByText("No projects yet")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/session",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
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
});
