"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_middleware_1 = require("../middlewares/auth.middleware");
const auth_controller_1 = require("../controllers/auth.controller");
const r = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});
// OAuth Google Drive
r.get("/connect", auth_middleware_1.authGuard, auth_controller_1.connectDrive);
r.get("/callback", auth_controller_1.driveCallback);
// Carpetas CINTAX visibles (por área/permisos) -> lo usas en DrivePage
r.get("/cintax/:year", auth_middleware_1.authGuard, auth_controller_1.listMySharedFolders);
// 🔹 NUEVO: Carpetas de RUT (subcarpetas de las categorías) visibles para el usuario
//    Esto es lo que vas a consumir desde la página de Tareas
r.get("/my-ruts/:year", auth_middleware_1.authGuard, auth_controller_1.listMyRutFolders);
// Archivos dentro de una carpeta + upload
r.get("/folder/:id/files", auth_middleware_1.authGuard, auth_controller_1.listFilesInFolder);
r.post("/folder/:id/upload", auth_middleware_1.authGuard, upload.single("file"), auth_controller_1.uploadToFolder);
// Sync de áreas según grupos de Google
r.post("/trabajadores/sync-areas", auth_middleware_1.authGuard, auth_controller_1.syncAreasFromGroups);
exports.default = r;
