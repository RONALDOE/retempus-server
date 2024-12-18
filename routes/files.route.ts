import express, { Router, Request, Response } from "express";
import dotenv from "dotenv";
import { google } from "googleapis";
import stream  from "stream";
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

router.get("/filtered", async (req: Request, res: Response) => {
  const accessToken = req.query.accessToken as string;
  let folderId = req.query.folderId as string || "root"; // Carpeta raíz por defecto
  const categories = req.query.categories as string;
  const date = req.query.date as string;
  const containsWords = req.query.containsWords as string;
  const modifiedDate = req.query.modifiedDate as string;
  const startModified = req.query.startModified as string;
  const endModified = req.query.endModified as string;

  if (!accessToken) {
    res.status(400).send("El token de acceso es requerido.");
    return;
  }

  const validateDate = (date: string) => !isNaN(Date.parse(date));

  try {
    oAuth2Client.setCredentials({
      access_token: accessToken,
    });

    const queryConditions: string[] = [];
    
    // Si folderId es null o undefined, se asegura de que se use 'root'
    if (!folderId) {
      folderId = "root"; 
    }

    if (categories) {
      const slicedCategories = categories.split(",");
      const mimeTypeQuery = slicedCategories
        .map((category) => `mimeType='${category}'`)
        .join(" or ");
      queryConditions.push(`(${mimeTypeQuery})`);
    }

    if (containsWords) {
      queryConditions.push(`name contains '${containsWords}'`);
    }

    if (date && validateDate(date)) {
      queryConditions.push(`createdTime = '${new Date(date).toISOString()}'`);
    }

    if (modifiedDate && validateDate(modifiedDate)) {
      queryConditions.push(
        `modifiedTime = '${new Date(modifiedDate).toISOString()}'`
      );
    }

    if (
      startModified &&
      endModified &&
      validateDate(startModified) &&
      validateDate(endModified)
    ) {
      queryConditions.push(
        `modifiedTime >= '${new Date(
          startModified
        ).toISOString()}' and modifiedTime <= '${new Date(
          endModified
        ).toISOString()}'`
      );
    }

    queryConditions.push(`'${folderId != "null"? folderId : "root"}' in parents`);

    const finalQuery = queryConditions.join(" and ");

    const response = await drive.files.list({
      q: queryConditions.length > 1 ? finalQuery : `'${folderId != "null"? folderId : "root"}' in parents and trashed = false`,
      fields:
        "files(id, name, mimeType, modifiedTime, iconLink, webViewLink, starred, size, fileExtension, parents)",
    });

    const files = response.data.files || [];

    if (folderId !== "root") {
      let backFolder: { id: string; name: string; mimeType: string; iconLink: string } | null = null;

      // Si estamos en una subcarpeta, obtener el padre
      if (files.length > 0 && files[0].parents) {
        const parentId = files[0].parents[0];

        const parentFolderResponse = await drive.files.get({
          fileId: parentId,
          fields: "id, parents",
        });

        const parentFolder = parentFolderResponse.data;

        backFolder = {
          id: parentFolder.parents ? parentFolder.parents[0] : "root",
          name: "Back",
          mimeType: "application/vnd.google-apps.folder",
          iconLink: "https://img.icons8.com/glyph-neue/16/circled-left-2.png",
        };
      } else {
        // Si no hay archivos en la carpeta pero no estamos en la raíz, agregar "Back"
        backFolder = {
          id: "root",
          name: "Back",
          mimeType: "application/vnd.google-apps.folder",
          iconLink: "https://img.icons8.com/glyph-neue/16/circled-left-2.png",
        };
      }

      if (backFolder) {
        files.unshift(backFolder);
      }
    }

    res.json({
      files: files.map((file) => ({
        ...file,
        accessToken,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "No se pudieron listar los archivos o carpetas." });
  }
});


/// Nueva ruta para descargar un archivo por ID
router.get("/download", async (req: Request, res: Response) => {
  const { fileId, accessToken, exportMimeType } = req.query; // exportMimeType puede ser un tipo MIME para exportar archivos de Google Docs
  console.log(fileId, accessToken, exportMimeType);

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

    console.log("downloading");

    const fileName = fileMetadata.data.name || "file";
    const mimeType = fileMetadata.data.mimeType || "application/octet-stream";

    // Si el archivo es de Google Docs, convertirlo al formato solicitado
    if (
      mimeType === "application/vnd.google-apps.document" ||
      mimeType === "application/vnd.google-apps.spreadsheet" ||
      mimeType === "application/vnd.google-apps.presentation"
    ) {
      // Si se proporciona un tipo MIME para exportar, lo usamos, si no, lo exportamos a PDF por defecto
      const exportMime = exportMimeType || "application/pdf";

      // Configurar la respuesta para la descarga
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}.pdf"`
      ); // O el formato que desees
      res.setHeader("Content-Type", exportMime as string);

      // Exportar el archivo de Google Docs a otro formato (PDF, DOCX, etc.)
      const fileStream = await drive.files.export(
        { fileId: fileId as string, mimeType: exportMime },
        { responseType: "stream" }
      );

      fileStream.data
        .on("end", () =>
          console.log(
            `Archivo ${fileName} exportado y descargado correctamente.`
          )
        )
        .on("error", (err) => {
          console.error("Error al exportar el archivo:", err);
          res.status(500).json({ error: "Error al exportar el archivo." });
        })
        .pipe(res); // Transmitir el contenido al cliente
    } else {
      // Para archivos que no son Google Docs, simplemente los descargamos
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );
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
    }
  } catch (error) {
    console.error("Error al descargar el archivo:", error);
    res.status(500).json({ error: "Error al descargar el archivo." });
  }
});

