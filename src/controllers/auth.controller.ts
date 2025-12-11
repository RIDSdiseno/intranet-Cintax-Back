import type { Request, Response } from "express";
import {
  Prisma,
  PrismaClient,
  Area,
  FrecuenciaTarea,
  EstadoTarea,
} from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { Secret } from "jsonwebtoken";
import crypto from "crypto";
import { Readable } from "stream";
import "dotenv/config";
import { OAuth2Client } from "google-auth-library";
import { syncTicketsFromFreshdesk } from "../services/freshdeskService";
import {
  generateDriveAuthUrl,
  getAdminDriveClient,
  getDriveClientForUser,
  oauth2Client,
} from "../services/googleDrive";
import { resolveFolderPath } from "../services/googleDrivePath";
import type { drive_v3 } from "googleapis";
import { listGroupMembersEmails } from "../services/googleDirectoryGroups";
import { isSupervisorOrAdminForTrabajador } from "../lib/roles";
import type { AuthJwtPayload } from "../middlewares/auth.middleware";

const prisma = new PrismaClient();

/* =========================
   TAREAS ASIGNADAS
========================= */

type FrontTareaEstado = "pendiente" | "completado" | "atrasado";

function mapEstadoFront(
  estado: EstadoTarea,
  fechaProgramada: Date
): FrontTareaEstado {
  const hoy = new Date();

  if (estado === EstadoTarea.COMPLETADA) return "completado";

  const isLate = fechaProgramada < hoy;
  if (estado === EstadoTarea.VENCIDA || isLate) return "atrasado";

  // PENDIENTE o EN_PROCESO
  return "pendiente";
}

const MULTI_AREA_USERS: string[] = (process.env.DRIVE_MULTI_AREA_USERS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const GROUP_MAP: Array<{ area: Area; envVar: string }> = [
  { area: Area.ADMIN, envVar: "GROUP_ADMIN_EMAIL" },
  { area: Area.CONTA, envVar: "GROUP_CONTA_EMAIL" },
  { area: Area.RRHH, envVar: "GROUP_RRHH_EMAIL" },
  { area: Area.TRIBUTARIO, envVar: "GROUP_TRIBUTARIO_EMAIL" },
];

const AREA_TO_GROUP_ENV: Record<Area, string> = {
  [Area.ADMIN]: "GROUP_ADMIN_EMAIL",
  [Area.CONTA]: "GROUP_CONTA_EMAIL",
  [Area.RRHH]: "GROUP_RRHH_EMAIL",
  [Area.TRIBUTARIO]: "GROUP_TRIBUTARIO_EMAIL",
};

// 🔹 Dado un email, mira en qué grupo(s) está y devuelve el Area correspondiente
async function resolveAreaFromGroupsByEmail(
  email: string
): Promise<Area | null> {
  const normalized = email.toLowerCase();

  for (const { area, envVar } of GROUP_MAP) {
    const groupEmail = process.env[envVar];
    if (!groupEmail) continue;

    try {
      const members = await listGroupMembersEmails(groupEmail);
      if (members.includes(normalized)) {
        return area;
      }
    } catch (err) {
      console.error(`Error leyendo miembros del grupo ${groupEmail}`, err);
    }
  }

  return null;
}

// GET /api/auth/me
export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const trabajador = await prisma.trabajador.findUnique({
      where: { id_trabajador: userId },
      select: {
        id_trabajador: true,
        nombre: true,
        email: true,
        areaInterna: true,
      },
    });

    if (!trabajador) {
      return res.status(404).json({ error: "Trabajador no encontrado" });
    }

    const isSupervisorOrAdmin = isSupervisorOrAdminForTrabajador({
      email: trabajador.email,
      areaInterna: trabajador.areaInterna ?? undefined,
    });

    return res.json({
      id: trabajador.id_trabajador,
      nombre: trabajador.nombre,
      email: trabajador.email,
      areaInterna: trabajador.areaInterna,
      isSupervisorOrAdmin,
    });
  } catch (err) {
    console.error("getMe error:", err);
    return res.status(500).json({ error: "Error interno" });
  }
};

// ========================
//  PERFIL DEL TRABAJADOR
// ========================

// GET /api/auth/me
// en auth.controller.ts
export const getMyProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const trabajador = await prisma.trabajador.findUnique({
      where: { id_trabajador: userId },
      select: {
        id_trabajador: true,
        nombre: true,
        email: true,
        status: true,
        areaInterna: true,
        tipoRelacion: true,
        carpetaDriveCodigo: true,
        createdAt: true,
      },
    });

    if (!trabajador) {
      return res.status(404).json({ error: "Trabajador no encontrado" });
    }

    return res.json({ trabajador });
  } catch (err) {
    console.error("getMyProfile error:", err);
    return res.status(500).json({ error: "Error interno" });
  }
};


