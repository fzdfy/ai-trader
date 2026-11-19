import { HTTPException } from "hono/http-exception";
import { auth } from "../auth";

export async function requireWorkflowUser(headers: Headers): Promise<{
  id: string;
  name: string;
  email: string;
}> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  return session.user;
}