// Ruta para eliminar un archivo por ID
router.delete("/delete", async (req: Request, res: Response) => {
  const { fileId, accessToken } = req.query; // El archivo a eliminar por su ID

  if (!fileId || !accessToken) {
    res.status(400).json({ error: "fileId y accessToken son requeridos." });
    return;
  }

  try {
    // Configurar el cliente con el token del usuario
    oAuth2Client.setCredentials({ access_token: accessToken as string });

    // Llamar a la API para eliminar el archivo
    await drive.files.delete({
      fileId: fileId as string,
    });

    console.log(`Archivo con ID ${fileId} eliminado correctamente.`);

    // Responder con éxito
    res.status(200).json({ message: "Archivo eliminado exitosamente." });
  } catch (error) {
    console.error("Error al eliminar el archivo:", error);
    res.status(500).json({ error: "Error al eliminar el archivo." });
  }
});

// Ruta para eliminar un archivo por ID
router.put("/trash", async (req: Request, res: Response) => {
  const { fileId, accessToken } = req.query; // El archivo a eliminar por su ID
  console.log(fileId, accessToken);

  if (!fileId || !accessToken) {
    res.status(400).json({ error: "fileId y accessToken son requeridos." });
    return;
  }

  try {
    // Configurar el cliente con el token del usuario
    oAuth2Client.setCredentials({ access_token: accessToken as string });

    // Llamar a la API para eliminar el archivo
    drive.files.update({
      fileId: fileId as string,
      requestBody: { trashed: true },
    });

    console.log(`Archivo con ID ${fileId} eliminado correctamente.`);

    // Responder con éxito
    res.status(200).json({ message: "Archivo eliminado exitosamente." });
  } catch (error) {
    console.error("Error al eliminar el archivo:", error);
    res.status(500).json({ error: "Error al eliminar el archivo." });
  }
});

// Ruta para listar archivos en la papelera
router.get("/trashcan", async (req: Request, res: Response) => {
  const accessToken = req.query.accessToken as string;

  if (!accessToken) {
    res.status(400).send("El token de acceso es requerido.");
    return;
  }

  oAuth2Client.setCredentials({
    access_token: accessToken,
  });

  try {
    const response = await drive.files.list({
      q: "trashed = true", // Filtrar archivos en la papelera
      fields: "files(id, name, mimeType, trashed)", // Obtener información de los archivos en la papelera
    });

    const files = response.data.files || [];
    res.json({
      files: files.map((file) => ({
        ...file, // Desestructura las propiedades de cada archivo
        accessToken, // Asegúrate de que el token esté aquí
      })),
    });
  } catch (err) {
    console.error("Error al listar los archivos en la papelera:", err);
    res
      .status(500)
      .json({ error: "No se pudieron listar los archivos en la papelera" });
  }
});



