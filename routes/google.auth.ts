import express, { Router, Request, Response } from "express";
import dotenv from "dotenv";
import { google } from "googleapis";
import { db, userExists } from "../utils/utils"; // Importa la conexión a la base de datos
import axios from "axios";

dotenv.config();

const router: Router = express();

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;
const scopes = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

const oAuth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

router.get("/", (req: Request, res: Response) => {
  const userId = req.query.userId as string;

  if (!userId) {
    res.status(400).send("userId es requerido");
    return; // Termina la ejecución
  }

  userExists(userId, "userId")
    .then((exists) => {
      if (!exists) {
        console.log("Usuario no encontrado");
        res.status(404).send("Usuario no encontrado");
        return; // Termina la ejecución
      }

      // Si el usuario existe, genera la URL de autenticación
      const authURlWithState = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: scopes,
        include_granted_scopes: true,
        state: userId,
      });

      res.send(authURlWithState); // Envía la URL de autenticación
    })
    .catch((error) => {
      console.error("Error al verificar el usuario:", error);
      res.status(500).send("Error interno del servidor");
    });
});

router.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string; // Recupera el state
  let userId: string;
  console.log("State:", state);
  console.log("Code:", code);

  var drive = google.drive({
    version: "v3",
    auth: oAuth2Client,
  });

  try {
    // Decodifica el estado (puede contener JSON)
    userId = state;
  } catch (error) {
    console.error("Error parsing state:", error);
    res.status(400).send("Estado inválido.");
    return;
  }

  try {
    const tokenResponse = await oAuth2Client.getToken(code);

    // console.log("Token response:", tokenResponse);
    const tokens = tokenResponse.tokens;
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;

    oAuth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const userInfo = await drive.about.get({
      fields: "user",
    });

    const userEmail = userInfo.data.user?.emailAddress;
    if (!userEmail) {
      console.error("No se pudo obtener el correo electrónico del usuario.");
      res.status(500).send("Error interno del servidor.");
      return;
    }

    console.log("User email:", userEmail);

    const [linkedEmails]: any = await db.query(
      `SELECT COUNT(*) AS count FROM connections WHERE email = ?`,
      [userEmail]
    );

    if (linkedEmails[0].count > 0) {
      res.status(400).send("Correo electrónico ya vinculado a una cuenta.");
      return;
    }

    // Aquí puedes guardar los datos en tu base de datos
    await db.query(
      `INSERT INTO connections (userId,  email,  refreshToken, connectedAt) VALUES (?, ?, ?, NOW());`,
      [userId, userEmail, tokens.refresh_token]
    );

    res.send("Autenticación exitosa y datos guardados en la base de datos.");
  } catch (error) {
    console.error("Error authenticating:", error);
    res.status(500).send("Authentication failed.");
  }
});

router.get('/validate-token', async (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  const actualAccessToken = req.query.actualAccessToken as string;

  if (!userId) {
    res.status(400).send("El parámetro `userId` es requerido.");
    return; 
  }


  try {
    // Verificar si el usuario existe
    const exists = await userExists(userId, "userId");
    if (!exists) {
      
       res.status(404).send("Usuario no encontrado.");
       return;
      }

    

    // Verificar el access token actual
    const tokenInfoUrl = `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${actualAccessToken || ''}`;
    try {
      console.log(tokenInfoUrl);
      const response = await axios.get(tokenInfoUrl);


      // El token es válido
      res.status(200).send({
        message: "El accessToken es válido.",
        accessToken: actualAccessToken,
        expiresIn: response.data.expires_in, // Tiempo restante en segundos
      });
      return; 
    } catch (error) {
      console.log("AccessToken inválido. Intentando regenerarlo...");
    }


    //Si el accestoken esta mal, regenerarlo
    const [connection]: any = await db.query(
      `SELECT refreshToken FROM connections WHERE userId = ?`,
      [userId]
    );

    if (!connection || !connection[0].refreshToken) {
      
      res.status(404).send("No se encontró el refresh token para el usuario.");
      return;
    }


    const refreshToken = connection[0].refreshToken;

    // Si el token es inválido, regenerarlo
    const tokenEndpoint = "https://www.googleapis.com/oauth2/v4/token";
    const payload = {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    };

    const tokenResponse = await axios.post(tokenEndpoint, payload);
    const { access_token, expires_in } = tokenResponse.data;



    res.status(200).send({
      message: "AccessToken regenerado con éxito.",
      accessToken: access_token,
      expiresIn: expires_in,
    });
    return; 
  } catch (error) {
    console.error("Error durante la validación o regeneración del token:", error);
    res.status(500).send("Error interno del servidor.");
     return;
  }

});



router.post("/revoke-token", async (req: Request, res: Response) => {
  const userId = req.body.userId as string;
  const accessToken = req.body.accessToken as string;
    let email  

  if (!userId) {
    res.status(400).send("El parámetro `userId` es requerido.");
    return; 
  }

  if (!accessToken) {
    res.status(400).send("El parámetro `accessToken` es requerido.");
    return;
  }

  try {
    // Verificar si el usuario existe
    const exists = await userExists(userId, "userId");
    if (!exists) {
      res.status(404).send("Usuario no encontrado.");
      return; 
    }

    const tokenInfoUrl = `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken || ''}`;
    try {
      console.log(tokenInfoUrl);
      const response = await axios.get(tokenInfoUrl);

      email = response.data.email;

      // El token es válido
      
    } catch (error) {
      console.log("AccessToken inválido. Intentando regenerarlo...");
    }

    // Realizar la solicitud de revocación a Google
    const revokeEndpoint = "https://oauth2.googleapis.com/revoke";
    const payload = `token=${accessToken}`;

    await axios.post(revokeEndpoint, payload, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log(`Access token revocado para el usuario con ID: ${userId}`);

    // Eliminar el token de la base de datos
    await db.query(
      `DELETE FROM connections WHERE userId = ? AND email = ?`,
      [userId, email]
    );

    res.status(200).send({
      message: "Access token revocado y eliminado de la base de datos con éxito.",
    });
    return;
  } catch (error) {
    console.error("Error al revocar el token:", error);

    // Detectar error específico de Google para token inválido
    if (axios.isAxiosError(error) && error.response?.status === 400) {
      res.status(400).send("El token ya fue revocado o es inválido.");
      return;
    }

    res.status(500).send("Error interno del servidor.");
    return;
  }
});


export default router;
