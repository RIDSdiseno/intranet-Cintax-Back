import { Router } from "express";
import { authGuard } from "../middlewares/auth.middleware";
import {
  getMyTasks,
  getMyKpis,
  getRecentActivity,
  getAnnouncements,
} from "../controllers/dashboard.controller";

const router = Router();

// Paso 2: Proteger todas las rutas del dashboard
router.use(authGuard);

// Paso 3: Definir las rutas
router.get("/my-tasks", getMyTasks);
router.get("/my-kpis", getMyKpis);
router.get("/activity", getRecentActivity);
router.get("/announcements", getAnnouncements);

export default router;