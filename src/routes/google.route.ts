import { Router } from "express";
import multer from "multer";
import {
  authGuard,
  requireSupervisorOrAdmin,
} from "../middlewares/auth.middleware";
import {
  connectDrive,
  driveCallback,
  listCintax2025Folders,
  listFilesInFolder,
  listMySharedFolders,
  listMyRutFolders,
  syncAreasFromGroups,
  uploadToFolder,
} from "../controllers/auth.controller";

const r = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// OAuth Google Drive
r.get("/connect", authGuard, connectDrive);
r.get("/callback", driveCallback);

// 🔹 AHORA /cintax/:year usa listMyRutFolders (el que considera permisos por RUT)
r.get("/cintax/:year", authGuard, listMyRutFolders);

// (opcional) ruta extra si quieres ver solo categorías por área
r.get("/shared/:year", authGuard, listMySharedFolders);

// Archivos dentro de una carpeta + upload
r.get("/folder/:id/files", authGuard, listFilesInFolder);
r.post(
  "/folder/:id/upload",
  authGuard,
  upload.single("file"),
  uploadToFolder
);

// Sync de áreas según grupos de Google
//
// Solo supervisor o admin. Antes bastaba con estar autenticado, y el handler
// acepta `clearOthers` del body: con `{"clearOthers": true}` hace un
// `updateMany` que pone `areaInterna = null` a todo trabajador que no este en
// los grupos. De `areaInterna` sale el rol (`roleFromArea`), asi que un
// usuario cualquiera podia dejar sin rol a toda la empresa, admins incluidos.
//
// El cron no pasa por aqui: llama a `syncAreasFromGroupsCore` directamente
// (`app.ts`), asi que este guard no lo afecta.
r.post(
  "/trabajadores/sync-areas",
  authGuard,
  requireSupervisorOrAdmin,
  syncAreasFromGroups
);

export default r;
