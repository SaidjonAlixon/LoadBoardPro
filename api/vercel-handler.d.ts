declare module "../artifacts/api-server/dist/vercel.mjs" {
  import type { VercelRequest, VercelResponse } from "@vercel/node";

  const handler: (req: VercelRequest, res: VercelResponse) => Promise<unknown>;
  export default handler;
}
