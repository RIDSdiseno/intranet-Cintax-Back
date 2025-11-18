// src/app.ts
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';         
import routes from './routes.js';
import { errorHandler } from './middlewares/error.middleware.js';
export const app = express();
import "dotenv/config";
import { oauth2Client } from "./services/googleDrive"; // el que ya tienes


app.use(cors({
    origin: [
    'https://intranet-cintax.netlify.app',
    'http://localhost:5173'
  ],
    methods: ['GET','POST','PUT','DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type','Authorization']
}));

app.use(cookieParser());                             // 👈 DEBE ir antes de las rutas
app.use(express.json());
app.use(morgan('dev'));

app.use('/api', routes);    
// debug opcional de cookies:
app.get('/debug/cookies', (req, res) => res.json({ cookies: (req as any).cookies }));
app.get("/admin/drive/auth-url", (_req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
    state: "admin",
  });
  res.send(`<a href="${url}">Conectar admin Cintax</a>`);
});
app.use(errorHandler);