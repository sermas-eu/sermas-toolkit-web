import express, { Express, Request, Response } from "express";
import cors from "cors";
import {
  getAvatarToken,
  getAvatarTokenWithClientSecret,
} from "@sermas/sermas-toolkit-node-sdk";

const app: Express = express();
const port = 3000;

const PRIVATE_API_BASE_URL =
  process.env.PRIVATE_API_BASE_URL || "http://api:3000/api";

app.use(express.json());
app.use(cors());
app.use("*", (req, res, next) => {
  console.log(`[server]: Request arrived - ${req.method} ${req.path}`);
  next();
});

app.get("/auth/public/:appId", async (req: Request, res: Response) => {
  const appId = req.params.appId;

  return res.json(
    await getAvatarToken(appId, {
      PRIVATE_API_BASE_URL,
      PUBLIC_AUTH_URL: "http://sermasxr-keycloak-1:8080/keycloak",
    }),
  );
});

app.get("/auth/private/:appId", async (req: Request, res: Response) => {
  const appId = req.params.appId;

  return res.json(
    await getAvatarTokenWithClientSecret(appId, {
      PRIVATE_API_BASE_URL,
      PUBLIC_AUTH_URL: "http://sermasxr-keycloak-1:8080/keycloak",
    }),
  );
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
