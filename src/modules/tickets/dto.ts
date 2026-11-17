export type TicketGroup = {
  slug: string;
  name: string;
  count: number;
};

export type TicketsGroupsResponse = {
  ok: true;
  data: {
    totalAll: number;
    groups: TicketGroup[];
  };
};

/** Etiqueta de area que consume la UI (front/src/modules/tickets/types.ts). */
export type AreaDetected =
  | "CONTABLE"
  | "TRIBUTARIA"
  | "LABORAL"
  | "SIN_CLASIFICAR";

export type TicketRow = {
  id: number;
  number: number;
  subject: string;
  requester: string;
  requesterEmail: string;
  preview: string | null;
  group: string;
  areaDetected: AreaDetected;
  areaSlug: string | null;
  areaLabel: string | null;
  categoria: string | null;
  tags: string[];
  trabajadorId: number | null;
  status: string;
  priority: string;
  createdAt: string;
};

export type TicketsPage = {
  items: TicketRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type TicketThreadMessageAuthor = {
  id_trabajador: number;
  nombre: string;
  email: string;
};

export type TicketThreadAttachment = {
  id: number;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
};

export type TicketThreadMessage = {
  id: number;
  type: "PUBLIC_REPLY" | "INTERNAL_NOTE" | "FORWARD";
  /** true = lo escribio el solicitante; false = salio desde la intranet. */
  isInbound: boolean;
  toEmail?: string | null;
  cc?: string | null;
  bcc?: string | null;
  subject?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
  attachments: TicketThreadAttachment[];
  createdAt: string;
  author?: TicketThreadMessageAuthor | null;
};

export type TicketDetail = {
  id: number;
  number: number;
  subject: string;
  description: string;
  requesterEmail: string;
  group: string;
  categoria: string | null;
  areaDetected: AreaDetected;
  tags: string[];
  clienteId: number | null;
  status: string;
  estado: string | null;
  priority: string;
  prioridad: number | null;
  createdAt: string;
  updatedAt: string;
  trabajadorId: number | null;
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstResponseStatus: "PENDIENTE" | "OK";
  resolutionStatus: "PENDIENTE" | "OK";
};

/**
 * El hilo de mensajes NO viaja aca: se pide con GET /:id/messages, que es de
 * donde lo lee la UI. Incluirlo significaba una segunda consulta por cada
 * apertura de ticket para datos que nadie usaba.
 */
export type TicketDetailResponse = {
  ok: true;
  data: {
    ticket: TicketDetail;
  };
};

export type TicketMessagesResponse = {
  ok: true;
  data: TicketThreadMessage[];
};

export type TicketAgent = {
  id_trabajador: number;
  nombre: string;
  email: string;
  areaInterna: "CONTA" | "ADMIN" | "RRHH" | "TRIBUTARIO" | null;
};

export type TicketAgentsResponse = {
  ok: true;
  data: TicketAgent[];
};

export type TicketsResponse = {
  ok: true;
  data: TicketsPage;
};

export type TicketEventDto = {
  id: number;
  type: string;
  createdAt: string;
  actor: TicketThreadMessageAuthor | null;
  payload: Record<string, unknown> | null;
};

export type TicketEventsResponse = {
  ok: true;
  data: TicketEventDto[];
};
