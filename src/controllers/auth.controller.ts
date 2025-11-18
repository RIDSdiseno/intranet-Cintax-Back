import type { Request, Response } from "express";
import {Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Secret } from "jsonwebtoken";
import crypto from "crypto";
import { Readable } from "stream";
import "dotenv/config";
import { OAuth2Client } from "google-auth-library";
import { syncTicketsFromFreshdesk } from "../services/freshdeskService";
import { generateDriveAuthUrl, getDriveClientForUser, oauth2Client } from "../services/googleDrive";
import { resolveFolderPath } from "../services/googleDrivePath";

const prisma = new PrismaClient();

/* =========================
   CONFIG / CONSTANTES
========================= */

// JWT para Access Token
const JWT_SECRET: Secret = process.env.JWT_SECRET ?? "dev_secret";
const ACCESS_EXPIRES_SEC = Number(process.env.JWT_ACCESS_EXPIRES_SECONDS ?? 180 * 60);

// Refresh Token (cookie)
const REFRESH_DAYS = Number(process.env.REFRESH_DAYS ?? 7);
const REFRESH_REMEMBER_DAYS = Number(process.env.REFRESH_REMEMBER_DAYS ?? 60);

const COOKIE_SECURE = String(process.env.COOKIE_SECURE ?? "false") === "true";
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE as "lax" | "strict" | "none") ?? "lax";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
const COOKIE_PATH = process.env.COOKIE_PATH ?? "/api/auth";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_ALLOWED_DOMAIN = process.env.GOOGLE_ALLOWED_DOMAIN; // ej: "tuempresa.cl"
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);


/* =========================
   TIPOS
========================= */
type JwtPayload = {
  id: number;
  email: string;       // derivado de nivel
  nombreUsuario: string;
};


/* =========================
   HELPERS
========================= */

// Access Token (JWT)
function signAccessToken(payload: JwtPayload, expiresInSec = ACCESS_EXPIRES_SEC) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expiresInSec });
}

// Refresh Token aleatorio + hash SHA-256 (se guarda sólo el hash)
function generateRT(): string {
  return crypto.randomBytes(64).toString("base64url");
}
function hashRT(rt: string): string {
  return crypto.createHash("sha256").update(rt).digest("hex");
}

function addDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function parseRemember(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return false;
}

function setRefreshCookie(res: Response, rt: string, days: number) {
  const maxAge = days * 24 * 60 * 60 * 1000;
  res.cookie("rt", rt, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    domain: COOKIE_DOMAIN,
    maxAge,
    path: COOKIE_PATH, // <- clave para que el navegador/cliente la envíe a /api/auth/*
  });
}
function clearRefreshCookie(res: Response) {
  res.clearCookie("rt", {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    domain: COOKIE_DOMAIN,
    path: COOKIE_PATH,
  });
}

/* =========================
   CONTROLADORES
========================= */
//POST Auth/register
// POST /api/auth/register
export const registerTrabajador = async (req: Request, res: Response) => {
  try {
    const { nombre, email, password } = req.body;

    // Validaciones básicas
    if (!nombre || !email || !password) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    // Normalizar email
    const emailNorm = String(email).trim().toLowerCase();

    const existing = await prisma.trabajador.findUnique({ where: { email: emailNorm } });
    if (existing) return res.status(409).json({ error: "Trabajador ya existe" });

    // Hash de contraseña con bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    const newTrabajador = await prisma.trabajador.create({
      data: {
        nombre,
        email: emailNorm,
        passwordHash,
        status: true,
      },
      select: {
        id_trabajador: true,
        nombre: true,
        email: true,
      },
    });

    return res.status(201).json({ trabajador: newTrabajador });
  } catch (error) {
    console.error("Register error", error);
    return res.status(500).json({ error: "Error interno" });
  }
};


/* =========================
   GOOGLE LOGIN PARA TRABAJADORES
========================= */

