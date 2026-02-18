"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthTrabajador = getAuthTrabajador;
exports.isAdmin = isAdmin;
exports.resolveTrabajadorArea = resolveTrabajadorArea;
exports.resolveAllowedAreas = resolveAllowedAreas;
exports.getUserContext = getUserContext;
exports.enforceArea = enforceArea;
exports.canSeeTicket = canSeeTicket;
const ticketRouting_1 = require("../routing/ticketRouting");
const ticketRouting_2 = require("../routing/ticketRouting");
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
function resolveAllowedAreas(ctx) {
    if (ctx.isAdmin) {
        return ["all", ...(0, ticketRouting_2.getAreaChips)().map((area) => area.slug)];
    }
    if (!ctx.userAreaSlug)
        return [];
    return ["all", ctx.userAreaSlug];
}
async function getUserContext(prisma, user) {
    const auth = getAuthTrabajador(user);
    if (!auth)
        return null;
    const isAdminUser = isAdmin(auth);
    const areaInterna = await resolveTrabajadorArea(prisma, auth.id_trabajador);
    const userAreaSlug = (0, ticketRouting_2.areaToSlug)(areaInterna);
    if (!isAdminUser && !userAreaSlug)
        return null;
    const allowedAreas = resolveAllowedAreas({
        isAdmin: isAdminUser,
        userAreaSlug,
    });
    return {
        userId: auth.id_trabajador,
        role: auth.role,
        isAdmin: isAdminUser,
        areaInterna,
        userAreaSlug,
        allowedAreas,
    };
}
function enforceArea(ctx, requestedArea) {
    const requested = String(requestedArea || "all").trim().toLowerCase() || "all";
    if (ctx.isAdmin) {
        if (!ctx.allowedAreas.includes(requested)) {
            return {
                requestedArea: requested,
                effectiveArea: "all",
                forced: true,
            };
        }
        return {
            requestedArea: requested,
            effectiveArea: requested,
            forced: false,
        };
    }
    const fallback = ctx.userAreaSlug ?? "all";
    if (requested === "all" || requested === fallback) {
        return {
            requestedArea: requested,
            effectiveArea: fallback,
            forced: requested === "all",
        };
    }
    return {
        requestedArea: requested,
        effectiveArea: fallback,
        forced: true,
    };
}
async function canSeeTicket(prisma, user, ticket) {
    if (!user)
        return false;
    if (isAdmin(user))
        return true;
    const ctx = await getUserContext(prisma, user);
    if (!ctx || !ctx.userAreaSlug)
        return false;
    const ticketArea = (0, ticketRouting_1.resolveTicketArea)(ticket);
    if (!ticketArea)
        return false;
    return ticketArea.slug === ctx.userAreaSlug;
}
