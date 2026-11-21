import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from "../db/schema";
import { parseTrustedOrigins } from "../lib/auth-origins";

type AuthEnvironment = {
  BETTER_AUTH_URL?: string;
  AUTH_TRUSTED_ORIGINS?: string;
};

export function createAuth(env: AuthEnvironment = process.env) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
    },
    ...(env.BETTER_AUTH_URL ? { baseURL: env.BETTER_AUTH_URL } : {}),
    trustedOrigins: parseTrustedOrigins(env.AUTH_TRUSTED_ORIGINS, env.BETTER_AUTH_URL),
  });
}

export const auth = createAuth();