// POST /api/auth/google
export const googleLoginTrabajador = async (req: Request, res: Response) => {
  try {
    const { idToken, remember } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: "Falta idToken de Google" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).json({ error: "Token de Google inválido" });
    }

    const email = (payload.email ?? "").toLowerCase();
    const nombre = payload.name ?? "Sin nombre";
    const googleId = payload.sub;
    const hd = payload.hd;

    if (GOOGLE_ALLOWED_DOMAIN && hd !== GOOGLE_ALLOWED_DOMAIN) {
      return res.status(403).json({ error: "Dominio no autorizado" });
    }

    if (!email || !googleId) {
      return res.status(400).json({ error: "Google no entregó email o id válidos" });
    }

    let trabajador = await prisma.trabajador.findUnique({ where: { email } });

    let firstLogin = false;

    if (!trabajador) {
      // PRIMERA VEZ que se ve este correo
      firstLogin = true;
      trabajador = await prisma.trabajador.create({
        data: {
          nombre,
          email,
          googleId,
          status: true,
        },
      });
    } else if (!trabajador.googleId) {
      // Ya existía por registro normal, ahora vincula Google
      trabajador = await prisma.trabajador.update({
        where: { email },
        data: { googleId },
      });
    }

    if (!trabajador.status) {
      return res.status(403).json({ error: "Trabajador inactivo" });
    }

    const jwtPayload: JwtPayload = {
      id: trabajador.id_trabajador,
      email: trabajador.email,
      nombreUsuario: trabajador.nombre,
    };

    const accessToken = signAccessToken(jwtPayload);

    const rtRaw = generateRT();
    const rtHash = hashRT(rtRaw);
    const rememberBool = parseRemember(remember);
    const rtDays = rememberBool ? REFRESH_REMEMBER_DAYS : REFRESH_DAYS;

    await prisma.refreshToken.create({
      data: {
        trabajadorId: trabajador.id_trabajador,
        tokenHash: rtHash,
        expiresAt: addDays(rtDays),
      },
    });

    setRefreshCookie(res, rtRaw, rtDays);

    const hasPassword = !!trabajador.passwordHash;

    return res.json({
      trabajador: {
        id: trabajador.id_trabajador,
        nombre: trabajador.nombre,
        email: trabajador.email,
      },
      accessToken,
      firstLogin,    // 👈 primera vez con Google
      hasPassword,   // 👈 ya tiene password propia o no
    });
  } catch (error) {
    console.error("Google login error", error);
    return res.status(500).json({ error: "Error interno" });
  }
};

// POST /api/auth/login
export const loginTrabajador = async (req: Request, res: Response) => {
  try {
    const { email, password, remember } = req.body as {
      email?: string;
      password?: string;
      remember?: boolean;
    };

    if (!email || !password) {
      return res.status(400).json({ error: "Correo y contraseña son obligatorios" });
    }

    const emailNorm = email.trim().toLowerCase();

    const user = await prisma.trabajador.findUnique({
      where: { email: emailNorm },
      select: {
        id_trabajador: true,
        nombre: true,
        email: true,
        passwordHash: true,
        status: true,
      },
    });

    if (!user || !user.status || !user.passwordHash) {
      // Dummy compare para evitar timing attacks
      await bcrypt.compare(
        password,
        "$2b$10$invalidinvalidinvalidinvalidinv12345678901234567890"
      );
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // 1) Access Token (corto)
    const accessToken = signAccessToken({
      id: user.id_trabajador,
      email: user.email,
      nombreUsuario: user.nombre,
    });

    // 2) Refresh Token (cookie httpOnly) + registro en DB
    const rememberFlag = Boolean(remember);
    const days = rememberFlag ? REFRESH_REMEMBER_DAYS : REFRESH_DAYS;

    const rt = generateRT();     // valor que va en cookie
    const rtHash = hashRT(rt);   // hash que guardamos en BD

    await prisma.refreshToken.create({
      data: {
        trabajadorId: user.id_trabajador,
        tokenHash: rtHash,
        expiresAt: addDays(days),
      },
    });

    // Cookie httpOnly con el refresh token
    setRefreshCookie(res, rt, days);

    // Devolvemos usuario sin passwordHash
    const { passwordHash, ...safeUser } = user;

    return res.json({
      accessToken,
      trabajador: safeUser,
      remember: rememberFlag,
    });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ error: "Error interno" });
  }
};

