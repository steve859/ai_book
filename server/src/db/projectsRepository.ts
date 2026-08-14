import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import type {
  Chapter,
  Character,
  PipelineStep,
  Project,
  ProjectStatus,
  StepState
} from "@ai-book/shared";

interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  book_path: string;
  status: ProjectStatus;
  step_state: StepState;
  running_step: PipelineStep | null;
  step_started_at: string | null;
  step_error: string | null;
  created_at: string;
  updated_at: string;
  style_text: string | null;
}

interface CharacterRow {
  id: string;
  name: string;
  prompt: string;
  portrait_path: string | null;
  sort_order: number;
}

interface ChapterRow {
  id: string;
  title: string;
  prompt: string;
  illustration_path: string | null;
  sort_order: number;
}

function toCharacter(row: CharacterRow): Character {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    portraitPath: row.portrait_path,
    sortOrder: row.sort_order
  };
}

function toChapter(row: ChapterRow): Chapter {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    illustrationPath: row.illustration_path,
    sortOrder: row.sort_order
  };
}

function toProject(row: ProjectRow, characters: Character[], chapters: Chapter[]): Project {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    bookPath: row.book_path,
    status: row.status,
    stepState: row.step_state,
    runningStep: row.running_step,
    stepStartedAt: row.step_started_at,
    stepError: row.step_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    style: row.style_text,
    characters,
    chapters
  };
}

const projectSelect = `
  SELECT
    projects.id,
    projects.user_id,
    projects.title,
    projects.book_path,
    projects.status,
    projects.step_state,
    projects.running_step,
    projects.step_started_at,
    projects.step_error,
    projects.created_at,
    projects.updated_at,
    styles.text AS style_text
  FROM projects
  LEFT JOIN styles ON styles.project_id = projects.id
`;

