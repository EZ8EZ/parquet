/**
 * Prisma 7 config - only Migrate/`db push` read this; `prisma generate` and the
 * app's own runtime client (lib/db.js) do not, so this file has no bearing on
 * D18's "DATABASE_URL optional" contract.
 */
import { defineConfig } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
