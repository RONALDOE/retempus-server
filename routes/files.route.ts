import express, { Router, Request, Response } from "express";
import dotenv from "dotenv";
import { google } from "googleapis";
dotenv.config();

const router: Router = express();

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;
const oAuth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri
);

const drive = google.drive({
  version: "v3",
  auth: oAuth2Client,
});

// Ruta para listar archivos
router.get("/files", async (req, res) => {
  const accessToken = req.query.accessToken as string;

  if (!accessToken) {
    res.status(400).send("Todos los tokens son requeridos");
    return; // Termina la ejecución
  }

  oAuth2Client.setCredentials({
    access_token: accessToken,
  });

  try {
    const response = await drive.files.list({
      fields: "files(name, id)", // Specify the fields to include in the response
    });
    const files = response.data.files;
    res.json(files);
  } catch (err) {
    console.error("Error listing files:", err);
    res.status(500).json({ error: "Failed to list files" });
  }
});

// Ruta para listar archivos por tipos
router.get("/filesbytypes", async (req: Request, res: Response) => {
  const accessToken = req.query.accessToken as string;
  const types = req.query.types as string;

  // Validar que los parámetros obligatorios estén presentes
  if (!accessToken || !types) {
    res
      .status(400)
      .send("El token de acceso y los tipos de archivo son requeridos.");
    return;
  }

  try {
    // Configurar el token en el cliente de OAuth2
    oAuth2Client.setCredentials({
      access_token: accessToken,
    });

    // Consulta en Google Drive
    const response = await drive.files.list({
      q: `mimeType='${types}'`, // Formato correcto para Google Drive API
      fields: "files(name, id)", // Especificar los campos necesarios
    });

    // Responder con la lista de archivos
    const files = response.data.files || [];
    res.json(files);
  } catch (err) {
    console.error("Error al listar archivos:", err);
    res.status(500).json({ error: "No se pudieron listar los archivos" });
  }
});

// Nueva ruta para descargar un archivo por ID
router.get("/download", async (req: Request, res: Response) => {
  const { fileId, accessToken } = req.query;
  console.log(fileId, accessToken);

  if (!fileId || !accessToken) {
    res.status(400).json({ error: "fileId y accessToken son requeridos." });
    return;
  }

  try {
    // Configurar el cliente con el token del usuario
    oAuth2Client.setCredentials({ access_token: accessToken as string });

    // Obtener metadatos del archivo
    const fileMetadata = await drive.files.get({
      fileId: fileId as string,
      fields: "name, mimeType",
    });

    const fileName = fileMetadata.data.name || "file";
    const mimeType = fileMetadata.data.mimeType || "application/octet-stream";

    // Configurar la respuesta para la descarga
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Type", mimeType);

    // Transmitir el archivo directamente al cliente
    const fileStream = await drive.files.get(
      { fileId: fileId as string, alt: "media" },
      { responseType: "stream" }
    );

    fileStream.data
      .on("end", () =>
        console.log(`Archivo ${fileName} descargado correctamente.`)
      )
      .on("error", (err) => {
        console.error("Error al transmitir el archivo:", err);
        res.status(500).json({ error: "Error al descargar el archivo." });
      })
      .pipe(res); // Transmitir el contenido al cliente
  } catch (error) {
    console.error("Error al descargar el archivo:", error);
    res.status(500).json({ error: "Error al descargar el archivo." });
  }
});

// Ruta raíz
router.get("/", (req: Request, res: Response) => {
  res.send("Files");
});

export default router;
