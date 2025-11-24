"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listMySharedFolders = exports.uploadToFolder = exports.listFilesInFolder = exports.listCintax2025Folders = exports.driveCallback = exports.connectDrive = exports.syncTickets = exports.createTicket = exports.listTickets = exports.logoutTrabajador = exports.loginTrabajador = exports.googleLoginTrabajador = exports.registerTrabajador = void 0;
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const stream_1 = require("stream");
require("dotenv/config");
const google_auth_library_1 = require("google-auth-library");
const freshdeskService_1 = require("../services/freshdeskService");
const googleDrive_1 = require("../services/googleDrive");
const googleDrivePath_1 = require("../services/googleDrivePath");
const prisma = new client_1.PrismaClient();
/* =========================
   CONFIG / CONSTANTES
========================= */
// JWT para Access Token
const JWT_SECRET = process.env.JWT_SECRET ?? "dev_secret";
const ACCESS_EXPIRES_SEC = Number(process.env.JWT_ACCESS_EXPIRES_SECONDS ?? 180 * 60);
// Refresh Token (cookie)
const REFRESH_DAYS = Number(process.env.REFRESH_DAYS ?? 7);
const REFRESH_REMEMBER_DAYS = Number(process.env.REFRESH_REMEMBER_DAYS ?? 60);
const COOKIE_SECURE = String(process.env.COOKIE_SECURE ?? "false") === "true";
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE ?? "lax";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;
const COOKIE_PATH = process.env.COOKIE_PATH ?? "/api/auth";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_ALLOWED_DOMAIN = process.env.GOOGLE_ALLOWED_DOMAIN; // ej: "tuempresa.cl"
const googleClient = new google_auth_library_1.OAuth2Client(GOOGLE_CLIENT_ID);
/* =========================
   HELPERS
========================= */
// Access Token (JWT)
function signAccessToken(payload, expiresInSec = ACCESS_EXPIRES_SEC) {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: expiresInSec });
}
// Refresh Token aleatorio + hash SHA-256 (se guarda sólo el hash)
function generateRT() {
    return crypto_1.default.randomBytes(64).toString("base64url");
}
function hashRT(rt) {
    return crypto_1.default.createHash("sha256").update(rt).digest("hex");
}
function addDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
}
function parseRemember(v) {
    if (typeof v === "boolean")
        return v;
    if (typeof v === "string")
        return v.toLowerCase() === "true";
    return false;
}
function setRefreshCookie(res, rt, days) {
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
function clearRefreshCookie(res) {
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
const registerTrabajador = async (req, res) => {
    try {
        const { nombre, email, password } = req.body;
        // Validaciones básicas
        if (!nombre || !email || !password) {
            return res.status(400).json({ error: "Todos los campos son obligatorios" });
        }
        // Normalizar email
        const emailNorm = String(email).trim().toLowerCase();
        const existing = await prisma.trabajador.findUnique({ where: { email: emailNorm } });
        if (existing)
            return res.status(409).json({ error: "Trabajador ya existe" });
        // Hash de contraseña con bcrypt
        const passwordHash = await bcrypt_1.default.hash(password, 10);
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
    }
    catch (error) {
        console.error("Register error", error);
        return res.status(500).json({ error: "Error interno" });
    }
};
exports.registerTrabajador = registerTrabajador;
/* =========================
   GOOGLE LOGIN PARA TRABAJADORES
========================= */
// POST /api/auth/google
const googleLoginTrabajador = async (req, res) => {
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
        }
        else if (!trabajador.googleId) {
            // Ya existía por registro normal, ahora vincula Google
            trabajador = await prisma.trabajador.update({
                where: { email },
                data: { googleId },
            });
        }
        if (!trabajador.status) {
            return res.status(403).json({ error: "Trabajador inactivo" });
        }
        const jwtPayload = {
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
            firstLogin, // 👈 primera vez con Google
            hasPassword, // 👈 ya tiene password propia o no
        });
    }
    catch (error) {
        console.error("Google login error", error);
        return res.status(500).json({ error: "Error interno" });
    }
};
exports.googleLoginTrabajador = googleLoginTrabajador;
// POST /api/auth/login
const loginTrabajador = async (req, res) => {
    try {
        const { email, password, remember } = req.body;
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
            await bcrypt_1.default.compare(password, "$2b$10$invalidinvalidinvalidinvalidinv12345678901234567890");
            return res.status(401).json({ error: "Credenciales inválidas" });
        }
        const ok = await bcrypt_1.default.compare(password, user.passwordHash);
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
        // Devolvemos usuario sin passwordHash
        const { passwordHash, ...safeUser } = user;
        return res.json({
            accessToken,
            trabajador: safeUser,
            remember: rememberFlag,
        });
    }
    catch (err) {
        console.error("login error:", err);
        return res.status(500).json({ error: "Error interno" });
    }
};
exports.loginTrabajador = loginTrabajador;
// POST /api/auth/logout
const logoutTrabajador = async (req, res) => {
    try {
        // Cookie "rt" viene gracias a cookie-parser
        const rt = req.cookies?.rt;
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
    }
    catch (error) {
        console.error("Logout error:", error);
        return res.status(500).json({ error: "Error interno" });
    }
};
exports.logoutTrabajador = logoutTrabajador;
const listTickets = async (req, res) => {
    try {
        const { categoria, estado } = req.query;
        const where = {};
        if (categoria && categoria !== "todos")
            where.categoria = categoria;
        if (estado && estado !== "todos")
            where.estado = estado;
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
        return res.json({ tickets });
    }
    catch (err) {
        console.error("listTickets error:", err);
        return res.status(500).json({ error: "Error interno" });
    }
};
exports.listTickets = listTickets;
/**
 * POST /api/tickets
 * body: { subject, description, categoria, prioridad? }
 */
