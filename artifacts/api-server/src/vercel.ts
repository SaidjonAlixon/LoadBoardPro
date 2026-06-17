import app from "./app";

// Vercel runs Express apps natively — avoid serverless-http (can hang on cold start).
export default app;
