import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { USER_ROLES, DEPARTMENTS } from "../../drizzle/schema";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  app.post("/api/local-auth/session", async (req: Request, res: Response) => {
    if (!ENV.allowDemoMode) {
      res.status(403).json({ error: "Local auth is disabled in production" });
      return;
    }

    const role = typeof req.body?.role === "string" ? req.body.role : "employee";
    const name = typeof req.body?.name === "string" && req.body.name.trim().length > 0
      ? req.body.name.trim()
      : `Local ${role.replace(/_/g, " ")}`;
    const department = typeof req.body?.department === "string" ? req.body.department : "customer_service";

    if (!USER_ROLES.includes(role as any)) {
      res.status(400).json({ error: "Invalid role" });
      return;
    }

    if (!DEPARTMENTS.includes(department as any)) {
      res.status(400).json({ error: "Invalid department" });
      return;
    }

    const openId = `local:${role}`;

    await db.upsertUser({
      openId,
      name,
      email: `${role}@local.wsc`,
      loginMethod: "local_dev",
      role: role as any,
      department: department as any,
      lastSignedIn: new Date(),
    });

    const sessionToken = await sdk.signSession({
      openId,
      appId: "local-dev",
      name,
    }, {
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    res.json({ success: true });
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
