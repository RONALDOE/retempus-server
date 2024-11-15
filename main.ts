import express, { Application, Request, Response } from 'express';
import dotenv from 'dotenv';
dotenv.config();
const app: Application = express();
const port: number = process.env.PORT ? parseInt(process.env.PORT) : 3000;
console.log(`port: ${process.env.PORT}`);

app.get('/', (req: Request, res: Response) => {
  res.send('Hello, World!');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});