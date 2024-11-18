import express, {  Router, Request, Response  } from "express";
import dotenv from 'dotenv'
import {google,  } from 'googleapis'
dotenv.config()

const router: Router = express()

const clientId = process.env.CLIENT_ID  
const clientSecret = process.env.CLIENT_SECRET
const redirectUri = process.env.REDIRECT_URI
const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)

var drive = google.drive({
    version: "v3", 
    auth: oAuth2Client,
})

//Ruta para listar archivos
router.get('/files', async (req, res) => {
    try {
      const response = await drive.files.list({
        fields: 'files(name, id)', // Specify the fields to include in the response
      });
      const files = response.data.files;
      res.json(files);
    } catch (err) {
      console.error('Error listing files:', err);
      res.status(500).json({ error: 'Failed to list files' });
    }});


router.get('/filesbytypes', async (req: Request, res: Response) =>{

    const {types}  = req.body.types
    const files = []

    try {
        const response = await drive.files.list({
            // q: `mimeType=\${types} \ `,
          fields: 'files(name, id)', // Specify the fields to include in the response
        });
        const files = response.data.files;
        res.json(files);
      } catch (err) {
        console.error('Error listing files:', err);
        res.status(500).json({ error: 'Failed to list files' });
      }});


router.get('/', (req: Request, res: Response) =>{
    res.send('Files')
})

export default router