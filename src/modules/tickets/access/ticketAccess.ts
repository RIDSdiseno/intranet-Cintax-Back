import type { Area, PrismaClient } from "@prisma/client";
import type { AuthJwtPayload } from "../../../middlewares/auth.middleware";
import { resolveTicketArea } from "../routing/ticketRouting";
import { areaToSlug, getAreaChips } from "../routing/ticketRouting";

export type AuthTrabajador = {
  id_trabajador: number;
  role: AuthJwtPayload["role"];
  email: string;
};

export type TicketUserContext = {
  userId: number;
  role: AuthJwtPayload["role"];
  isAdmin: boolean;
  areaInterna: Area | null;
  userAreaSlug: string | null;
  allowedAreas: string[];
};

export type EnforcedArea = {
  requestedArea: string;
  effectiveArea: string;
  forced: boolean;
};

export function getAuthTrabajador(
  user?: (AuthJwtPayload & { id_trabajador?: number }) | null
): AuthTrabajador | null {
  if (!user?.role) return null;
  const id =
    (user as { id_trabajador?: number }).id_trabajador ?? user.id ?? null;
  if (!id) return null;
  return {
    id_trabajador: id,
    role: user.role,
    email: user.email,
  };
}

export function isAdmin(user?: AuthJwtPayload | AuthTrabajador | null): boolean {
  if (!user) return false;
  return user.role === "ADMIN";
}

export async function resolveTrabajadorArea(
  prisma: PrismaClient,
  id_trabajador: number
) {
  const trabajador = await prisma.trabajador.findUnique({
    where: { id_trabajador },
    select: { areaInterna: true },
  });

  return trabajador?.areaInterna ?? null;
}

export function resolveAllowedAreas(ctx: {
  isAdmin: boolean;
  userAreaSlug: string | null;
}) {
  if (ctx.isAdmin) {
    return ["all", ...getAreaChips().map((area) => area.slug)];
  }

  if (!ctx.userAreaSlug) return [];
  return ["all", ctx.userAreaSlug];
}

export async function getUserContext(
  prisma: PrismaClient,
  user?: AuthJwtPayload | null
): Promise<TicketUserContext | null> {
  const auth = getAuthTrabajador(user);
  if (!auth) return null;

  const isAdminUser = isAdmin(auth);
  const areaInterna = await resolveTrabajadorArea(prisma, auth.id_trabajador);
  const userAreaSlug = areaToSlug(areaInterna);

  if (!isAdminUser && !userAreaSlug) return null;

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

export function enforceArea(
  ctx: TicketUserContext,
  requestedArea?: string | null
): EnforcedArea {
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

export async function canSeeTicket(
  prisma: PrismaClient,
  user: AuthJwtPayload | AuthTrabajador | null | undefined,
  ticket: { trabajador?: { areaInterna?: unknown } | null; subject?: string | null; description?: string | null }
) {
  if (!user) return false;
  if (isAdmin(user)) return true;

  const ctx = await getUserContext(prisma, user as AuthJwtPayload | undefined);
  if (!ctx || !ctx.userAreaSlug) return false;
  const ticketArea = resolveTicketArea(ticket as any);
  if (!ticketArea) return false;

  return ticketArea.slug === ctx.userAreaSlug;
}
