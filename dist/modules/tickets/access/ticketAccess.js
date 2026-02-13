"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthTrabajador = getAuthTrabajador;
exports.isAdmin = isAdmin;
exports.resolveTrabajadorArea = resolveTrabajadorArea;
exports.canSeeTicket = canSeeTicket;
const ticketRouting_1 = require("../routing/ticketRouting");
function getAuthTrabajador(user) {
    if (!user?.role)
        return null;
    const id = user.id_trabajador ?? user.id ?? null;
    if (!id)
        return null;
    return {
        id_trabajador: id,
        role: user.role,
        email: user.email,
    };
}
function isAdmin(user) {
    if (!user)
        return false;
    return user.role === "ADMIN";
}
async function resolveTrabajadorArea(prisma, id_trabajador) {
    const trabajador = await prisma.trabajador.findUnique({
        where: { id_trabajador },
        select: { areaInterna: true },
    });
    return trabajador?.areaInterna ?? null;
}
async function canSeeTicket(prisma, user, ticket) {
    if (!user)
        return false;
    if (isAdmin(user))
        return true;
    const auth = getAuthTrabajador(user);
    if (!auth)
        return false;
    const userArea = await resolveTrabajadorArea(prisma, auth.id_trabajador);
    const ticketArea = (0, ticketRouting_1.resolveTicketArea)(ticket);
    if (!ticketArea || !userArea)
        return false;
    return ticketArea.area === userArea;
}