// Ruta para eliminar un archivo por ID
router.put("/untrash", async (req: Request, res: Response) => {
  const { fileId, accessToken } = req.query; // El archivo a eliminar por su ID

  if (!fileId || !accessToken) {
    res.status(400).json({ error: "fileId y accessToken son requeridos." });
    return;
  }

  try {
    // Configurar el cliente con el token del usuario
    oAuth2Client.setCredentials({ access_token: accessToken as string });

    // Llamar a la API para eliminar el archivo
    drive.files.update({
      fileId: fileId as string,
      requestBody: { trashed: false },
    });

    console.log(`Archivo con ID ${fileId} eliminado correctamente.`);

    // Responder con éxito
    res.status(200).json({ message: "Archivo eliminado exitosamente." });
  } catch (error) {
    console.error("Error al eliminar el archivo:", error);
    res.status(500).json({ error: "Error al eliminar el archivo." });
  }
});



// Ruta para buscar archivos en la papelera con múltiples filtros
router.get("/search-trashcan", async (req: Request, res: Response) => {
  const accessToken = req.query.accessToken as string;
  const categories = req.query.categories as string;
  const date = req.query.date as string;
  const containsWords = req.query.containsWords as string;
  const modifiedDate = req.query.modifiedDate as string;
  const startModified = req.query.startModified as string;
  const endModified = req.query.endModified as string;

  if (!accessToken) {
    res.status(400).send("El token de acceso es requerido.");
    return;
  }

  oAuth2Client.setCredentials({
    access_token: accessToken,
  });

  // Función para validar si la fecha es válida
  const validateDate = (date: string) => !isNaN(Date.parse(date)); // Verifica si es una fecha válida

  try {
    // Construir la consulta dinámica de búsqueda
    const queryConditions: string[] = [];

    // Filtrar por categorías (mimeType)
    if (categories) {
      const slicedCategories = categories.split(",");
      const mimeTypeQuery = slicedCategories
        .map((category) => `mimeType='${category}'`)
        .join(" or ");
      queryConditions.push(`(${mimeTypeQuery})`);
    }

    // Filtrar por nombre que contiene palabras específicas
    if (containsWords) {
      queryConditions.push(`name contains '${containsWords}'`);
    }

    // Filtrar por fecha exacta de creación (si es válida)
    if (date && validateDate(date)) {
      queryConditions.push(`createdTime = '${new Date(date).toISOString()}'`);
    }

    // Filtrar por fecha exacta de última modificación (si es válida)
    if (modifiedDate && validateDate(modifiedDate)) {
      queryConditions.push(
        `modifiedTime = '${new Date(modifiedDate).toISOString()}'`
      );
    }

    // Filtrar por rango de fechas de última modificación (si son válidas)
    if (
      startModified &&
      endModified &&
      validateDate(startModified) &&
      validateDate(endModified)
    ) {
      queryConditions.push(
        `modifiedTime >= '${new Date(
          startModified
        ).toISOString()}' and modifiedTime <= '${new Date(
          endModified
        ).toISOString()}'`
      );
    }

    // Incluir la condición de estar en la papelera
    queryConditions.push("trashed = true");

    // Unir todas las condiciones en una consulta
    const finalQuery =
      queryConditions.length > 0 ? queryConditions.join(" and ") : undefined;

    // Consulta en Google Drive con todos los filtros aplicados
    const response = await drive.files.list({
      q: finalQuery, // Usar la consulta dinámica
      fields:
        "files(id, name, mimeType, trashed, createdTime, modifiedTime, size, fileExtension, iconLink)", // Campos que deseas obtener
    });

    const files = response.data.files || [];
    console.log(files);
    res.json({
      files: files.map((file) => ({
        ...file, // Desestructura las propiedades de cada archivo
        accessToken, // Asegúrate de que el token esté aquí
      })),
    });
  } catch (err) {
    console.error("Error al buscar archivos en la papelera:", err);
    res
      .status(500)
      .json({ error: "No se pudieron realizar la búsqueda en la papelera" });
  }
});

