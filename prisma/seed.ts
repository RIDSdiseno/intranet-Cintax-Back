import { Area, PrismaClient, TicketMessageType } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_SUBJECT_PREFIX = "[SEED]";
const ATTACHMENT_URL = "https://example.com/comprobante.pdf";
const FORWARD_TO_EMAIL = "jefe@example.com";

type WorkerSeed = {
  email: string;
  nombre: string;
  areaInterna: Area;
};

type TicketPlan = {
  key: string;
  areaLabel: string;
  topic: string;
  categoria: string;
  prioridad: number | null;
  requesterEmail: string;
  trabajadorEmail: string | null;
};

type MessagePlan = {
  seedKey: string;
  type: TicketMessageType;
  toEmail: string | null;
  subject: string | null;
  bodyHtml: string;
  bodyText: string;
  createdAt: Date;
};

type SeedStats = {
  workersCreated: number;
  ticketsCreated: number;
  messagesCreated: number;
  attachmentsCreated: number;
};

const WORKERS: WorkerSeed[] = [
  {
    email: "admin@cintax.cl",
    nombre: "Admin Cintax Seed",
    areaInterna: Area.ADMIN,
  },
  
  {
    email: "conta.agent@cintax.cl",
    nombre: "Agente Conta Seed",
    areaInterna: Area.CONTA,
  },
  {
    email: "rrhh.agent@cintax.cl",
    nombre: "Agente RRHH Seed",
    areaInterna: Area.RRHH,
  },
  {
    email: "trib.agent@cintax.cl",
    nombre: "Agente Tributario Seed",
    areaInterna: Area.TRIBUTARIO,
  },
];

function buildTicketPlans(): TicketPlan[] {
  const plans: TicketPlan[] = [];

  const areaConfig = [
    {
      areaLabel: "CONTA",
      categoria: "CONTA",
      trabajadorEmail: "conta.agent@cintax.cl",
      topics: [
        "Revision de libro de compras",
        "Consulta por conciliacion bancaria",
        "Ajuste de cierre mensual",
      ],
    },
    {
      areaLabel: "RRHH",
      categoria: "RRHH",
      trabajadorEmail: "rrhh.agent@cintax.cl",
      topics: [
        "Consulta sobre liquidacion",
        "Actualizacion de contrato",
        "Solicitud de certificado laboral",
      ],
    },
    {
      areaLabel: "TRIBUTARIO",
      categoria: "TRIBUTARIO",
      trabajadorEmail: "trib.agent@cintax.cl",
      topics: [
        "Seguimiento de declaracion anual",
        "Revision de observaciones del SII",
        "Aclaracion sobre regimen tributario",
      ],
    },
  ] as const;

  const unassignedTopics = [
    "Consulta general de portal interno",
    "Seguimiento de incidente operativo",
    "Solicitud de coordinacion administrativa",
  ] as const;

  let requesterCounter = 1;

  for (const area of areaConfig) {
    area.topics.forEach((topic, index) => {
      plans.push({
        key: `${area.areaLabel.toLowerCase()}-${index + 1}`,
        areaLabel: area.areaLabel,
        topic,
        categoria: area.categoria,
        prioridad: (index % 3) + 1,
        requesterEmail: `cliente${requesterCounter++}@example.com`,
        trabajadorEmail: area.trabajadorEmail,
      });
    });
  }

  unassignedTopics.forEach((topic, index) => {
    plans.push({
      key: `sin-asignar-${index + 1}`,
      areaLabel: "SIN_ASIGNAR",
      topic,
      categoria: "GENERAL",
      prioridad: index === 1 ? null : ((index % 3) + 1),
      requesterEmail: `cliente${requesterCounter++}@example.com`,
      trabajadorEmail: null,
    });
  });

  return plans;
}

function buildTicketSubject(plan: TicketPlan) {
  return `${SEED_SUBJECT_PREFIX} ${plan.areaLabel} - ${plan.topic}`;
}

function buildTicketDescription(plan: TicketPlan) {
  const areaBlock =
    plan.areaLabel === "SIN_ASIGNAR"
      ? "Caso sin clasificacion de area"
      : `Area solicitada: ${plan.areaLabel}`;

  return [
    "Estimado equipo Cintax,",
    `Se solicita apoyo para: ${plan.topic}.`,
    areaBlock,
    "Contexto: este correo de ejemplo simula un primer contacto del cliente con informacion extendida para validar el preview y el detalle del ticket.",
    "Quedamos atentos a comentarios y proximos pasos.",
  ].join("\n\n");
}

