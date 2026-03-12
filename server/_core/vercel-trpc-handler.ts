import type { Request, Response } from "express";
import { createApp } from "./app";

const app = createApp();

export function handler(req: Request, res: Response) {
  return app(req, res);
}

export default handler;
