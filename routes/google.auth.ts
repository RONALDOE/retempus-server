import express, { Router, Request, Response } from "express";
import dotenv from "dotenv";
import { google } from "googleapis";
import db from '../config/db.config'; // Importa la conexión a la base de datos

dotenv.config();

const router: Router = express();

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;
const scopes = ["https://www.googleapis.com/auth/drive"];

const oAuth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

router.get("/", (req: Request, res: Response) => {
  const userId = req.query.userId as string; // Supongamos que se envía como query param

  if (!userId) {
     res.status(400).send("userId es requerido");
     return;
  }

  const authURlWithState = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    include_granted_scopes: true,
    state: userId , // Puedes enviar más datos si es necesario
  });
  res.set('Content-Type', 'text/html');
  res.send(Buffer.from(`<a>${authURlWithState}</a>`));
});


router.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string; // Recupera el state
  let userId: string;
  console.log("State:", state);
  console.log("Code:", code);

  try {
    // Decodifica el estado (puede contener JSON)
    const parsedState = JSON.parse(state);
    userId = state;
  } catch (error) {
    console.error("Error parsing state:", error);
    res.status(400).send("Estado inválido.");
    return;
  }

  try {
    const tokenResponse = await oAuth2Client.getToken(code);
    console.log("Token response:", tokenResponse.tokens);
    const tokens = tokenResponse.tokens;
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;

    oAuth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    // Guardar en la base de datos
    await db.query(
      `INSERT INTO connections (userId, provider, refreshToken, connectedAt, lastUsed) VALUES (?, ?, ?, NOW(), NOW())`,
      [userId, 'google_drive', refreshToken]
    );

    res.send("Autenticación exitosa y datos guardados en la base de datos.");
  } catch (error) {
    console.error("Error authenticating:", error);
    res.status(500).send("Authentication failed.");
  }
});

export default router;
