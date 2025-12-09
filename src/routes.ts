// src/routes.ts
import { Router } from "express";

// Rutas existentes
import authRoutes from "./routes/auth.route";
import googleRoutes from "./routes/google.route";

// 👇 Importamos la clase del controller (OJO: nombre de archivo en minúscula)
import { TareasController } from "./controllers/tareas.Controller";
import { requireAuth } from "./middlewares/requireAuth";
import multer from "multer";

const router = Router();
const upload = multer();

// =============================
//  HEALTHCHECK
// =============================
router.get("/health", (_req, res) =>
  res.json({ ok: true, service: "API Movil", ts: Date.now() })
);

// =============================
//  AUTH
// =============================
router.use("/auth", authRoutes);

// =============================
//  GOOGLE DRIVE
// =============================
router.use("/drive", googleRoutes);

// =============================
//  TAREAS – RUTAS UNA POR UNA
//  TODAS CUELGAN DE /api/tareas/...
// =============================

// VISTA EJECUTIVO
router.get(
  "/tareas/mis-ruts",
  requireAuth,
  TareasController.getMisRuts
);

router.get(
  "/tareas/por-rut/:rut",
  requireAuth,
  TareasController.getTareasPorRut
);

router.get(
  "/tareas/plantillas",
  requireAuth,
  TareasController.getPlantillas
);

router.get(
  "/tareas/por-plantilla/:idPlantilla",
  requireAuth,
  TareasController.getTareasPorPlantilla
);

router.post(
  "/tareas/bulk-desde-plantilla",
  requireAuth,
  TareasController.crearTareasDesdePlantilla
);

router.patch(
  "/tareas/:id/estado",
  requireAuth,
  TareasController.actualizarEstado
);

// VISTA SUPERVISIÓN / ADMIN
router.get(
  "/tareas/supervision/resumen",
  requireAuth,
  TareasController.getResumenSupervision
);

// DRIVE / ARCHIVOS
router.post(
  "/tareas/:id/ensure-drive-folder",
  requireAuth,
  TareasController.ensureDriveFolder
);

router.post(
  "/tareas/:id/archivos",
  requireAuth,
  upload.single("archivo"),
  TareasController.subirArchivo
);

export default router;
