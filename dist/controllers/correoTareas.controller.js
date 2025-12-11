"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CorreoTareasController = void 0;
const gmailDelegated_service_1 = require("../services/gmailDelegated.service");
class CorreoTareasController {
    static async enviarCorreo(req, res) {
        try {
            const { id } = req.params;
            const { para, asunto, mensaje } = req.body;
            const trabajadorEmail = req.user?.email;
            if (!trabajadorEmail) {
                return res.status(400).json({ message: "No se encontró email del usuario autenticado." });
            }
            const files = req.files || [];
            console.log("[Correo] body:", req.body);
            console.log("[Correo] files:", files.map((f) => ({
                name: f.originalname,
                size: f.size,
                mimetype: f.mimetype,
                hasBuffer: !!f.buffer,
            })));
            await (0, gmailDelegated_service_1.sendEmailAsUser)({
                fromUserEmail: trabajadorEmail,
                to: para,
                subject: asunto,
                bodyText: mensaje,
                attachments: files.map((f) => ({
                    filename: f.originalname,
                    mimeType: f.mimetype,
                    content: f.buffer, // viene desde memoryStorage
                })),
            });
            return res.status(200).json({ ok: true });
        }
        catch (error) {
            console.error("[Backend] Error enviando correo de tarea:", error);
            return res.status(500).json({
                message: "Error enviando correo de tarea",
            });
        }
    }
}
exports.CorreoTareasController = CorreoTareasController;
