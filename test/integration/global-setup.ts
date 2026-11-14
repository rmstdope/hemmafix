import type { TestProject } from "vitest/node";
import { createMigratedDatabase, dropDatabase, dropStaleDatabases, newRunPrefix } from "../database.mjs";

declare module "vitest" {
  export interface ProvidedContext {
    /** Prefix for this run's databases; the migrated template is `<prefix>template`. */
    testDbPrefix: string;
  }
}

/** Migrates one template per run; every test file gets its own copy (see setup.ts). */
export default async function setup(project: TestProject) {
  await dropStaleDatabases();
  const prefix = newRunPrefix();
  const template = `${prefix}template`;
  await createMigratedDatabase(template);
  project.provide("testDbPrefix", prefix);
  return async () => {
    await dropDatabase(template);
  };
}