router.get("/folders", async (req: Request, res: Response) => {
  const accessToken = req.query.accessToken as string;
  const folderId = req.query.folderId as string || "root"; // Usa 'root' si no se proporciona folderId
  console.log(`AccessToken: ${accessToken}, FolderId: ${folderId}`);

  if (!accessToken) {
    res.status(400).json({ error: "El token de acceso es requerido." });
    return;
  }

  oAuth2Client.setCredentials({
    access_token: accessToken,
  });

  try {
    // Lista las carpetas dentro del folderId dado
    const response = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and trashed = false and '${folderId}' in parents`,
      fields: "files(id, name, mimeType, trashed, createdTime, modifiedTime, size, fileExtension, iconLink, parents)",
    });

    const folders = response.data.files || [];

    // Si no estamos en la raíz, obtener el padre de la carpeta actual
    if (folderId !== "root" && folders.length > 0) {
      const currentFolder = folders[0];  // Tomamos el primer elemento como carpeta actual
      const parentId = currentFolder.parents ? currentFolder.parents[0] : null;

      if (parentId) {
        // Obtenemos la carpeta padre
        const parentFolderResponse = await drive.files.get({
          fileId: parentId,
          fields: "id, name, mimeType, iconLink, parents"
        });

        const parentFolder = parentFolderResponse.data;
        const backFolder = {
          id: parentFolder.parents ? parentFolder.parents[0] : "root",
          name: "Back",  // El nombre de la carpeta "back"
          mimeType: parentFolder.mimeType,
          iconLink: "https://img.icons8.com/glyph-neue/16/circled-left-2.png"
        };

        folders.unshift(backFolder);  // Añadimos la carpeta "back" al inicio de la lista de carpetas
      }
    }

    res.json(folders);  // Enviar la respuesta con las carpetas y la carpeta "back" si aplica
  } catch (err) {
    console.error("Error al listar carpetas:", err);
    res.status(500).json({ error: "No se pudieron listar las carpetas." });
  }
});

router.get("/folderContent", async (req: Request, res: Response) => {
  const accessToken = req.query.accessToken as string;
  const folderId = req.query.folderId as string || "root"; // Usa 'root' si no se proporciona folderId
  console.log(`AccessToken: ${accessToken}, FolderId: ${folderId}`);

  if (!accessToken) {
    res.status(400).json({ error: "El token de acceso es requerido." });
    return;
  }

  oAuth2Client.setCredentials({
    access_token: accessToken,
  });

  try {
    // Lista las carpetas dentro del folderId dado
    const response = await drive.files.list({
      q: `trashed = false and '${folderId}' in parents`,
      fields: "files(id, name, mimeType, trashed, createdTime, modifiedTime, size, fileExtension, iconLink, parents)",
    });

    const folders = response.data.files || [];

    // Si no estamos en la raíz, obtener el padre de la carpeta actual
    if (folderId !== "root" && folders.length > 0) {
      const currentFolder = folders[0];  // Tomamos el primer elemento como carpeta actual
      const parentId = currentFolder.parents ? currentFolder.parents[0] : null;

      if (parentId) {
        // Obtenemos la carpeta padre
        const parentFolderResponse = await drive.files.get({
          fileId: parentId,
          fields: "id, name, mimeType, iconLink, parents"
        });

        const parentFolder = parentFolderResponse.data;
        const backFolder = {
          id: parentFolder.parents ? parentFolder.parents[0] : "root",
          name: "Back",  // El nombre de la carpeta "back"
          mimeType: parentFolder.mimeType,
          iconLink: "https://img.icons8.com/glyph-neue/16/circled-left-2.png"
        };

        folders.unshift(backFolder);  // Añadimos la carpeta "back" al inicio de la lista de carpetas
      }
    }

    res.json(folders);  // Enviar la respuesta con las carpetas y la carpeta "back" si aplica
  } catch (err) {
    console.error("Error al listar carpetas:", err);
    res.status(500).json({ error: "No se pudieron listar las carpetas." });
  }
});


// Ruta para crear una carpeta
router.post("/folders", async (req: Request, res: Response) => {
  console.log(req.body);
  const accessToken = req.body.accessToken as string;
  const folderName = req.body.folderName;
  const folderParent = req.body.folderParent || "root"; // Usar 'root' si no se proporciona un padre

  if (!accessToken || !folderName) {
    res.status(400).json({ error: "El token de acceso y el nombre de la carpeta son requeridos." });
    return;
  }

  oAuth2Client.setCredentials({
    access_token: accessToken,
  });

  try {
    const response = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [folderParent],
      },
      fields: "id, name",
    });

    res.status(201).json({
      message: "Carpeta creada exitosamente.",
      folder: response.data,
    });
  } catch (err) {
    console.error("Error al crear la carpeta:", err);
    res.status(500).json({ error: "No se pudo crear la carpeta." });
  }
});
// Ruta para crear un archivo de Google según el tipo (documento, hoja de cálculo, etc.)
router.post("/create-document", async (req: Request, res: Response) => {
  const accessToken = req.body.accessToken; // El token de acceso
  const fileType = req.body.fileType || "document"; // Tipo de archivo, por defecto "document"
  
  if (!accessToken) {
    res.status(400).json({ error: "El token de acceso es requerido." });
    return;
  }

  oAuth2Client.setCredentials({ access_token: accessToken });

  try {
    // Definir los tipos de archivo y sus mimeTypes
    let fileMetadata: { name: string; mimeType: string };
    let fileUrl: string;

    switch (fileType) {
      case "spreadsheet":
        fileMetadata = {
          name: "Nueva Hoja de Cálculo",
          mimeType: "application/vnd.google-apps.spreadsheet", // Tipo para hojas de cálculo
        };
        fileUrl = `https://docs.google.com/spreadsheets/d/{fileId}/edit`;
        break;
      case "presentation":
        fileMetadata = {
          name: "Nueva Presentación",
          mimeType: "application/vnd.google-apps.presentation", // Tipo para presentaciones
        };
        fileUrl = `https://docs.google.com/presentation/d/{fileId}/edit`;
        break;
      case "document":
      default:
        fileMetadata = {
          name: "Nuevo Documento",
          mimeType: "application/vnd.google-apps.document", // Tipo para Google Docs
        };
        fileUrl = `https://docs.google.com/document/d/{fileId}/edit`;
        break;
    }

    // Crear el archivo en Google Drive
    const file = await drive.files.create({
      requestBody: fileMetadata,
    });

    // URL para ver el archivo en el tipo seleccionado
    const fileId = file.data.id;
    const redirectUrl = fileUrl.replace("{fileId}", fileId!);

    // Redirigir al usuario a la URL del archivo creado
    res.status(200).json({ redirectUrl });
  } catch (error) {
    console.error("Error al crear el documento:", error);
    res.status(500).json({ error: "Error al crear el documento." });
  }
});

