import serverless from "serverless-http";
import app from "./app";

export default serverless(app, {
  binary: ["image/*", "application/octet-stream"],
});