export function createProjectsRepository(db: Database.Database) {
  const findCharacters = db.prepare(`
    SELECT id, name, prompt, portrait_path, sort_order
    FROM characters
    WHERE project_id = ?
    ORDER BY sort_order ASC
  `);

  const findChapters = db.prepare(`
    SELECT id, title, prompt, illustration_path, sort_order
    FROM chapters
    WHERE project_id = ?
    ORDER BY sort_order ASC
  `);

  function hydrate(row: ProjectRow | undefined): Project | null {
    if (!row) return null;

    const characters = (findCharacters.all(row.id) as CharacterRow[]).map(toCharacter);
    const chapters = (findChapters.all(row.id) as ChapterRow[]).map(toChapter);

    return toProject(row, characters, chapters);
  }

  return {
    create(input: { userId: string; title: string; bookPath: string; now?: string }): Project {
      const now = input.now ?? new Date().toISOString();
      const projectId = nanoid();

      db.prepare(`
        INSERT INTO projects (
          id, user_id, title, book_path, status, step_state, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, 'created', 'idle', ?, ?)
      `).run(projectId, input.userId, input.title.trim(), input.bookPath, now, now);

      const project = this.findByIdForUser(projectId, input.userId);
      if (!project) {
        throw new Error("Created project could not be loaded.");
      }

      return project;
    },

    listForUser(userId: string): Project[] {
      const rows = db
        .prepare(`${projectSelect} WHERE projects.user_id = ? ORDER BY projects.created_at DESC`)
        .all(userId) as ProjectRow[];

      return rows.map((row) => {
        const project = hydrate(row);
        if (!project) {
          throw new Error(`Project ${row.id} could not be hydrated.`);
        }
        return project;
      });
    },

    findByIdForUser(projectId: string, userId: string): Project | null {
      const row = db
        .prepare(`${projectSelect} WHERE projects.id = ? AND projects.user_id = ?`)
        .get(projectId, userId) as ProjectRow | undefined;

      return hydrate(row);
    },

    setStepRunning(input: {
      projectId: string;
      userId: string;
      step: PipelineStep;
      expectedStatus: ProjectStatus;
      now?: string;
    }): boolean {
      const now = input.now ?? new Date().toISOString();
      const result = db
        .prepare(`
          UPDATE projects
          SET step_state = 'running',
              running_step = ?,
              step_started_at = ?,
              step_error = NULL,
              updated_at = ?
          WHERE id = ?
            AND user_id = ?
            AND status = ?
            AND step_state != 'running'
        `)
        .run(input.step, now, now, input.projectId, input.userId, input.expectedStatus);

      return result.changes === 1;
    },

    finishStep(input: {
      projectId: string;
      status: ProjectStatus;
      now?: string;
    }): void {
      const now = input.now ?? new Date().toISOString();

      db.prepare(`
        UPDATE projects
        SET status = ?,
            step_state = 'idle',
            running_step = NULL,
            step_started_at = NULL,
            step_error = NULL,
            updated_at = ?
        WHERE id = ?
      `).run(input.status, now, input.projectId);
    },

    failStep(input: { projectId: string; error: string; now?: string }): void {
      const now = input.now ?? new Date().toISOString();

      db.prepare(`
        UPDATE projects
        SET step_state = 'failed',
            step_error = ?,
            updated_at = ?
        WHERE id = ?
      `).run(input.error, now, input.projectId);
    },

    clearStepFailure(input: { projectId: string; userId: string; step: PipelineStep; now?: string }): boolean {
      const now = input.now ?? new Date().toISOString();
      const result = db.prepare(`
        UPDATE projects
        SET step_state = 'idle',
            running_step = NULL,
            step_started_at = NULL,
            step_error = NULL,
            updated_at = ?
        WHERE id = ?
          AND user_id = ?
          AND running_step = ?
          AND step_state IN ('failed', 'running')
      `).run(now, input.projectId, input.userId, input.step);

      return result.changes === 1;
    },

    saveStyle(input: { projectId: string; text: string; now?: string }): void {
      const now = input.now ?? new Date().toISOString();

      db.prepare(`
        INSERT INTO styles (project_id, text, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET text = excluded.text
      `).run(input.projectId, input.text, now);
    },

    replaceCharacters(input: {
      projectId: string;
      characters: Array<{ name: string; prompt: string; portraitPath?: string | null }>;
      now?: string;
    }): void {
      if (input.characters.length > 2) {
        throw new Error("A project can have at most 2 adult characters.");
      }

      const now = input.now ?? new Date().toISOString();
      const insert = db.prepare(`
        INSERT INTO characters (id, project_id, name, prompt, portrait_path, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      db.transaction(() => {
        db.prepare("DELETE FROM characters WHERE project_id = ?").run(input.projectId);
        input.characters.forEach((character, index) => {
          insert.run(
            nanoid(),
            input.projectId,
            character.name,
            character.prompt,
            character.portraitPath ?? null,
            index,
            now
          );
        });
      })();
    },

    replaceChapters(input: {
      projectId: string;
      chapters: Array<{ title: string; prompt: string; illustrationPath?: string | null }>;
      now?: string;
    }): void {
      if (input.chapters.length > 1) {
        throw new Error("A project can have at most 1 chapter.");
      }

      const now = input.now ?? new Date().toISOString();
      const insert = db.prepare(`
        INSERT INTO chapters (id, project_id, title, prompt, illustration_path, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      db.transaction(() => {
        db.prepare("DELETE FROM chapters WHERE project_id = ?").run(input.projectId);
        input.chapters.forEach((chapter, index) => {
          insert.run(
            nanoid(),
            input.projectId,
            chapter.title,
            chapter.prompt,
            chapter.illustrationPath ?? null,
            index,
            now
          );
        });
      })();
    },

    setCharacterPortraitPath(input: { characterId: string; portraitPath: string }): void {
      db.prepare("UPDATE characters SET portrait_path = ? WHERE id = ?").run(
        input.portraitPath,
        input.characterId
      );
    },

    setChapterIllustrationPath(input: { chapterId: string; illustrationPath: string }): void {
      db.prepare("UPDATE chapters SET illustration_path = ? WHERE id = ?").run(
        input.illustrationPath,
        input.chapterId
      );
    }
  };
}
