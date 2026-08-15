import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import type { User } from "@ai-book/shared";

interface UserRow {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
  };
}

export function createUsersRepository(db: Database.Database) {
  return {
    findByEmail(email: string): User | null {
      const row = db
        .prepare(
          "SELECT id, name, email, created_at FROM users WHERE email = ?",
        )
        .get(email.toLowerCase()) as UserRow | undefined;

      return row ? toUser(row) : null;
    },

    findById(id: string): User | null {
      const row = db
        .prepare("SELECT id, name, email, created_at FROM users WHERE id = ?")
        .get(id) as UserRow | undefined;

      return row ? toUser(row) : null;
    },

    createOrUpdateByEmail(input: {
      name: string;
      email: string;
      now?: string;
    }): User {
      const email = input.email.trim().toLowerCase();
      const name = input.name.trim();
      const existing = this.findByEmail(email);

      if (existing) {
        db.prepare("UPDATE users SET name = ? WHERE id = ?").run(
          name,
          existing.id,
        );
        return { ...existing, name };
      }

      const user: User = {
        id: nanoid(),
        name,
        email,
        createdAt: input.now ?? new Date().toISOString(),
      };

      db.prepare(
        "INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?) \
        ON CONFLICT(email) DO UPDATE SET \
          name = excluded.name \
        RETURNING id, name, email, created_at",
      ).run(user.id, user.name, user.email, user.createdAt);

      return user;
    },
  };
}
