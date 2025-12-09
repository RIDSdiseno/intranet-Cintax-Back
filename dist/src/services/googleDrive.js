"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.oauth2Client = void 0;
exports.generateDriveAuthUrl = generateDriveAuthUrl;
exports.getDriveClientForUser = getDriveClientForUser;
exports.getAdminDriveClient = getAdminDriveClient;
const googleapis_1 = require("googleapis");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const DRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file"
];
exports.oauth2Client = new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_DRIVE_REDIRECT_URI);
function generateDriveAuthUrl(userId) {
    return exports.oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: DRIVE_SCOPES,
        state: String(userId), // 👈 aquí mandamos el id del trabajador
    });
}
// Devuelve un cliente de Drive para el trabajador logueado
async function getDriveClientForUser(trabajadorId) {
    const user = await prisma.trabajador.findUnique({
        where: { id_trabajador: trabajadorId },
    });
    if (!user?.googleRefreshToken) {
        throw new Error("Usuario no tiene Drive conectado");
    }
    const client = new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_DRIVE_REDIRECT_URI);
    client.setCredentials({ refresh_token: user.googleRefreshToken });
    return googleapis_1.google.drive({ version: "v3", auth: client });
}
function getAdminDriveClient() {
    const refreshToken = process.env.GOOGLE_DRIVE_ADMIN_REFRESH_TOKEN;
    if (!refreshToken) {
        throw new Error("Falta GOOGLE_DRIVE_ADMIN_REFRESH_TOKEN");
    }
    const client = new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_DRIVE_REDIRECT_URI);
    client.setCredentials({ refresh_token: refreshToken });
    return googleapis_1.google.drive({ version: "v3", auth: client });
}
