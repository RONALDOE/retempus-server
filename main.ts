import express, { Application, Request, Response } from 'express';
import dotenv from 'dotenv';
import files from './routes/files.route'
import gauth from './routes/google.auth'
import auth from './routes/auth.route'
import dashboard from './routes/dashboard.route'
import cors from 'cors';

import { db,  } from './utils/utils.ts';
dotenv.config();
const app: Application = express();
const port: number = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.get('/', (req: Request, res: Response) => {
  res.send('Hello, World!');
});



app.use(express.json());
app.use(cors( {
  methods: ["POST", "GET", "DELETE", "PUT"]
}));
app.use('/files', files)
app.use('/gauth', gauth)
app.use('/auth', auth)
app.use('/dashboard', dashboard)


db.getConnection((err) => {
  if (err) {
    console.error('Error connecting to MySQL: ' + err.stack);
    return;
  }
  console.log('Connected to MySQL as ID ' + db.threadId);
});




app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});