router.post("/upload", async (req: Request, res: Response) => {
  const accessToken = req.body.accessToken as string;
  const folderId = req.body.folderId as string || "root"; // Carpeta destino
  const file = req.files.file; // Archivo enviado en la solicitud

  if (!accessToken || !file) {
    res.status(400).json({ error: "El token de acceso y el archivo son requeridos." });
    return;
  }

  // Verifica si el archivo está en un formato esperado
  if (Array.isArray(file)) {
    res.status(400).json({ error: "Se esperaba un solo archivo." });
    return;
  }

  try {
    // Configurar el cliente OAuth con el token
    oAuth2Client.setCredentials({ access_token: accessToken });

    // Crear el archivo en Google Drive
    const fileMetadata = {
      name: file.name,
      parents: [folderId], // Guardar en la carpeta especificada
    };

    const media = {
      mimeType: file.mimetype,
      body: new stream.PassThrough().end(file.data), // Archivo en buffer
    };

    console.log("enviando archivo")
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: "id, name, webViewLink",
    });
    console.log("jeje")


    const uploadedFile = response.data;
    res.status(200).json({
      message: "Archivo subido exitosamente.",
      file: uploadedFile,
    });
  } catch (err) {
    console.error("Error al subir el archivo:", err);
    res.status(500).json({ error: "No se pudo subir el archivo." });
  }
});



// Ruta raíz
router.get("/", (req: Request, res: Response) => {
  res.send("Files");
});

export default router;
