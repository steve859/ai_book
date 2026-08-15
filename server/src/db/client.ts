import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(dirname, "schema.sql");

export function openDatabase(dbPath = process.env.DATABASE_PATH ?? "data/app.db") {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.exec(fs.readFileSync(schemaPath, "utf8"));
  return db;
}
