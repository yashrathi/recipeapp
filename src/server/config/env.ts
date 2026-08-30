import { z } from "zod";

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_PATH: z.string().trim().min(1).default(".data/recipe-app.sqlite"),
  SESSION_SECRET: z.string().min(32).optional(),
});

export type AppEnvironment = z.infer<typeof EnvironmentSchema>;

let cachedEnvironment: AppEnvironment | undefined;

export function getEnvironment(): AppEnvironment {
  cachedEnvironment ??= EnvironmentSchema.parse(process.env);
  return cachedEnvironment;
}

export function getSessionSecret(): string {
  const environment = getEnvironment();
  if (environment.SESSION_SECRET) return environment.SESSION_SECRET;
  if (environment.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production.");
  }
  return "local-development-only-session-secret-change-me";
}

export function isDemoAuthEnabled(): boolean {
  return getEnvironment().NODE_ENV !== "production";
}

export function resetEnvironmentForTests(): void {
  cachedEnvironment = undefined;
}