function buildMessagePlans(params: {
  ticketKey: string;
  ticketSubject: string;
  requesterEmail: string;
  baseCreatedAt: Date;
}): MessagePlan[] {
  const { ticketKey, ticketSubject, requesterEmail, baseCreatedAt } = params;

  const messageTimes = [0, 5, 10, 15].map(
    (offsetMinutes) =>
      new Date(baseCreatedAt.getTime() + offsetMinutes * 60 * 1000)
  );

  return [
    {
      seedKey: `${ticketKey}-m1`,
      type: TicketMessageType.PUBLIC_REPLY,
      toEmail: requesterEmail,
      subject: null,
      bodyHtml:
        `<!-- seed:${ticketKey}-m1 -->` +
        "<p>Respuesta inicial al cliente con acuse de recibo y plan de trabajo.</p>",
      bodyText:
        "Respuesta inicial al cliente con acuse de recibo y plan de trabajo.",
      createdAt: messageTimes[0],
    },
    {
      seedKey: `${ticketKey}-m2`,
      type: TicketMessageType.INTERNAL_NOTE,
      toEmail: null,
      subject: null,
      bodyHtml:
        `<!-- seed:${ticketKey}-m2 -->` +
        "<p><b>Nota interna:</b> validar antecedentes y coordinar responsable.</p>",
      bodyText: "Nota interna: validar antecedentes y coordinar responsable.",
      createdAt: messageTimes[1],
    },
    {
      seedKey: `${ticketKey}-m3`,
      type: TicketMessageType.FORWARD,
      toEmail: FORWARD_TO_EMAIL,
      subject: `Fwd: ${ticketSubject}`,
      bodyHtml:
        `<!-- seed:${ticketKey}-m3 -->` +
        "<p>Reenviando a jefatura para seguimiento y visibilidad.</p>",
      bodyText: "Reenviando a jefatura para seguimiento y visibilidad.",
      createdAt: messageTimes[2],
    },
    {
      seedKey: `${ticketKey}-m4`,
      type: TicketMessageType.PUBLIC_REPLY,
      toEmail: requesterEmail,
      subject: null,
      bodyHtml:
        `<!-- seed:${ticketKey}-m4 -->` +
        "<p>Segunda respuesta al cliente con avance y proximos pasos.</p>",
      bodyText: "Segunda respuesta al cliente con avance y proximos pasos.",
      createdAt: messageTimes[3],
    },
  ];
}

async function ensureWorkers(stats: SeedStats) {
  const byEmail = new Map<string, number>();

  for (const worker of WORKERS) {
    const existing = await prisma.trabajador.findUnique({
      where: { email: worker.email },
      select: {
        id_trabajador: true,
        areaInterna: true,
        nombre: true,
      },
    });

    if (!existing) {
      const created = await prisma.trabajador.create({
        data: {
          email: worker.email,
          nombre: worker.nombre,
          areaInterna: worker.areaInterna,
        },
        select: { id_trabajador: true },
      });

      byEmail.set(worker.email, created.id_trabajador);
      stats.workersCreated += 1;
      continue;
    }

    const updateData: { areaInterna?: Area; nombre?: string } = {};

    if (existing.areaInterna !== worker.areaInterna) {
      updateData.areaInterna = worker.areaInterna;
    }

    if (existing.nombre !== worker.nombre) {
      updateData.nombre = worker.nombre;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.trabajador.update({
        where: { id_trabajador: existing.id_trabajador },
        data: updateData,
      });
    }

    byEmail.set(worker.email, existing.id_trabajador);
  }

  return byEmail;
}

async function ensureTicket(params: {
  plan: TicketPlan;
  trabajadorId: number | null;
  ticketIndex: number;
  stats: SeedStats;
}) {
  const { plan, trabajadorId, ticketIndex, stats } = params;

  const subject = buildTicketSubject(plan);
  const description = buildTicketDescription(plan);

  const createdAt = new Date(
    Date.now() - (ticketIndex + 1) * 2 * 60 * 60 * 1000
  );

  const existing = await prisma.ticket.findFirst({
    where: {
      AND: [
        { subject: { startsWith: SEED_SUBJECT_PREFIX } },
        { subject },
        { requesterEmail: plan.requesterEmail },
      ],
    },
    orderBy: { id_ticket: "asc" },
  });

  if (!existing) {
    const created = await prisma.ticket.create({
      data: {
        subject,
        description,
        categoria: plan.categoria,
        estado: "ABIERTO",
        prioridad: plan.prioridad,
        requesterEmail: plan.requesterEmail,
        trabajadorId,
        createdAt,
      },
    });

    stats.ticketsCreated += 1;
    return created;
  }

  const updateData: {
    description?: string;
    categoria?: string;
    estado?: string;
    prioridad?: number | null;
    trabajadorId?: number | null;
  } = {};

  if (existing.description !== description) {
    updateData.description = description;
  }

  if (existing.categoria !== plan.categoria) {
    updateData.categoria = plan.categoria;
  }

  if (existing.estado !== "ABIERTO") {
    updateData.estado = "ABIERTO";
  }

  if (existing.prioridad !== plan.prioridad) {
    updateData.prioridad = plan.prioridad;
  }

  if (existing.trabajadorId !== trabajadorId) {
    updateData.trabajadorId = trabajadorId;
  }

  if (Object.keys(updateData).length === 0) {
    return existing;
  }

  return prisma.ticket.update({
    where: { id_ticket: existing.id_ticket },
    data: updateData,
  });
}

