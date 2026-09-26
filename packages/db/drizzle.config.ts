import { defineConfig } from "drizzle-kit";

// drizzle-kit generate writes the table DDL. Every migration is reviewed by hand, and 0001 ends
// with the security block from src/rls.ts (roles, grants, RLS, triggers, runs partitions).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  casing: "snake_case",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://localhost:5432/sysone",
  },
});
