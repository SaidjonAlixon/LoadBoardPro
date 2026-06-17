import type { VercelRequest, VercelResponse } from "@vercel/node";

type AppHandler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

let cached: AppHandler | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!cached) {
    const mod = await import("../artifacts/api-server/dist/vercel.mjs");
    cached = mod.default as AppHandler;
  }
  return cached(req, res);
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