async function ensureTicketMessages(params: {
  ticketId: number;
  ticketKey: string;
  ticketSubject: string;
  requesterEmail: string;
  authorTrabajadorId: number | null;
  ticketIndex: number;
  stats: SeedStats;
}) {
  const {
    ticketId,
    ticketKey,
    ticketSubject,
    requesterEmail,
    authorTrabajadorId,
    ticketIndex,
    stats,
  } = params;

  const baseCreatedAt = new Date(
    Date.now() - ((ticketIndex + 1) * 2 * 60 - 40) * 60 * 1000
  );

  const messagePlans = buildMessagePlans({
    ticketKey,
    ticketSubject,
    requesterEmail,
    baseCreatedAt,
  });

  const existing = await prisma.ticketMessage.findMany({
    where: { ticketId },
    select: { id: true, bodyHtml: true },
  });

  let forwardMessageId: number | null = null;

  for (const messagePlan of messagePlans) {
    const marker = `seed:${messagePlan.seedKey}`;
    const found = existing.find((row) => (row.bodyHtml ?? "").includes(marker));

    if (found) {
      if (messagePlan.type === TicketMessageType.FORWARD) {
        forwardMessageId = found.id;
      }
      continue;
    }

    const created = await prisma.ticketMessage.create({
      data: {
        ticketId,
        authorTrabajadorId,
        type: messagePlan.type,
        toEmail: messagePlan.toEmail,
        subject: messagePlan.subject,
        bodyHtml: messagePlan.bodyHtml,
        bodyText: messagePlan.bodyText,
        createdAt: messagePlan.createdAt,
      },
      select: { id: true },
    });

    existing.push({ id: created.id, bodyHtml: messagePlan.bodyHtml });
    stats.messagesCreated += 1;

    if (messagePlan.type === TicketMessageType.FORWARD) {
      forwardMessageId = created.id;
    }
  }

  if (!forwardMessageId) {
    return;
  }

  const existingAttachment = await prisma.ticketAttachment.findFirst({
    where: {
      messageId: forwardMessageId,
      url: ATTACHMENT_URL,
    },
    select: { id: true },
  });

  if (existingAttachment) {
    return;
  }

  await prisma.ticketAttachment.create({
    data: {
      messageId: forwardMessageId,
      filename: "comprobante.pdf",
      mimeType: "application/pdf",
      size: 123456,
      url: ATTACHMENT_URL,
    },
  });

  stats.attachmentsCreated += 1;
}

async function main() {
  const stats: SeedStats = {
    workersCreated: 0,
    ticketsCreated: 0,
    messagesCreated: 0,
    attachmentsCreated: 0,
  };

  const workersByEmail = await ensureWorkers(stats);
  const plans = buildTicketPlans();

  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];

    const trabajadorId = plan.trabajadorEmail
      ? (workersByEmail.get(plan.trabajadorEmail) ?? null)
      : null;

    const ticket = await ensureTicket({
      plan,
      trabajadorId,
      ticketIndex: index,
      stats,
    });

    const fallbackAdminId = workersByEmail.get("admin@cintax.cl") ?? null;
    const authorTrabajadorId = trabajadorId ?? fallbackAdminId;

    await ensureTicketMessages({
      ticketId: ticket.id_ticket,
      ticketKey: plan.key,
      ticketSubject: ticket.subject,
      requesterEmail: ticket.requesterEmail,
      authorTrabajadorId,
      ticketIndex: index,
      stats,
    });
  }

  console.log("[seed] workers created:", stats.workersCreated);
  console.log("[seed] tickets created:", stats.ticketsCreated);
  console.log("[seed] messages created:", stats.messagesCreated);
  console.log("[seed] attachments created:", stats.attachmentsCreated);
}

main()
  .catch((error) => {
    console.error("[seed] error", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
