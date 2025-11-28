import { Router } from "express";
import multer from "multer";
import { authGuard } from "../middlewares/auth.middleware";
import {
  connectDrive,
  driveCallback,
  listCintax2025Folders,
  listFilesInFolder,
  listMySharedFolders,
  listMyRutFolders,        // 👈 NUEVO
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

// Carpetas CINTAX visibles (por área/permisos) -> lo usas en DrivePage
r.get("/cintax/:year", authGuard, listMySharedFolders);

// 🔹 NUEVO: Carpetas de RUT (subcarpetas de las categorías) visibles para el usuario
//    Esto es lo que vas a consumir desde la página de Tareas
r.get("/my-ruts/:year", authGuard, listMyRutFolders);

// Archivos dentro de una carpeta + upload
r.get("/folder/:id/files", authGuard, listFilesInFolder);
r.post(
  "/folder/:id/upload",
  authGuard,
  upload.single("file"),
  uploadToFolder
);

// Sync de áreas según grupos de Google
r.post("/trabajadores/sync-areas", authGuard, syncAreasFromGroups);

export default r;
