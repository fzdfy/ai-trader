import { cors } from "hono/cors";
import { parseTrustedOrigins, resolveCorsOrigin } from "./auth-origins";

type CorsEnvironment = {
  BETTER_AUTH_URL?: string;
  AUTH_TRUSTED_ORIGINS?: string;
};

export function createCorsMiddleware(env: CorsEnvironment = process.env) {
  const allowedOrigins = new Set(
    parseTrustedOrigins(env.AUTH_TRUSTED_ORIGINS, env.BETTER_AUTH_URL),
  );

  return cors({
    origin: (origin) => resolveCorsOrigin(origin, allowedOrigins) ?? undefined,
    credentials: true,
  });
}
