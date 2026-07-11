import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config. `drizzle-kit generate` reads the schema and emits SQL
 * migrations under ./drizzle offline (no database connection required).
 * `drizzle-kit push` / `migrate` need DATABASE_URL and hit the database.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Only consulted by push/migrate, never by `generate`.
    url: process.env.DATABASE_URL ?? "",
  },
});
