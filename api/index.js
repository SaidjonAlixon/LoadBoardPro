/** @type {import("@vercel/node").VercelApiHandler | undefined} */
let cached;

/** @type {import("@vercel/node").VercelApiHandler} */
export default async function handler(req, res) {
  if (!cached) {
    const mod = await import("../artifacts/api-server/dist/vercel.mjs");
    cached = mod.default;
  }
  return cached(req, res);
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