const createTicket = async (req, res) => {
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
    }
    catch (err) {
        console.error("createTicket error:", err);
        return res.status(500).json({ error: "Error interno" });
    }
};
exports.createTicket = createTicket;
const syncTickets = async (req, res) => {
    try {
        const count = await (0, freshdeskService_1.syncTicketsFromFreshdesk)(); // sin maxPages
        res.json({
            message: "Sincronización completada",
            processed: count,
        });
    }
    catch (err) {
        console.error("Error syncTickets:", err);
        res.status(500).json({ error: "Error sincronizando con Freshdesk" });
    }
};
exports.syncTickets = syncTickets;
/*
==================================

        GOOGLE DRIVE

==================================

*/
const connectDrive = (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: "No autenticado" });
    // 👇 ahora pasamos el id del trabajador
    const url = (0, googleDrive_1.generateDriveAuthUrl)(req.user.id);
    return res.json({ url });
};
exports.connectDrive = connectDrive;
const driveCallback = async (req, res) => {
    try {
        // ===== DEBUG: logueamos qué está llegando realmente =====
        console.log("driveCallback query:", req.query);
        const rawCode = req.query.code;
        const rawState = req.query.state;
        const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
        let stateStr = Array.isArray(rawState) ? rawState[0] : rawState;
        if (!code)
            return res.status(400).send("Falta code");
        if (!stateStr)
            return res.status(400).send("Falta state");
        stateStr = String(stateStr).trim();
        console.log("driveCallback parsed stateStr:", stateStr);
        const isAdmin = stateStr === "admin";
        const userId = !isAdmin && /^\d+$/.test(stateStr) ? Number(stateStr) : null;
        // Si no es admin y tampoco es un número válido => error
        if (!isAdmin && !userId) {
            return res.status(400).send("state inválido");
        }
        const { tokens } = await googleDrive_1.oauth2Client.getToken(String(code));
        console.log("driveCallback tokens:", tokens);
        // Puede venir como tokens.refresh_token o dentro de credentials
        const refreshToken = tokens.refresh_token || googleDrive_1.oauth2Client.credentials.refresh_token;
        if (!refreshToken) {
            console.warn("No se recibió refresh_token en callback Drive (state=", stateStr, ")");
            return res.status(400).send("No se recibió refresh_token");
        }
        if (isAdmin) {
            // Aquí deberías guardarlo en alguna tabla Config / Settings
            console.log("REFRESH TOKEN ADMIN:", refreshToken);
            // TODO: guarda refreshToken en BD en vez de solo log
            return res.send("Google Drive ADMIN conectado correctamente. Ya puedes cerrar esta pestaña y volver a la intranet.");
        }
        // ---- MODO USUARIO (lo que ya tenías) ----
        await prisma.trabajador.update({
            where: { id_trabajador: userId },
            data: { googleRefreshToken: refreshToken },
        });
        // Redirige al front
        return res.redirect("https://intranet-cintax.netlify.app/drive?connected=1");
    }
    catch (err) {
        console.error("driveCallback error", err);
        return res.status(500).send("Error conectando Google Drive");
    }
};
exports.driveCallback = driveCallback;
// src/controllers/auth.controller.ts
const listCintax2025Folders = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: "No autenticado" });
        // 🔹 Usar SIEMPRE el Drive del admin para navegar CINTAX / año
        const drive = (0, googleDrive_1.getAdminDriveClient)();
        let yearString = req.params.year;
        if (!yearString) {
            yearString = new Date().getFullYear().toString();
        }
        let folders = [];
        let baseFolderId = null;
        try {
            const basePath = ["CINTAX", yearString];
            const yearFolderId = await (0, googleDrivePath_1.resolveFolderPath)(drive, basePath);
            baseFolderId = yearFolderId;
            const foldersRes = await drive.files.list({
                q: `'${yearFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: "files(id, name, mimeType, modifiedTime)",
                orderBy: "name",
            });
            folders = foldersRes.data.files ?? [];
        }
        catch (pathError) {
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
    }
    catch (err) {
        console.error("listCintax2025Folders error:", err);
        return res.status(500).json({ error: "Error listando carpetas" });
    }
};
exports.listCintax2025Folders = listCintax2025Folders;
const listFilesInFolder = async (req, res) => {
    try {
        const userEmail = req.user?.email?.toLowerCase();
        if (!userEmail) {
            return res.status(401).json({ error: "No autenticado" });
        }
        console.log("[Drive] listFilesInFolder userEmail:", userEmail, "ADMIN_ENV:", GOOGLE_DRIVE_ADMIN_EMAIL, "isAdminUser:", GOOGLE_DRIVE_ADMIN_EMAIL !== undefined &&
            userEmail === GOOGLE_DRIVE_ADMIN_EMAIL);
        const folderId = req.params.id;
        if (!folderId) {
            return res.status(400).json({ error: "Falta folderId" });
        }
        const drive = (0, googleDrive_1.getAdminDriveClient)();
        const isAdminUser = GOOGLE_DRIVE_ADMIN_EMAIL !== undefined &&
            userEmail === GOOGLE_DRIVE_ADMIN_EMAIL;
        // 1) Listar TODO el contenido de la carpeta como ADMIN
        const resp = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: "files(id, name, mimeType, modifiedTime, size, webViewLink, iconLink)",
            orderBy: "name",
        });
        const allFiles = resp.data.files ?? [];
        // ⚡️ Admin ve todo directamente
        if (isAdminUser) {
            return res.json({ files: allFiles });
        }
        // 2) Usuario normal: filtrar solo los que el usuario puede ver
        const visibles = [];
        for (const file of allFiles) {
            if (!file.id)
                continue;
            try {
                const permResp = await drive.permissions.list({
                    fileId: file.id,
                    fields: "permissions(emailAddress,type,domain,role)",
                });
                const perms = permResp.data.permissions ?? [];
                const hasAccess = perms.some((p) => {
                    if ((p.type === "user" || p.type === "group") &&
                        p.emailAddress?.toLowerCase() === userEmail) {
                        return true;
                    }
                    return false;
                });
                if (hasAccess) {
                    visibles.push(file);
                }
            }
            catch (permErr) {
                console.error("Error leyendo permisos de archivo", file.id, permErr);
            }
        }
        // 3) Si no hay archivos visibles, devolvemos lista vacía (no 403)
        return res.json({ files: visibles });
    }
    catch (err) {
        console.error("listFilesInFolder error:", err);
        return res.status(500).json({ error: "Error listando archivos" });
    }
};
exports.listFilesInFolder = listFilesInFolder;
const uploadToFolder = async (req, res) => {
    try {
        const folderId = req.params.id;
        if (!folderId) {
            return res.status(400).json({ error: "Falta folderId" });
        }
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: "No se recibió archivo" });
        }
        // ✅ también usamos la cuenta ADMIN
        const drive = (0, googleDrive_1.getAdminDriveClient)();
        const stream = stream_1.Readable.from(file.buffer);
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
    }
    catch (err) {
        console.error("uploadToFolder error:", err);
        return res.status(500).json({ error: "Error subiendo archivo a Drive" });
    }
};
exports.uploadToFolder = uploadToFolder;
const GOOGLE_DRIVE_ADMIN_EMAIL = process.env.GOOGLE_DRIVE_ADMIN_EMAIL?.toLowerCase();
const listMySharedFolders = async (req, res) => {
    try {
        const userEmail = req.user?.email?.toLowerCase();
        if (!userEmail) {
            return res.status(401).json({ error: "No autenticado" });
        }
        const drive = (0, googleDrive_1.getAdminDriveClient)();
        const isAdminUser = GOOGLE_DRIVE_ADMIN_EMAIL !== undefined &&
            userEmail === GOOGLE_DRIVE_ADMIN_EMAIL;
        // Año por URL o año actual
        let yearString = req.params.year;
        if (!yearString) {
            yearString = new Date().getFullYear().toString();
        }
        // 1) Resolver ruta base: CINTAX / año
        const basePath = ["CINTAX", yearString];
        const yearFolderId = await (0, googleDrivePath_1.resolveFolderPath)(drive, basePath);
        // 2) Listar CATEGORÍAS dentro de ese año (CONTA, RRHH, TRIB, etc.)
        const categoriasRes = await drive.files.list({
            q: `'${yearFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: "files(id, name, mimeType, modifiedTime)",
            orderBy: "name",
        });
        const categoriasData = categoriasRes.data;
        const categorias = categoriasData.files ?? [];
        const visibleFolders = [];
        // 3) Para cada categoría decidimos si el usuario la ve o no
        for (const categoria of categorias) {
            if (!categoria.id)
                continue;
            const categoriaName = categoria.name ?? "";
            const catPathNames = ["CINTAX", yearString, categoriaName];
            const catPathString = catPathNames.join(" / ");
            // ⚡ ADMIN: ve TODAS las categorías sin revisar permisos
            if (isAdminUser) {
                visibleFolders.push({
                    id: categoria.id,
                    name: categoriaName,
                    categoria: categoriaName,
                    modifiedTime: categoria.modifiedTime ?? null,
                    pathNames: catPathNames,
                    pathString: catPathString,
                });
                continue;
            }
            // ⚠ USUARIO NORMAL:
            // Solo mostramos la categoría si tiene al menos UNA subcarpeta
            // compartida con él (A01, PERFOROCK, etc.)
            const subRes = await drive.files.list({
                q: `'${categoria.id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
                fields: "files(id, name, mimeType, modifiedTime)",
                orderBy: "name",
            });
            const subData = subRes.data;
            const subFolders = subData.files ?? [];
            let userHasSomething = false;
            for (const folder of subFolders) {
                if (!folder.id)
                    continue;
                try {
                    const permResp = await drive.permissions.list({
                        fileId: folder.id,
                        fields: "permissions(emailAddress,type,domain,role)",
                    });
                    const permData = permResp.data;
                    const perms = permData.permissions ?? [];
                    const hasAccess = perms.some((p) => {
                        return ((p.type === "user" || p.type === "group") &&
                            p.emailAddress?.toLowerCase() === userEmail);
                    });
                    if (hasAccess) {
                        userHasSomething = true;
                        break; // ya sabemos que esta categoría le sirve
                    }
                }
                catch (permErr) {
                    console.error("Error leyendo permisos de carpeta", folder.id, permErr);
                }
            }
            // Si el usuario tiene al menos una subcarpeta dentro, mostramos la CATEGORÍA
            if (userHasSomething) {
                visibleFolders.push({
                    id: categoria.id,
                    name: categoriaName,
                    categoria: categoriaName,
                    modifiedTime: categoria.modifiedTime ?? null,
                    pathNames: catPathNames,
                    pathString: catPathString,
                });
            }
        }
        return res.json({
            year: yearString,
            basePath,
            folders: visibleFolders, // ← ahora son CONTA, RRHH, TRIB, ...
        });
    }
    catch (err) {
        console.error("listMySharedFolders error:", err);
        return res
            .status(500)
            .json({ error: "Error listando carpetas compartidas" });
    }
};
exports.listMySharedFolders = listMySharedFolders;
