import { Router } from "express";
import { authGuard } from "../middlewares/auth.middleware";
import { connectDrive, driveCallback, listCintax2025Folders, listFilesInFolder } from "../controllers/auth.controller";

const r = Router();

r.get("/connect",authGuard,connectDrive)
r.get("/callback",driveCallback)

r.get("/cintax/:year",authGuard,listCintax2025Folders)
r.get("/folder/:id/files",authGuard,listFilesInFolder)

export default r