// PUT /api/auth/me
export const updateMyProfile = async (req: Request, res: Response) => {
  try {
    const user = req.user as AuthJwtPayload | undefined;
    if (!user?.id) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const { nombre } = req.body as { nombre?: string };

    const updated = await prisma.trabajador.update({
      where: { id_trabajador: user.id },
      data: {
        ...(nombre !== undefined ? { nombre } : {}),
        // Si más adelante agregas columnas nuevas al modelo,
        // aquí las puedes ir mapeando.
      },
      select: {
        id_trabajador: true,
        nombre: true,
        email: true,
        status: true,
        areaInterna: true,
        tipoRelacion: true,
        carpetaDriveCodigo: true,
        createdAt: true,
      },
    });

    return res.json({ trabajador: updated });
  } catch (err) {
    console.error("updateMyProfile error:", err);
    return res.status(500).json({ error: "Error interno actualizando perfil" });
  }
};


async function syncAreasFromGroupsCore(clearOthers: boolean = false) {
  const groupMap: Array<{ area: Area; envVar: string }> = [
    { area: Area.ADMIN, envVar: "GROUP_ADMIN_EMAIL" },
    { area: Area.CONTA, envVar: "GROUP_CONTA_EMAIL" },
    { area: Area.RRHH, envVar: "GROUP_RRHH_EMAIL" },
    { area: Area.TRIBUTARIO, envVar: "GROUP_TRIBUTARIO_EMAIL" },
  ];

  const emailToArea = new Map<string, Area>();

  for (const { area, envVar } of groupMap) {
    const groupEmail = process.env[envVar];
    if (!groupEmail) continue;

    const members = await listGroupMembersEmails(groupEmail);
    for (const rawEmail of members) {
      const email = rawEmail.toLowerCase();

      if (!emailToArea.has(email)) {
        emailToArea.set(email, area);
      }
    }
  }

  if (emailToArea.size === 0) {
    return {
      message: "No se encontraron miembros en los grupos",
      groupsConfigured: [],
      emailCount: 0,
      updated: 0,
      cleared: 0,
    };
  }

  const emails = Array.from(emailToArea.keys());

  const workers = await prisma.trabajador.findMany({
    where: { email: { in: emails } },
    select: { id_trabajador: true, email: true, areaInterna: true },
  });

  let updated = 0;

  for (const w of workers) {
    const desiredArea = emailToArea.get(w.email.toLowerCase());
    if (!desiredArea) continue;

    if (w.areaInterna !== desiredArea) {
      await prisma.trabajador.update({
        where: { id_trabajador: w.id_trabajador },
        data: { areaInterna: desiredArea },
      });
      updated++;
    }
  }

  let cleared = 0;
  if (clearOthers) {
    const res = await prisma.trabajador.updateMany({
      where: {
        areaInterna: {
          in: [Area.ADMIN, Area.CONTA, Area.RRHH, Area.TRIBUTARIO],
        },
        email: { notIn: emails },
      },
      data: { areaInterna: null },
    });
    cleared = res.count;
  }

  return {
    message: "Sync de áreas completado",
    groupsConfigured: groupMap
      .filter((g) => process.env[g.envVar])
      .map((g) => ({ area: g.area, group: process.env[g.envVar] })),
    emailCount: emailToArea.size,
    updated,
    cleared,
  };
}

/* =========================
   CONFIG / CONSTANTES
========================= */

// JWT para Access Token
const JWT_SECRET: Secret = process.env.JWT_SECRET ?? "dev_secret";
const ACCESS_EXPIRES_SEC = Number(
  process.env.JWT_ACCESS_EXPIRES_SECONDS ?? 180 * 60
);

// Refresh Token (cookie)
const REFRESH_DAYS = Number(process.env.REFRESH_DAYS ?? 7);
const REFRESH_REMEMBER_DAYS = Number(
  process.env.REFRESH_REMEMBER_DAYS ?? 60
);

const COOKIE_SECURE = String(process.env.COOKIE_SECURE ?? "false") === "true";
const COOKIE_SAMESITE =
  (process.env.COOKIE_SAMESITE as "lax" | "strict" | "none") ?? "lax";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
const COOKIE_PATH = process.env.COOKIE_PATH ?? "/api/auth";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_ALLOWED_DOMAIN = process.env.GOOGLE_ALLOWED_DOMAIN; // ej: "tuempresa.cl"
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