// POST /api/auth/logout
export const logoutTrabajador = async (req: Request, res: Response) => {
  try {
    // Cookie "rt" viene gracias a cookie-parser
    const rt = (req as any).cookies?.rt as string | undefined;

    if (rt) {
      const rtHash = hashRT(rt);

      // Borramos TODOS los refresh tokens con ese hash
      await prisma.refreshToken.deleteMany({
        where: { tokenHash: rtHash },
      });
    }

    // Limpiar cookie httpOnly
    clearRefreshCookie(res);

    return res.status(200).json({ message: "Sesión cerrada" });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ error: "Error interno" });
  }
};
export const listTickets = async (req: Request, res: Response) => {
  try {
    const { categoria, estado } = req.query as {
      categoria?: string;
      estado?: string;
    };
    const where: any = {};
    if (categoria && categoria !== "todos") where.categoria = categoria;
    if (estado && estado !== "todos") where.estado = estado;

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: [
        { freshdeskId: "desc" },
        { createdAt: "desc" },
      ],
      include: {
        trabajador: {
          select: { id_trabajador: true, nombre: true, email: true },
        },
      },
    });

    return res.json({tickets});
  } catch (err) {
    console.error("listTickets error:", err);
    return res.status(500).json({ error: "Error interno" });
  }
};

/**
 * POST /api/tickets
 * body: { subject, description, categoria, prioridad? }
 */
export const createTicket = async (req: Request, res: Response) => {
  try {
    const { subject, description, categoria, prioridad } = req.body;

    if (!subject || !description || !categoria) {
      return res
        .status(400)
        .json({ error: "subject, description y categoria son obligatorios" });
    }

    const requesterEmail = req.user?.email ?? "desconocido@cintax.cl";
    const trabajadorId = req.user?.id ?? null;

    const ticket = await prisma.ticket.create({
      data: {
        subject,
        description,
        categoria,
        estado: "open",
        prioridad: prioridad ?? null,
        requesterEmail,
        trabajadorId,
      },
    });

    return res.status(201).json(ticket);
  } catch (err) {
    console.error("createTicket error:", err);
    return res.status(500).json({ error: "Error interno" });
  }
};

export const syncTickets = async (req: Request, res: Response) => {
  try {
    const count = await syncTicketsFromFreshdesk(); // sin maxPages

    res.json({
      message: "Sincronización completada",
      processed: count,
    });
  } catch (err) {
    console.error("Error syncTickets:", err);
    res.status(500).json({ error: "Error sincronizando con Freshdesk" });
  }
};

/*
==================================

        GOOGLE DRIVE

==================================

*/ 

export const connectDrive = (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "No autenticado" });

  // 👇 ahora pasamos el id del trabajador
  const url = generateDriveAuthUrl(req.user.id);
  return res.json({ url });
};

export const driveCallback = async (req: Request, res: Response) => {
  try {
    // ===== DEBUG: logueamos qué está llegando realmente =====
    console.log("driveCallback query:", req.query);

    const rawCode = req.query.code;
    const rawState = req.query.state;

    const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
    let stateStr = Array.isArray(rawState) ? rawState[0] : rawState;

    if (!code) return res.status(400).send("Falta code");
    if (!stateStr) return res.status(400).send("Falta state");

    stateStr = String(stateStr).trim();
    console.log("driveCallback parsed stateStr:", stateStr);

    const isAdmin = stateStr === "admin";
    const userId = !isAdmin && /^\d+$/.test(stateStr) ? Number(stateStr) : null;

    // Si no es admin y tampoco es un número válido => error
    if (!isAdmin && !userId) {
      return res.status(400).send("state inválido");
    }

    const { tokens } = await oauth2Client.getToken(String(code));
    console.log("driveCallback tokens:", tokens);

    // Puede venir como tokens.refresh_token o dentro de credentials
    const refreshToken =
      tokens.refresh_token || (oauth2Client.credentials as any).refresh_token;

    if (!refreshToken) {
      console.warn("No se recibió refresh_token en callback Drive (state=", stateStr, ")");
      return res.status(400).send("No se recibió refresh_token");
    }

    if (isAdmin) {
      // Aquí deberías guardarlo en alguna tabla Config / Settings
      console.log("REFRESH TOKEN ADMIN:", refreshToken);

      // TODO: guarda refreshToken en BD en vez de solo log
      return res.send(
        "Google Drive ADMIN conectado correctamente. Ya puedes cerrar esta pestaña y volver a la intranet."
      );
    }

    // ---- MODO USUARIO (lo que ya tenías) ----
    await prisma.trabajador.update({
      where: { id_trabajador: userId! },
      data: { googleRefreshToken: refreshToken },
    });

    // Redirige al front
    return res.redirect("https://intranet-cintax.netlify.app/drive?connected=1");
  } catch (err) {
    console.error("driveCallback error", err);
    return res.status(500).send("Error conectando Google Drive");
  }
};



