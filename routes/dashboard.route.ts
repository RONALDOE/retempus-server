import express, { Router, Request, Response } from "express";
import dotenv from "dotenv";
import { userExists, db } from "../utils/utils";
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

var drive = google.drive({
  version: "v3",
  auth: oAuth2Client,
});



router.get("/driveInfo", async (req: Request, res: Response) => {
    const accessToken = req.query.accessToken as string;
    console.log(accessToken)

  if (!accessToken) {
    res.status(400).send("Todos los tokens son requeridos");
    return; // Termina la ejecución
  }

  oAuth2Client.setCredentials({
    access_token: accessToken,
  });

  try {
    const response = await drive.about.get({
      fields: "storageQuota, user",
    });
    //Hacer calculos en el frontend
    const data = {
      storageQuota: {
        limit: Number(response.data.storageQuota?.limit) ,
        usage: Number(response.data.storageQuota?.usage) ,
        usageInDrive: Number(response.data.storageQuota?.usageInDrive) ,
        usageInDriveTrash: Number(response.data.storageQuota?.usageInDriveTrash),
      },
      user: response.data.user,
    };
    res.json(data);
    console.log(response.data)
  } catch (err) {
    console.error("Error listing drives:", err);
    res.status(500).json({ error: "Failed to list drives" });
  }
});

// // Ruta para obtener datos generales de Drive
// router.get("/driveData", async (req: Request, res: Response) => {
//     const accessToken = req.query.accessToken as string;
  
//     if (!accessToken) {
//       res.status(400).send("Todos los tokens son requeridos");
//       return;
//     }
  
//     oAuth2Client.setCredentials({
//       access_token: accessToken,
//     });
  
//     try {
//       const response = await drive.about.get({
//         fields: "storageQuota, user",
//       });
//       const data = {
//         storageQuota: {
//           limit: Number(response.data.storageQuota?.limit),
//           usage: Number(response.data.storageQuota?.usage),
//           usageInDrive: Number(response.data.storageQuota?.usageInDrive),
//           usageInDriveTrash: Number(response.data.storageQuota?.usageInDriveTrash),
//         },
//         user: response.data.user,
//       };
//       res.json(data);
//     } catch (err) {
//       console.error("Error fetching drive data:", err);
//       res.status(500).json({ error: "Failed to fetch drive data" });
//     }
//   });
  
  // Ruta para obtener archivos recientes
  router.get("/recentFiles", async (req: Request, res: Response) => {
    const accessToken = req.query.accessToken as string;
  
    if (!accessToken) {
      res.status(400).send("Todos los tokens son requeridos");
      return;
    }
  
    oAuth2Client.setCredentials({
      access_token: accessToken,
    });
  
    try {
      const response = await drive.files.list({
        pageSize: 5, // Número de archivos recientes
        fields: "files(id, name, mimeType, modifiedTime)", // Campos a incluir
        orderBy: "modifiedTime desc", // Ordenar por la fecha de modificación más reciente
      });
  
      const files = response.data.files || [];
  
      if (files.length === 0) {
        res.json({ message: "No se encontraron archivos recientes" });
      } else {
        res.json(files);
      }
    } catch (err) {
      console.error("Error fetching recent files:", err);
      res.status(500).json({ error: "Failed to fetch recent files" });
    }
  });
  

export default router;
