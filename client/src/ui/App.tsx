import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronRight,
  LoaderCircle,
  LogOut,
  Plus,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  PIPELINE_STEPS,
  type PipelineStep,
  type Project,
  type ProjectStatus,
  type User,
} from "@ai-book/shared";
import { ApiError, api, assetUrl, type ProjectDetail } from "../api/client";

type View = "projects" | "new" | "detail";

const STEP_LABELS: Record<PipelineStep, string> = {
  style: "Style",
  characters: "Characters",
  portraits: "Portraits",
  chapters: "Chapters",
  illustrations: "Illustrations",
};

const COMPLETED_STEPS: Record<ProjectStatus, number> = {
  created: 0,
  style_done: 1,
  characters_done: 2,
  portraits_done: 3,
  chapters_done: 4,
  done: 5,
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function projectLabel(project: Project) {
  if (project.status === "done") return "Complete";
  if (project.stepState === "running") return `Generating ${STEP_LABELS[project.runningStep!]}`;
  if (project.stepState === "failed") return `${STEP_LABELS[project.runningStep!]} failed`;
  return `${COMPLETED_STEPS[project.status]} of 5 steps complete`;
}

function mergeProject(current: ProjectDetail, next: Project): ProjectDetail {
  return { ...next, bookText: current.bookText };
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [view, setView] = useState<View>("projects");
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingProjectId = project?.id;
  const pollingStepState = project?.stepState;

  const loadProjects = useCallback(async () => {
    const response = await api.listProjects();
    setProjects(response.projects);
  }, []);

  useEffect(() => {
    let active = true;
    api
      .getSession()
      .then(async ({ user: restoredUser }) => {
        if (!active) return;
        setUser(restoredUser);
        await loadProjects();
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof ApiError && requestError.status === 401) return;
        if (active) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (active) setBooting(false);
      });

    return () => {
      active = false;
    };
  }, [loadProjects]);

  useEffect(() => {
    if (!pollingProjectId || pollingStepState !== "running") return;

    const interval = window.setInterval(() => {
      api
        .getProject(pollingProjectId)
        .then(({ project: refreshed }) => setProject(refreshed))
        .catch((requestError: unknown) => setError(errorMessage(requestError)));
    }, 2000);

    return () => window.clearInterval(interval);
  }, [pollingProjectId, pollingStepState]);

  async function openProject(projectId: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getProject(projectId);
      setProject(response.project);
      setView("detail");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await api.signOut();
    setUser(null);
    setProjects([]);
    setProject(null);
    setView("projects");
  }

  async function returnToProjects() {
    setLoading(true);
    try {
      await loadProjects();
      setProject(null);
      setView("projects");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  if (booting) {
    return (
      <main className="loading-page" aria-label="Loading application">
        <LoaderCircle className="spin" size={28} />
      </main>
    );
  }

  if (!user) {
    return (
      <SignIn
        initialError={error}
        onSubmit={async (input) => {
          setLoading(true);
          setError(null);
          try {
            const response = await api.signIn(input);
            setUser(response.user);
            await loadProjects();
          } catch (requestError) {
            setError(errorMessage(requestError));
          } finally {
            setLoading(false);
          }
        }}
        loading={loading}
      />
    );
  }

  return (
    <div className="app-shell">
      <Header user={user} onProjects={returnToProjects} onSignOut={signOut} />
      {error && (
        <div className="global-alert" role="alert">
          <span>{error}</span>
          <button className="icon-button" onClick={() => setError(null)} title="Dismiss error">
            <X size={17} />
          </button>
        </div>
      )}

      {view === "projects" && (
        <ProjectList
          projects={projects}
          loading={loading}
          onNew={() => setView("new")}
          onOpen={openProject}
        />
      )}

      {view === "new" && (
        <NewProject
          loading={loading}
          onBack={() => setView("projects")}
          onCreate={async (input) => {
            setLoading(true);
            setError(null);
            try {
              const response = await api.createProject(input);
              await openProject(response.project.id);
            } catch (requestError) {
              setError(errorMessage(requestError));
            } finally {
              setLoading(false);
            }
          }}
        />
      )}

      {view === "detail" && project && (
        <ProjectView
          project={project}
          onBack={returnToProjects}
          onProject={setProject}
          onError={setError}
        />
      )}
    </div>
  );
}

function Header({
  user,
  onProjects,
  onSignOut,
}: {
  user: User;
  onProjects: () => void;
  onSignOut: () => void;
}) {
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button className="brand" onClick={onProjects}>
          <span className="brand-mark">G</span>
          <span>Book Illustration Studio</span>
        </button>
        <div className="user-menu">
          <span className="avatar">{initials}</span>
          <span className="user-name">{user.name}</span>
          <button className="icon-button" onClick={onSignOut} title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

function SignIn({
  onSubmit,
  loading,
  initialError,
}: {
  onSubmit: (input: { name: string; email: string }) => Promise<void>;
  loading: boolean;
  initialError: string | null;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <main className="auth-page">
      <form
        className="auth-panel"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit({ name, email });
        }}
      >
        <div className="auth-mark">G</div>
        <h1>Book Illustration Studio</h1>
        <p>Enter your details to start or resume an illustration project.</p>
        <label>
          Full name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        {initialError && <div className="form-error">{initialError}</div>}
        <button className="button primary full" disabled={loading}>
          {loading ? <LoaderCircle className="spin" size={17} /> : null}
          Continue
          {!loading ? <ChevronRight size={17} /> : null}
        </button>
        <small>No password. An existing email resumes its saved projects.</small>
      </form>
    </main>
  );
}

function ProjectList({
  projects,
  loading,
  onNew,
  onOpen,
}: {
  projects: Project[];
  loading: boolean;
  onNew: () => void;
  onOpen: (projectId: string) => void;
}) {
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Your projects</h1>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={17} /> New project
        </button>
      </div>

      {projects.length === 0 ? (
        <section className="empty-state">
          <BookOpen size={32} />
          <h2>No projects yet</h2>
          <p>Create a project from pasted text or a plain `.txt` file.</p>
          <button className="button primary" onClick={onNew}>
            <Plus size={17} /> New project
          </button>
        </section>
      ) : (
        <div className="project-list" aria-busy={loading}>
          {projects.map((item) => {
            const complete = COMPLETED_STEPS[item.status];
            return (
              <button className="project-row" key={item.id} onClick={() => onOpen(item.id)}>
                <div className="project-main">
                  <h2>{item.title}</h2>
                  <span>
                    Created {new Date(item.createdAt).toLocaleDateString()} · {projectLabel(item)}
                  </span>
                </div>
                <div className="mini-progress" aria-label={`${complete} of 5 steps complete`}>
                  {PIPELINE_STEPS.map((step, index) => (
                    <span className={index < complete ? "complete" : ""} key={step} />
                  ))}
                </div>
                <ChevronRight size={19} />
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}

function NewProject({
  onBack,
  onCreate,
  loading,
}: {
  onBack: () => void;
  onCreate: (input: { title: string; bookText: string }) => Promise<void>;
  loading: boolean;
}) {
  const [title, setTitle] = useState("");
  const [bookText, setBookText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt")) {
      setFormError("Choose a plain .txt file.");
      return;
    }
    setBookText(await file.text());
    setFileName(file.name);
    setFormError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !bookText.trim()) {
      setFormError("Enter a project title and book text.");
      return;
    }
    void onCreate({ title: title.trim(), bookText: bookText.trim() });
  }

  return (
    <main className="content narrow">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Back to projects
      </button>
      <div className="page-heading compact">
        <div>
          <p className="eyebrow">New project</p>
          <h1>Add a book</h1>
          <p>Give it a title, then paste the text or choose a `.txt` file.</p>
        </div>
      </div>
      <form className="project-form" onSubmit={submit}>
        <label>
          Project title
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label className="file-picker">
          <Upload size={22} />
          <strong>{fileName ?? "Choose a .txt file"}</strong>
          <span>Plain text, used as context for the illustration pipeline</span>
          <input
            type="file"
            accept=".txt,text/plain"
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
        </label>
        <div className="or-divider">or paste text</div>
        <label>
          Book text
          <textarea
            rows={12}
            value={bookText}
            onChange={(event) => {
              setBookText(event.target.value);
              setFileName(null);
            }}
            required
          />
        </label>
        {formError && <div className="form-error">{formError}</div>}
        <button className="button primary full" disabled={loading}>
          {loading ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
          Create project
        </button>
      </form>
    </main>
  );
}

function ProjectView({
  project,
  onBack,
  onProject,
  onError,
}: {
  project: ProjectDetail;
  onBack: () => void;
  onProject: (project: ProjectDetail) => void;
  onError: (message: string | null) => void;
}) {
  const [style, setStyle] = useState(project.style ?? "");
  const [showBook, setShowBook] = useState(false);
  const complete = COMPLETED_STEPS[project.status];
  const currentStep = project.runningStep ?? PIPELINE_STEPS[complete] ?? null;
  const running = project.stepState === "running";

  async function runStep(step: PipelineStep) {
    onError(null);
    onProject({
      ...project,
      stepState: "running",
      runningStep: step,
      stepStartedAt: new Date().toISOString(),
      stepError: null,
    });

    try {
      const response = await api.runStep(
        project.id,
        step,
        step === "style" && style.trim() ? { style: style.trim() } : {},
      );
      onProject(mergeProject(project, response.project));
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.project) {
        onProject(mergeProject(project, requestError.project));
      }
      onError(errorMessage(requestError));
    }
  }

  async function retryStep() {
    if (!project.runningStep) return;
    onError(null);
    try {
      const response = await api.retryStep(project.id, project.runningStep);
      onProject(mergeProject(project, response.project));
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.project) {
        onProject(mergeProject(project, requestError.project));
      }
      onError(errorMessage(requestError));
    }
  }

  return (
    <main className="content">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={16} /> Back to projects
      </button>
      <div className="project-title-row">
        <div>
          <p className="eyebrow">Illustration project</p>
          <h1>{project.title}</h1>
          <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
        </div>
        <span className={`status-badge ${project.status === "done" ? "done" : ""}`}>
          {project.status === "done" ? "Complete" : "In progress"}
        </span>
      </div>

      <ol className="stepper" aria-label="Project progress">
        {PIPELINE_STEPS.map((step, index) => {
          const done = index < complete;
          const active = step === currentStep;
          return (
            <li className={`${done ? "done" : ""} ${active ? "active" : ""}`} key={step}>
              <span className="step-number">{done ? <Check size={15} /> : index + 1}</span>
              <span>{STEP_LABELS[step]}</span>
            </li>
          );
        })}
      </ol>

      <div className="detail-layout">
        <section className="detail-main">
          <StepPanel
            project={project}
            currentStep={currentStep}
            running={running}
            style={style}
            onStyle={setStyle}
            onRun={runStep}
            onRetry={retryStep}
          />

          {project.characters.length > 0 && (
            <EntitySection title={`Characters (${project.characters.length})`}>
              <div className="entity-grid">
                {project.characters.map((character) => (
                  <article className="entity-card" key={character.id}>
                    <EntityImage
                      path={character.portraitPath}
                      alt={`Portrait of ${character.name}`}
                      loading={running && currentStep === "portraits"}
                    />
                    <div className="entity-copy">
                      <h3>{character.name}</h3>
                      <p>{character.prompt}</p>
                    </div>
                  </article>
                ))}
              </div>
            </EntitySection>
          )}

          {project.chapters.length > 0 && (
            <EntitySection title="Chapter illustration">
              {project.chapters.map((chapter) => (
                <article className="chapter-card" key={chapter.id}>
                  <EntityImage
                    path={chapter.illustrationPath}
                    alt={`Illustration for ${chapter.title}`}
                    loading={running && currentStep === "illustrations"}
                  />
                  <div className="entity-copy">
                    <h3>{chapter.title}</h3>
                    <p>{chapter.prompt}</p>
                  </div>
                </article>
              ))}
            </EntitySection>
          )}
        </section>

        <aside className="project-aside">
          <div>
            <span className="aside-label">Style</span>
            <p>{project.style ?? "Not generated yet"}</p>
          </div>
          <div>
            <span className="aside-label">Book text</span>
            <p className="book-preview">{project.bookText?.slice(0, 220) ?? "Book text saved"}</p>
            {project.bookText && (
              <button className="text-button" onClick={() => setShowBook(true)}>
                <BookOpen size={15} /> Read full text
              </button>
            )}
          </div>
        </aside>
      </div>

      {showBook && (
        <div className="modal-overlay" onMouseDown={() => setShowBook(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Book text"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <h2>{project.title}</h2>
              <button className="icon-button" onClick={() => setShowBook(false)} title="Close">
                <X size={20} />
              </button>
            </header>
            <div className="modal-content">{project.bookText}</div>
          </section>
        </div>
      )}
    </main>
  );
}

function StepPanel({
  project,
  currentStep,
  running,
  style,
  onStyle,
  onRun,
  onRetry,
}: {
  project: ProjectDetail;
  currentStep: PipelineStep | null;
  running: boolean;
  style: string;
  onStyle: (style: string) => void;
  onRun: (step: PipelineStep) => void;
  onRetry: () => void;
}) {
  if (!currentStep) {
    return (
      <section className="step-panel complete-panel">
        <Check size={22} />
        <div>
          <h2>All five steps complete</h2>
          <p>Your generated prompts and images are saved with this project.</p>
        </div>
      </section>
    );
  }

  if (project.stepState === "failed") {
    return (
      <section className="step-panel error-panel">
        <div>
          <h2>{STEP_LABELS[currentStep]} failed</h2>
          <p>{project.stepError ?? "The generation step did not complete."}</p>
        </div>
        <button className="button secondary" onClick={onRetry}>
          <RotateCcw size={16} /> Reset for retry
        </button>
      </section>
    );
  }

  return (
    <section className="step-panel">
      <div className="step-panel-copy">
        <p className="eyebrow">Next step</p>
        <h2>{STEP_LABELS[currentStep]}</h2>
        <p>
          {running
            ? "Generation is running. This page only polls existing progress."
            : "Start this step when you are ready. The next step will not run automatically."}
        </p>
        {currentStep === "style" && !running && (
          <label className="inline-field">
            Optional custom style
            <input
              value={style}
              onChange={(event) => onStyle(event.target.value)}
              placeholder="Leave blank for an AI-selected style"
            />
          </label>
        )}
      </div>
      <div className="step-actions">
        {running ? (
          <>
            <span className="running-label">
              <LoaderCircle className="spin" size={19} /> Generating
            </span>
            <button className="text-button" onClick={onRetry}>
              Recover interrupted step
            </button>
          </>
        ) : (
          <button className="button primary" onClick={() => onRun(currentStep)}>
            Generate {STEP_LABELS[currentStep]} <ChevronRight size={17} />
          </button>
        )}
      </div>
    </section>
  );
}

function EntitySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="entity-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function EntityImage({ path, alt, loading }: { path: string | null; alt: string; loading: boolean }) {
  const source = useMemo(() => assetUrl(path), [path]);
  return (
    <div className="entity-image">
      {source ? <img src={source} alt={alt} /> : loading ? <LoaderCircle className="spin" /> : <span>Not generated</span>}
    </div>
  );
}
