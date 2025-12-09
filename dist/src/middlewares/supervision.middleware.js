"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markUserSupervisionFlags = exports.requireSupervisorOrAdmin = void 0;
const supervision_config_1 = require("../config/supervision.config");
const requireSupervisorOrAdmin = (req, res, next) => {
    const user = req.user;
    if (!user?.id) {
        return res.status(401).json({ message: "No autorizado" });
    }
    // 👇 asegúrate de que en tu JWT estés guardando el email de Google
    const email = user.email;
    if (!(0, supervision_config_1.isSupervisorOrAdminEmail)(email)) {
        return res.status(403).json({
            message: "Solo supervisores o administradores pueden acceder",
        });
    }
    return next();
};
exports.requireSupervisorOrAdmin = requireSupervisorOrAdmin;
// (opcional) helpers por si los quieres usar en otros controllers
const markUserSupervisionFlags = (user) => {
    const email = user?.email;
    return {
        ...user,
        esAdmin: (0, supervision_config_1.isAdminEmail)(email),
        esSupervisor: (0, supervision_config_1.isSupervisorEmail)(email),
        esSupervisorOAdmin: (0, supervision_config_1.isSupervisorOrAdminEmail)(email),
    };
};
exports.markUserSupervisionFlags = markUserSupervisionFlags;
