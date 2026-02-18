import { Router } from "express";
import multer from "multer";
import {
  listMailboxThreads,
  getMailboxThread,
  syncMailboxInbox,
  replyMailboxThread, // ✅
} from "../controllers/mailbox.controller";
import { authGuard } from "../middlewares/auth.middleware";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.use(authGuard);

router.get("/threads", listMailboxThreads);
router.get("/threads/:threadId", getMailboxThread);

router.post(
  "/threads/:threadId/reply",
  upload.array("attachments", 10),
  replyMailboxThread
);

router.post("/sync", syncMailboxInbox);

export default router;
