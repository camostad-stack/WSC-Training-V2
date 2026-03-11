import { ForbiddenError } from "../../shared/_core/errors";
import type { Request } from "express";
import { parse } from "cookie";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import { getSupabaseAdmin } from "./supabase";

export const IMPERSONATION_COOKIE_NAME = "wsc_impersonation_user";

export type ImpersonationState = {
  targetUserId: number;
};

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function deriveLoginMethod(provider?: string | null) {
  if (!provider) return "email";
  return provider;
}

function deriveDisplayName(authUser: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}) {
  const metadata = authUser.user_metadata ?? {};
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name : null;
  const name = typeof metadata.name === "string" ? metadata.name : null;
  if (fullName) return fullName;
  if (name) return name;
  if (authUser.email) return authUser.email.split("@")[0];
  return "WSC User";
}

function getCookieValue(req: Request, name: string) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const cookies = parse(raw);
  const value = cookies[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function ensureAppUser(authUser: {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
  last_sign_in_at?: string | null;
}) {
  const provider = typeof authUser.app_metadata?.provider === "string"
    ? authUser.app_metadata.provider
    : null;

  await db.upsertUser({
    openId: authUser.id,
    name: deriveDisplayName(authUser),
    email: authUser.email ?? null,
    loginMethod: deriveLoginMethod(provider),
    role: authUser.id === ENV.ownerOpenId ? "admin" : undefined,
    lastSignedIn: authUser.last_sign_in_at ? new Date(authUser.last_sign_in_at) : new Date(),
  });

  return await db.getUserByOpenId(authUser.id);
}

class SDKServer {
  async authenticateRequest(req: Request): Promise<User> {
    const accessToken = getBearerToken(req);

    if (!accessToken) {
      throw ForbiddenError("Missing Supabase access token");
    }

    const { data, error } = await getSupabaseAdmin().auth.getUser(accessToken);
    if (error || !data.user) {
      throw ForbiddenError("Invalid Supabase session");
    }

    let user = await db.getUserByOpenId(data.user.id);
    if (!user) {
      user = await ensureAppUser(data.user);
    } else {
      await db.upsertUser({
        openId: data.user.id,
        name: deriveDisplayName(data.user),
        email: data.user.email ?? null,
        loginMethod: deriveLoginMethod(typeof data.user.app_metadata?.provider === "string" ? data.user.app_metadata.provider : null),
        lastSignedIn: new Date(),
      });
      user = await db.getUserByOpenId(data.user.id);
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    if (!user.isActive) {
      throw ForbiddenError("User account is inactive");
    }

    return user;
  }

  async resolveEffectiveUser(req: Request, actorUser: User): Promise<{ user: User; impersonation: ImpersonationState | null }> {
    if (!["admin", "super_admin"].includes(actorUser.role)) {
      return { user: actorUser, impersonation: null };
    }

    const rawTargetUserId = getCookieValue(req, IMPERSONATION_COOKIE_NAME);
    const targetUserId = Number.parseInt(rawTargetUserId || "", 10);

    if (!Number.isFinite(targetUserId) || targetUserId <= 0 || targetUserId === actorUser.id) {
      return { user: actorUser, impersonation: null };
    }

    const targetUser = await db.getUserById(targetUserId);
    if (!targetUser || !targetUser.isActive) {
      return { user: actorUser, impersonation: null };
    }

    return {
      user: targetUser,
      impersonation: { targetUserId },
    };
  }
}

export const sdk = new SDKServer();
