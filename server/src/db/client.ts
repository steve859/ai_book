import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(dirname, "schema.sql");

function migrateProjects(db: Database.Database) {
  const columns = new Set(
    (db.pragma("table_info(projects)") as Array<{ name: string }>).map((column) => column.name),
  );
  const additions = [
    ["gemini_file_name", "TEXT"],
    ["gemini_file_uri", "TEXT"],
    ["gemini_file_expires_at", "TEXT"],
  ] as const;

  for (const [name, type] of additions) {
    if (!columns.has(name)) db.exec(`ALTER TABLE projects ADD COLUMN ${name} ${type}`);
  }
}

export function openDatabase(dbPath = process.env.DATABASE_PATH ?? "data/app.db") {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.exec(fs.readFileSync(schemaPath, "utf8"));
  migrateProjects(db);
  return db;
}
