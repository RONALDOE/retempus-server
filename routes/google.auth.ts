    import express, {  Router, Request, Response  } from "express";
    import dotenv from 'dotenv'
    import {google,  } from 'googleapis'
    dotenv.config()

    const router: Router = express()

    const clientId = process.env.CLIENT_ID  
    const clientSecret = process.env.CLIENT_SECRET
    const redirectUri = process.env.REDIRECT_URI
    const scopes = ['https://www.googleapis.com/auth/drive']

    const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)

    const authURl = oAuth2Client.generateAuthUrl({  
        access_type: "offline",
        scope: scopes,
        include_granted_scopes: true
    });

    router.get('/', (req: Request, res: Response) =>{
        res.send(authURl)
    })

    var drive = google.drive({
        version: "v3", 
        auth: oAuth2Client,
    })

    router.get('/callback', async (req: Request, res: Response) => {
        const code = req.query.code as string; // Ensure `code` is treated as a string

        try {
            const tokenResponse = await oAuth2Client.getToken(code); // Await the Promise
            const tokens = tokenResponse.tokens; // Access the `tokens` property
            const accessToken = tokens.access_token;
            const refreshToken = tokens.refresh_token;
            
            oAuth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
            res.send(oAuth2Client);
        } catch (error) {
            console.error('Error authenticating:', error);
            res.status(500).send('Authentication failed.');
        }
    });     

    export default router