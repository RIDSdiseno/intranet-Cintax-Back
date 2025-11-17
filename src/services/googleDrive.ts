import { google } from "googleapis";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive", 
  // si quieres acceso TOTAL al drive del usuario:
  // "https://www.googleapis.com/auth/drive"
];

export const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_DRIVE_REDIRECT_URI
);

export function generateDriveAuthUrl(userId: number) {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: DRIVE_SCOPES,
    state: String(userId),   // 👈 aquí mandamos el id del trabajador
  });
}


// Devuelve un cliente de Drive para el trabajador logueado
export async function getDriveClientForUser(trabajadorId: number) {
  const user = await prisma.trabajador.findUnique({
    where: { id_trabajador: trabajadorId },
  });

  if (!user?.googleRefreshToken) {
    throw new Error("Usuario no tiene Drive conectado");
  }

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_DRIVE_REDIRECT_URI
  );

  client.setCredentials({ refresh_token: user.googleRefreshToken });

  return google.drive({ version: "v3", auth: client });
}


