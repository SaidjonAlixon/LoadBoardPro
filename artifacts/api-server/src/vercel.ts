import serverless from "serverless-http";
import app from "./app";

// serverless-http for reliable path handling on Vercel/Lambda
const handler = serverless(app, {
  binary: ["image/*", "application/octet-stream"],
});

export default handler;