// src/controllers/auth.controller.ts

export const listCintax2025Folders = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "No autenticado" });

    const drive = await getDriveClientForUser(userId);

    let yearString = req.params.year as string | undefined;
    if (!yearString) {
      yearString = new Date().getFullYear().toString();
    }

    let folders = [];
    let baseFolderId = null;

    try {
      // 1. Intentamos la ruta estricta: CINTAX / AÑO
      const basePath = ["CINTAX", yearString];
      const yearFolderId = await resolveFolderPath(drive, basePath);
      baseFolderId = yearFolderId;

      const foldersRes = await drive.files.list({
        q: `'${yearFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id, name, mimeType, modifiedTime)",
        orderBy: "name",
      });
      
      folders = foldersRes.data.files ?? [];

    } catch (pathError) {
      // 2. FALLBACK: Si no existe la ruta CINTAX/2025 en "Mi Unidad",
      // buscamos carpetas compartidas directamente que parezcan del año o estructura.
      
      // NOTA: Aquí buscamos cualquier carpeta que esté "Compartida conmigo"
      // Puedes agregar filtros por nombre si quieres ser más estricto, 
      // ej: "name contains 'A0' and ..."
      console.log("Ruta no encontrada, buscando en compartidos...");

      const sharedRes = await drive.files.list({
        q: `sharedWithMe = true and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id, name, mimeType, modifiedTime)",
        orderBy: "name",
      });

      // Opcional: Aquí podrías filtrar los resultados por nombre si tienes una convención
      // Por ejemplo, si solo quieres mostrar carpetas que empiecen con "A" o "B"
      folders = sharedRes.data.files ?? [];
    }

    return res.json({
      year: yearString,
      baseFolderId: baseFolderId, // Puede ser null si es compartido
      folders: folders,
    });

  } catch (err: any) {
    console.error("listCintax2025Folders error:", err);
    return res.status(500).json({ error: "Error listando carpetas" });
  }
};

export const listFilesInFolder = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "No autenticado" });

    const drive = await getDriveClientForUser(userId);
    const folderId = req.params.id;

    const resp = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id, name, mimeType, modifiedTime, size, webViewLink, iconLink)",
      orderBy: "name",
    });

    return res.json({ files: resp.data.files ?? [] });
  } catch (err) {
    console.error("listFilesInFolder error:", err);
    return res.status(500).json({ error: "Error listando archivos" });
  }
};

export const uploadToFolder = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "No autenticado" });

    const folderId = req.params.id;
    if (!folderId) {
      return res.status(400).json({ error: "Falta folderId" });
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: "No se recibió archivo" });
    }

    const drive = await getDriveClientForUser(userId);

    // Convertimos el buffer en stream
    const stream = Readable.from(file.buffer);

    const resp = await drive.files.create({
      requestBody: {
        name: file.originalname,
        parents: [folderId],
      },
      media: {
        mimeType: file.mimetype,
        body: stream,
      },
      fields: "id, name, mimeType, webViewLink, iconLink, modifiedTime, size",
    });

    return res.status(201).json({ file: resp.data });
  } catch (err) {
    console.error("uploadToFolder error:", err);
    return res.status(500).json({ error: "Error subiendo archivo a Drive" });
  }
};