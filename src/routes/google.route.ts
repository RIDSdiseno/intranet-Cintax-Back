import { Router } from "express";
import multer from "multer";
import { authGuard } from "../middlewares/auth.middleware";
import { connectDrive, driveCallback, listCintax2025Folders, listFilesInFolder, listMySharedFolders, uploadToFolder  } from "../controllers/auth.controller";

const r = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB por ejemplo
});

r.get("/connect",authGuard,connectDrive)
r.get("/callback",driveCallback)

r.get("/cintax/:year",authGuard,listMySharedFolders)
r.get("/folder/:id/files",authGuard,listFilesInFolder)
r.post(
  "/folder/:id/upload",
  authGuard,
  upload.single("file"),
  uploadToFolder
);

export default r