/* =========================
   HELPERS
========================= */

// Access Token (JWT) – ahora firmando AuthJwtPayload completo
function signAccessToken(
  payload: AuthJwtPayload,
  expiresInSec = ACCESS_EXPIRES_SEC
) {
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

// POST /api/auth/register
export const registerTrabajador = async (req: Request, res: Response) => {
  try {
    const { nombre, email, password } = req.body;

    // Validaciones básicas
    if (!nombre || !email || !password) {
      return res
        .status(400)
        .json({ error: "Todos los campos son obligatorios" });
    }

    // Normalizar email
    const emailNorm = String(email).trim().toLowerCase();

    const existing = await prisma.trabajador.findUnique({
      where: { email: emailNorm },
    });
    if (existing)
      return res.status(409).json({ error: "Trabajador ya existe" });

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
      return res
        .status(400)
        .json({ error: "Google no entregó email o id válidos" });
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

    // 🔄 Sincronizar área interna desde grupos de Google (una sola vez)
    try {
      const resolvedArea = await resolveAreaFromGroupsByEmail(email);
      if (resolvedArea && trabajador.areaInterna !== resolvedArea) {
        trabajador = await prisma.trabajador.update({
          where: { id_trabajador: trabajador.id_trabajador },
          data: { areaInterna: resolvedArea },
        });
        console.log(
          `Área actualizada para ${email}: ${trabajador.areaInterna} -> ${resolvedArea}`
        );
      }
    } catch (e) {
      console.error(
        "Error actualizando areaInterna por grupos en login Google:",
        e
      );
    }

    // 👇 FLAG de supervisor/Admin calculado desde backend
    const isSupervisorOrAdmin = isSupervisorOrAdminForTrabajador({
      email: trabajador.email,
      areaInterna: trabajador.areaInterna ?? undefined,
    });

    const jwtPayload: AuthJwtPayload = {
      id: trabajador.id_trabajador,
      email: trabajador.email,
      nombre: trabajador.nombre,
      isSupervisorOrAdmin,
    };

    const accessToken = signAccessToken(jwtPayload);

    // 🔐 Refresh token
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
        areaInterna: trabajador.areaInterna,
        isSupervisorOrAdmin, // 👈 usable en el front
      },
      accessToken,
      firstLogin, // 👈 primera vez con Google
      hasPassword, // 👈 ya tiene password propia o no
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
      return res
        .status(400)
        .json({ error: "Correo y contraseña son obligatorios" });
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
        areaInterna: true, // 👈 para calcular roles
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

    // 👇 FLAG supervisor/admin igual que en Google login
    const isSupervisorOrAdmin = isSupervisorOrAdminForTrabajador({
      email: user.email,
      areaInterna: user.areaInterna ?? undefined,
    });

    // 1) Access Token (corto) con AuthJwtPayload completo
    const jwtPayload: AuthJwtPayload = {
      id: user.id_trabajador,
      email: user.email,
      nombre: user.nombre,
      isSupervisorOrAdmin,
    };

    const accessToken = signAccessToken(jwtPayload);

    // 2) Refresh Token (cookie httpOnly) + registro en DB
    const rememberFlag = Boolean(remember);
    const days = rememberFlag ? REFRESH_REMEMBER_DAYS : REFRESH_DAYS;

    const rt = generateRT(); // valor que va en cookie
    const rtHash = hashRT(rt); // hash que guardamos en BD

    await prisma.refreshToken.create({
      data: {
        trabajadorId: user.id_trabajador,
        tokenHash: rtHash,
        expiresAt: addDays(days),
      },
    });

    // Cookie httpOnly con el refresh token
    setRefreshCookie(res, rt, days);

    // Devolvemos usuario sin passwordHash pero con areaInterna e isSupervisorOrAdmin
    const { passwordHash, ...safeUser } = user;

    return res.json({
      accessToken,
      trabajador: {
        ...safeUser,
        isSupervisorOrAdmin,
      },
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
      orderBy: [{ freshdeskId: "desc" }, { createdAt: "desc" }],
      include: {
        trabajador: {
          select: { id_trabajador: true, nombre: true, email: true },
        },
      },
    });

    return res.json({ tickets });
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
      return res.status(400).json({
        error: "subject, description y categoria son obligatorios",
      });
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

    if (!isAdmin && !userId) {
      return res.status(400).send("state inválido");
    }

    const { tokens } = await oauth2Client.getToken(String(code));
    console.log("driveCallback tokens:", tokens);

    const refreshToken =
      tokens.refresh_token || (oauth2Client.credentials as any).refresh_token;

    if (!refreshToken) {
      console.warn(
        "No se recibió refresh_token en callback Drive (state=",
        stateStr,
        ")"
      );
      return res.status(400).send("No se recibió refresh_token");
    }

    if (isAdmin) {
      console.log("REFRESH TOKEN ADMIN:", refreshToken);
      // TODO: guardar refreshToken admin en BD
      return res.send(
        "Google Drive ADMIN conectado correctamente. Ya puedes cerrar esta pestaña y volver a la intranet."
      );
    }

    await prisma.trabajador.update({
      where: { id_trabajador: userId! },
      data: { googleRefreshToken: refreshToken },
    });

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

    const drive = getAdminDriveClient();

    let yearString = req.params.year as string | undefined;
    if (!yearString) {
      yearString = new Date().getFullYear().toString();
    }

    let folders = [];
    let baseFolderId: string | null = null;

    try {
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
      console.log("Ruta no encontrada, buscando en compartidos del admin...");

      const sharedRes = await drive.files.list({
        q: `sharedWithMe = true and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id, name, mimeType, modifiedTime)",
        orderBy: "name",
      });

      folders = sharedRes.data.files ?? [];
    }

    return res.json({
      year: yearString,
      baseFolderId,
      folders,
    });
  } catch (err) {
    console.error("listCintax2025Folders error:", err);
    return res.status(500).json({ error: "Error listando carpetas" });
  }
};

export const listFilesInFolder = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const trabajador = await prisma.trabajador.findUnique({
      where: { id_trabajador: userId },
      select: { email: true, areaInterna: true },
    });

    if (!trabajador?.email) {
      return res.status(401).json({ error: "Usuario sin email" });
    }

    const userEmail = trabajador.email.toLowerCase();
    const userDomain = userEmail.split("@")[1] ?? "";
    const userArea = trabajador.areaInterna ?? null;

    const folderId = req.params.id;
    if (!folderId) {
      return res.status(400).json({ error: "Falta folderId" });
    }

    const drive = getAdminDriveClient();

    const GOOGLE_DRIVE_ADMIN_EMAIL =
      process.env.GOOGLE_DRIVE_ADMIN_EMAIL?.toLowerCase();

    const isAdminUser =
      trabajador.areaInterna === Area.ADMIN ||
      (GOOGLE_DRIVE_ADMIN_EMAIL !== undefined &&
        userEmail === GOOGLE_DRIVE_ADMIN_EMAIL);

    const pageSize = Number(req.query.pageSize ?? 10);
    const pageToken =
      (req.query.pageToken as string | undefined) || undefined;

    const resp = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields:
        "nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink, iconLink)",
      orderBy: "name",
      pageSize,
      pageToken,
    });

    const allFiles = resp.data.files ?? [];
    const apiNextToken = resp.data.nextPageToken ?? null;

    if (isAdminUser) {
      return res.json({
        files: allFiles,
        nextPageToken: apiNextToken,
      });
    }

    const groupEnvVar = userArea ? AREA_TO_GROUP_ENV[userArea] : undefined;
    const groupForUser = groupEnvVar
      ? process.env[groupEnvVar]?.toLowerCase() ?? null
      : null;

    const visibles: typeof allFiles = [];

    for (const file of allFiles) {
      if (!file.id) continue;

      try {
        const permResp = await drive.permissions.list({
          fileId: file.id,
          fields: "permissions(emailAddress,type,domain,role)",
        });

        const perms = permResp.data.permissions ?? [];

        const hasAccess = perms.some((p) => {
          const pEmail = p.emailAddress?.toLowerCase();

          if (p.type === "user" && pEmail === userEmail) {
            return true;
          }

          if (p.type === "group" && groupForUser && pEmail === groupForUser) {
            return true;
          }

          // Opcional: compartido a dominio
          // if (p.type === "domain" && p.domain?.toLowerCase() === userDomain) {
          //   return true;
          // }

          return false;
        });

        if (hasAccess) {
          visibles.push(file);
        }
      } catch (permErr) {
        console.error(
          "Error leyendo permisos de archivo",
          file.id,
          permErr
        );
      }
    }

    return res.json({
      files: visibles,
      nextPageToken: visibles.length > 0 ? apiNextToken : null,
    });
  } catch (err) {
    console.error("listFilesInFolder error:", err);
    return res.status(500).json({ error: "Error listando archivos" });
  }
};

export const uploadToFolder = async (req: Request, res: Response) => {
  try {
    const folderId = req.params.id;
    if (!folderId) {
      return res.status(400).json({ error: "Falta folderId" });
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: "No se recibió archivo" });
    }

    const drive = getAdminDriveClient();

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
      fields:
        "id, name, mimeType, webViewLink, iconLink, modifiedTime, size",
    });

    return res.status(201).json({ file: resp.data });
  } catch (err) {
    console.error("uploadToFolder error:", err);
    return res
      .status(500)
      .json({ error: "Error subiendo archivo a Drive" });
  }
};

type DriveFile = drive_v3.Schema$File;
type DriveFileList = drive_v3.Schema$FileList;
type DrivePermission = drive_v3.Schema$Permission;

type VisibleFolder = {
  id: string;
  name: string;
  categoria: string;
  modifiedTime?: string | null;
  pathNames: string[];
  pathString: string;
};

const GOOGLE_DRIVE_ADMIN_EMAIL =
  process.env.GOOGLE_DRIVE_ADMIN_EMAIL?.toLowerCase();

export const listMySharedFolders = async (req: Request, res: Response) => {
  try {
    const userEmail = req.user?.email?.toLowerCase();
    if (!userEmail) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const drive = getAdminDriveClient();

    let yearString = req.params.year as string | undefined;
    if (!yearString) {
      yearString = new Date().getFullYear().toString();
    }

    const basePath = ["CINTAX", yearString];
    const yearFolderId = await resolveFolderPath(drive, basePath);

    const categoriasRes = await drive.files.list({
      q: `'${yearFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name, mimeType, modifiedTime)",
      orderBy: "name",
    });

    const categorias = categoriasRes.data.files ?? [];

    const trabajador = await prisma.trabajador.findUnique({
      where: { id_trabajador: req.user!.id },
      select: { email: true, areaInterna: true },
    });

    const visibleFolders: VisibleFolder[] = [];

    const isAdminUser =
      trabajador?.areaInterna === Area.ADMIN ||
      (GOOGLE_DRIVE_ADMIN_EMAIL !== undefined &&
        userEmail === GOOGLE_DRIVE_ADMIN_EMAIL);

    if (isAdminUser) {
      for (const categoria of categorias) {
        if (!categoria.id) continue;
        const catPathNames = ["CINTAX", yearString, categoria.name ?? ""];
        const catPathString = catPathNames.join(" / ");

        visibleFolders.push({
          id: categoria.id,
          name: categoria.name ?? "",
          categoria: categoria.name ?? "",
          modifiedTime: categoria.modifiedTime ?? null,
          pathNames: catPathNames,
          pathString: catPathString,
        });
      }

      return res.json({
        year: yearString,
        basePath,
        folders: visibleFolders,
      });
    }

    if (!trabajador?.areaInterna) {
      return res.json({
        year: yearString,
        basePath,
        folders: [],
      });
    }

    const expectedName = trabajador.areaInterna.toString().toUpperCase();

    const groupEnvVar = AREA_TO_GROUP_ENV[trabajador.areaInterna];
    const groupForUser = groupEnvVar
      ? process.env[groupEnvVar]?.toLowerCase() ?? null
      : null;

    for (const categoria of categorias) {
      if (!categoria.id) continue;

      const categoriaName = (categoria.name ?? "").toUpperCase();
      if (categoriaName !== expectedName) continue;

      const catPathNames = ["CINTAX", yearString, categoria.name ?? ""];
      const catPathString = catPathNames.join(" / ");

      const subRes = await drive.files.list({
        q: `'${categoria.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id, name, mimeType, modifiedTime)",
        orderBy: "name",
      });

      const subFolders = subRes.data.files ?? [];
      let userHasSomething = false;

      for (const folder of subFolders) {
        if (!folder.id) continue;

        try {
          const permResp = await drive.permissions.list({
            fileId: folder.id,
            fields: "permissions(emailAddress,type,domain,role)",
          });

          const perms = permResp.data.permissions ?? [];

          const hasAccess = perms.some((p) => {
            const pEmail = p.emailAddress?.toLowerCase();

            if (p.type === "user" && pEmail === userEmail) return true;

            if (p.type === "group" && groupForUser && pEmail === groupForUser) {
              return true;
            }

            return false;
          });

          if (hasAccess) {
            userHasSomething = true;
            break;
          }
        } catch (permErr) {
          console.error(
            "Error leyendo permisos de carpeta",
            folder.id,
            permErr
          );
        }
      }

      if (!userHasSomething) {
        continue;
      }

      visibleFolders.push({
        id: categoria.id,
        name: categoria.name ?? "",
        categoria: categoria.name ?? "",
        modifiedTime: categoria.modifiedTime ?? null,
        pathNames: catPathNames,
        pathString: catPathString,
      });
    }

    return res.json({
      year: yearString,
      basePath,
      folders: visibleFolders,
    });
  } catch (err) {
    console.error("listMySharedFolders error:", err);
    return res
      .status(500)
      .json({ error: "Error listando carpetas compartidas" });
  }
};

export const listMyRutFolders = async (req: Request, res: Response) => {
  try {
    const userEmail = req.user?.email?.toLowerCase();
    if (!userEmail) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const drive = getAdminDriveClient();

    let yearString = req.params.year as string | undefined;
    if (!yearString) {
      yearString = new Date().getFullYear().toString();
    }

    const basePath = ["CINTAX", yearString];
    const yearFolderId = await resolveFolderPath(drive, basePath);

    const categoriasRes = await drive.files.list({
      q: `'${yearFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name, mimeType, modifiedTime)",
      orderBy: "name",
    });

    const categorias = categoriasRes.data.files ?? [];

    const trabajador = await prisma.trabajador.findUnique({
      where: { id_trabajador: req.user!.id },
      select: { email: true, areaInterna: true },
    });

    const visibleRutFolders: {
      id: string;
      name: string;
      categoria: string | null;
      modifiedTime?: string | null;
      pathNames: string[];
      pathString: string;
    }[] = [];

    const isAdminUser =
      trabajador?.areaInterna === Area.ADMIN ||
      (GOOGLE_DRIVE_ADMIN_EMAIL !== undefined &&
        userEmail === GOOGLE_DRIVE_ADMIN_EMAIL?.toLowerCase());

    const isMultiAreaUser = MULTI_AREA_USERS.includes(userEmail);

    const shouldStartAtCategorias = isAdminUser || isMultiAreaUser;

    if (shouldStartAtCategorias) {
      for (const categoria of categorias) {
        if (!categoria.id) continue;

        const categoriaName = categoria.name ?? "";
        const pathNames = ["CINTAX", yearString, categoriaName];

        visibleRutFolders.push({
          id: categoria.id,
          name: categoriaName,
          categoria: null,
          modifiedTime: categoria.modifiedTime ?? null,
          pathNames,
          pathString: pathNames.join(" / "),
        });
      }

      return res.json({
        year: yearString,
        basePath,
        startLevel: "categorias" as const,
        folders: visibleRutFolders,
      });
    }

    const groupEnvVar = trabajador?.areaInterna
      ? AREA_TO_GROUP_ENV[trabajador.areaInterna]
      : undefined;

    const groupForUser = groupEnvVar
      ? process.env[groupEnvVar]?.toLowerCase() ?? null
      : null;

    for (const categoria of categorias) {
      if (!categoria.id) continue;

      const categoriaName = categoria.name ?? "";
      const catPathNames = ["CINTAX", yearString, categoriaName];

      const subRes = await drive.files.list({
        q: `'${categoria.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id, name, mimeType, modifiedTime)",
        orderBy: "name",
      });

      const subFolders = subRes.data.files ?? [];

      for (const folder of subFolders) {
        if (!folder.id) continue;

        if (isAdminUser && !isMultiAreaUser) {
          const pathNames = [...catPathNames, folder.name ?? ""];
          visibleRutFolders.push({
            id: folder.id,
            name: folder.name ?? "",
            categoria: categoriaName,
            modifiedTime: folder.modifiedTime ?? null,
            pathNames,
            pathString: pathNames.join(" / "),
          });
          continue;
        }

        try {
          const permResp = await drive.permissions.list({
            fileId: folder.id,
            fields: "permissions(emailAddress,type,domain,role)",
          });

          const perms = permResp.data.permissions ?? [];

          const hasAccess = perms.some((p) => {
            const pEmail = p.emailAddress?.toLowerCase();

            if (p.type === "user" && pEmail === userEmail) return true;

            if (p.type === "group" && groupForUser && pEmail === groupForUser) {
              return true;
            }

            return false;
          });

          if (hasAccess) {
            const pathNames = [...catPathNames, folder.name ?? ""];
            visibleRutFolders.push({
              id: folder.id,
              name: folder.name ?? "",
              categoria: categoriaName,
              modifiedTime: folder.modifiedTime ?? null,
              pathNames,
              pathString: pathNames.join(" / "),
            });
          }
        } catch (permErr) {
          console.error(
            "Error leyendo permisos de carpeta RUT",
            folder.id,
            permErr
          );
        }
      }
    }

    return res.json({
      year: yearString,
      basePath,
      startLevel: "rut" as const,
      folders: visibleRutFolders,
    });
  } catch (err) {
    console.error("listMyRutFolders error:", err);
    return res
      .status(500)
      .json({ error: "Error listando carpetas de RUT" });
  }
};

export const syncAreasFromGroups = async (req: Request, res: Response) => {
  try {
    const { clearOthers } = req.body as { clearOthers?: boolean };
    const result = await syncAreasFromGroupsCore(!!clearOthers);
    return res.json(result);
  } catch (err) {
    console.error("syncAreasFromGroups error:", err);
    return res
      .status(500)
      .json({ error: "Error sincronizando áreas desde grupos" });
  }
};

// 👇 exportamos la función core para usarla en el cron
export { syncAreasFromGroupsCore };

/* =========================
   TAREAS AUTOMÁTICAS
========================= */

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function startOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay() || 7; // domingo=0 → 7
  d.setHours(0, 0, 0, 0);
  if (day > 1) d.setDate(d.getDate() - (day - 1));
  return d;
}

function startOfNextWeek(date: Date): Date {
  const start = startOfWeek(date);
  start.setDate(start.getDate() + 7);
  return start;
}

function getNextDueDate(
  tpl: {
    frecuencia: FrecuenciaTarea;
    diaMesVencimiento: number | null;
    diaSemanaVencimiento: number | null;
  },
  today: Date
): Date | null {
  if (tpl.frecuencia === FrecuenciaTarea.MENSUAL && tpl.diaMesVencimiento) {
    const day = tpl.diaMesVencimiento;
    const thisMonthDue = new Date(
      today.getFullYear(),
      today.getMonth(),
      day,
      9,
      0,
      0,
      0
    );

    if (thisMonthDue >= today) {
      return thisMonthDue;
    }
    return new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      day,
      9,
      0,
      0,
      0
    );
  }

  if (tpl.frecuencia === FrecuenciaTarea.SEMANAL && tpl.diaSemanaVencimiento) {
    const targetDow = tpl.diaSemanaVencimiento;
    const base = new Date(today);
    base.setHours(9, 0, 0, 0);

    const todayDow = base.getDay() || 7;

    const diff = targetDow - todayDow;
    if (diff >= 0) {
      base.setDate(base.getDate() + diff);
      return base;
    } else {
      base.setDate(base.getDate() + 7 + diff);
      return base;
    }
  }

  if (tpl.frecuencia === FrecuenciaTarea.UNICA) {
    return null;
  }

  return null;
}

export async function generarTareasAutomaticas(
  fechaReferencia: Date = new Date()
) {
  const plantillas = await prisma.tareaPlantilla.findMany({
    where: { activo: true },
    select: {
      id_tarea_plantilla: true,
      area: true,
      frecuencia: true,
      diaMesVencimiento: true,
      diaSemanaVencimiento: true,
      responsableDefaultId: true,
      nombre: true,
    },
  });

  const workersByArea: Record<Area, { id_trabajador: number }[]> = {
    [Area.ADMIN]: [],
    [Area.CONTA]: [],
    [Area.RRHH]: [],
    [Area.TRIBUTARIO]: [],
  };

  const allWorkers = await prisma.trabajador.findMany({
    where: { status: true, areaInterna: { not: null } },
    select: { id_trabajador: true, areaInterna: true },
  });

  for (const w of allWorkers) {
    if (!w.areaInterna) continue;
    workersByArea[w.areaInterna].push({ id_trabajador: w.id_trabajador });
  }

  const areaIndex: Partial<Record<Area, number>> = {
    [Area.ADMIN]: 0,
    [Area.CONTA]: 0,
    [Area.RRHH]: 0,
    [Area.TRIBUTARIO]: 0,
  };

  for (const tpl of plantillas) {
    const dueDate = getNextDueDate(
      {
        frecuencia: tpl.frecuencia,
        diaMesVencimiento: tpl.diaMesVencimiento,
        diaSemanaVencimiento: tpl.diaSemanaVencimiento,
      },
      fechaReferencia
    );
    if (!dueDate) continue;

    let startPeriod: Date;
    let endPeriod: Date;

    if (tpl.frecuencia === FrecuenciaTarea.MENSUAL) {
      startPeriod = startOfMonth(dueDate);
      endPeriod = startOfNextMonth(dueDate);
    } else if (tpl.frecuencia === FrecuenciaTarea.SEMANAL) {
      startPeriod = startOfWeek(dueDate);
      endPeriod = startOfNextWeek(dueDate);
    } else {
      startPeriod = new Date(2000, 0, 1);
      endPeriod = new Date(2100, 0, 1);
    }

    const yaExiste = await prisma.tareaAsignada.findFirst({
      where: {
        tareaPlantillaId: tpl.id_tarea_plantilla,
        fechaProgramada: {
          gte: startPeriod,
          lt: endPeriod,
        },
      },
    });

    if (yaExiste) continue;

    let trabajadorId: number | null = null;

    if (tpl.responsableDefaultId) {
      trabajadorId = tpl.responsableDefaultId;
    } else if (tpl.area && workersByArea[tpl.area]?.length) {
      const arr = workersByArea[tpl.area];
      const idx = areaIndex[tpl.area] ?? 0;
      trabajadorId = arr[idx % arr.length].id_trabajador;
      areaIndex[tpl.area] = idx + 1;
    }

    await prisma.tareaAsignada.create({
      data: {
        tareaPlantillaId: tpl.id_tarea_plantilla,
        fechaProgramada: dueDate,
        trabajadorId,
        estado: EstadoTarea.PENDIENTE,
      },
    });

    console.log(
      `Creada tarea para plantilla ${
        tpl.nombre
      } (${tpl.id_tarea_plantilla}) con fecha ${dueDate
        .toISOString()
        .slice(0, 10)} asignada a ${
        trabajadorId ? `trabajador ${trabajadorId}` : "SIN asignar"
      }`
    );
  }
}

// GET /api/tareas-asignadas
export const listTareasAsignadas = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as number | undefined;
    if (!userId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const { soloPendientes, todos } = req.query as {
      soloPendientes?: string;
      todos?: string;
    };

    const onlyPending = soloPendientes === "true";

    const trabajadorActual = await prisma.trabajador.findUnique({
      where: { id_trabajador: userId },
      select: { email: true, areaInterna: true },
    });

    const appSuperAdminEmail =
      process.env.APP_SUPERADMIN_EMAIL?.toLowerCase() ?? "";

    const isAppAdmin =
      trabajadorActual?.areaInterna === Area.ADMIN ||
      trabajadorActual?.email.toLowerCase() === appSuperAdminEmail;

    const verTodos = todos === "true" && isAppAdmin;

    const whereTarea: Prisma.TareaAsignadaWhereInput = {};

    if (!verTodos) {
      whereTarea.trabajadorId = userId;
    }

    if (onlyPending) {
      whereTarea.estado = {
        in: [EstadoTarea.PENDIENTE, EstadoTarea.EN_PROCESO],
      };
    }

    const tareas = await prisma.tareaAsignada.findMany({
      where: whereTarea,
      include: {
        tareaPlantilla: true,
        asignado: {
          select: {
            id_trabajador: true,
            nombre: true,
            email: true,
          },
        },
      },
      orderBy: {
        fechaProgramada: "asc",
      },
    });

    type WorkerBucket = {
      id_trabajador: number;
      nombre: string;
      email: string;
      tareas: {
        id: string;
        nombre: string;
        vencimiento: string;
        estado: FrontTareaEstado;
        comentario?: string;
      }[];
    };

    const byWorker = new Map<number, WorkerBucket>();

    for (const ta of tareas) {
      if (!ta.asignado) continue;

      const wId = ta.asignado.id_trabajador;
      if (!byWorker.has(wId)) {
        byWorker.set(wId, {
          id_trabajador: wId,
          nombre: ta.asignado.nombre,
          email: ta.asignado.email,
          tareas: [],
        });
      }

      const bucket = byWorker.get(wId)!;

      const estadoFront = mapEstadoFront(ta.estado, ta.fechaProgramada);

      bucket.tareas.push({
        id: String(ta.id_tarea_asignada),
        nombre: ta.tareaPlantilla?.nombre ?? "Tarea sin nombre",
        vencimiento: ta.fechaProgramada.toISOString(),
        estado: estadoFront,
        comentario: ta.comentarios ?? undefined,
      });
    }

    const analistas = Array.from(byWorker.values()).map((w) => {
      const total = w.tareas.length;
      const completadas = w.tareas.filter(
        (t) => t.estado === "completado"
      ).length;
      const progreso = total > 0 ? Math.round((completadas / total) * 100) : 0;

      return {
        id: `a-${w.id_trabajador}`,
        nombre: w.nombre,
        email: w.email,
        avatar: w.nombre.charAt(0).toUpperCase(),
        clientes: [
          {
            id: `c-${w.id_trabajador}-pendientes`,
            nombre: "Tareas pendientes",
            rut: "",
            email: w.email,
            progreso,
            tareas: w.tareas,
          },
        ],
        cargaTotal: total,
        completadas,
      };
    });

    return res.json({ analistas });
  } catch (err) {
    console.error("listTareasAsignadas error:", err);
    return res.status(500).json({ error: "Error interno listando tareas" });
  }
};

