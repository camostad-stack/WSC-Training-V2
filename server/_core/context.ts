import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import type { ImpersonationState } from "./sdk";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  actorUser?: User | null;
  impersonation?: ImpersonationState | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let actorUser: User | null = null;
  let user: User | null = null;
  let impersonation: ImpersonationState | null = null;

  try {
    actorUser = await sdk.authenticateRequest(opts.req);
    const resolved = await sdk.resolveEffectiveUser(opts.req, actorUser);
    user = resolved.user;
    impersonation = resolved.impersonation;
  } catch (error) {
    // Authentication is optional for public procedures.
    actorUser = null;
    user = null;
    impersonation = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    actorUser,
    impersonation,
  };
}
