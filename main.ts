import express, { Application, Request, Response } from 'express';
import dotenv from 'dotenv';
import files from './routes/files.route'
import gauth from './routes/google.auth'
dotenv.config();
const app: Application = express();
const port: number = process.env.PORT ? parseInt(process.env.PORT) : 3000;
console.log(`port: ${process.env.PORT}`);

app.get('/', (req: Request, res: Response) => {
  res.send('Hello, World!');
});


app.use('/files', files)
app.use('/gauth', gauth)



app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});