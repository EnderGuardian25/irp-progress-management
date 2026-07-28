type Env = NodeJS.ProcessEnv;

export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwksUri: string;
  jwtIssuer: string;
  jwtAudience: string;
  version: string;
  nodeEnv: "development" | "test" | "production";
}

const REQUIRED_ENV_NAMES = {
  databaseUrl: "DATABASE_URL",
  jwksUri: "JWKS_URI",
  jwtIssuer: "JWT_ISSUER",
  jwtAudience: "JWT_AUDIENCE",
} as const;

const VALID_NODE_ENVS = ["development", "test", "production"] as const;

export function loadConfig(env: Env): AppConfig {
  const required = {
    databaseUrl: env.DATABASE_URL,
    jwksUri: env.JWKS_URI,
    jwtIssuer: env.JWT_ISSUER,
    jwtAudience: env.JWT_AUDIENCE,
  };
  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => REQUIRED_ENV_NAMES[k as keyof typeof REQUIRED_ENV_NAMES]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const port = env.PORT === undefined ? 3001 : Number(env.PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got: ${String(env.PORT)}`);
  }

  const rawNodeEnv = env.NODE_ENV ?? "development";
  if (!(VALID_NODE_ENVS as readonly string[]).includes(rawNodeEnv)) {
    throw new Error(
      `Invalid NODE_ENV "${rawNodeEnv}": must be one of ${VALID_NODE_ENVS.join(", ")}`,
    );
  }
  const nodeEnv = rawNodeEnv as AppConfig["nodeEnv"];

  return {
    port,
    databaseUrl: required.databaseUrl!,
    jwksUri: required.jwksUri!,
    jwtIssuer: required.jwtIssuer!,
    jwtAudience: required.jwtAudience!,
    version: env.APP_VERSION ?? "0.0.0",
    nodeEnv,
  };
}
