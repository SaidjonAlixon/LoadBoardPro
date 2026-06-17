/** Standalone health check — no Express bundle (fast cold start on Vercel). */
export default function handler(_req, res) {
  res.status(200).json({ status: "ok" });
}
