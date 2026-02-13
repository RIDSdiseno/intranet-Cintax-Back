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

export type TicketRow = {
  id: number;
  number: number;
  subject: string;
  requester: string;
  requesterEmail: string;
  preview: string | null;
  group: string;
  areaSlug: string | null;
  areaLabel: string | null;
  categoria: string | null;
  status: string;
  priority: string;
  createdAt: string;
};

export type TicketMessage = {
  id: string;
  authorEmail: string;
  body: string;
  createdAt: string;
  kind: "requester" | "reply";
};

export type TicketThreadMessageAuthor = {
  id_trabajador: number;
  nombre: string;
  email: string;
};

export type TicketThreadMessage = {
  id: number;
  type: "PUBLIC_REPLY" | "INTERNAL_NOTE" | "FORWARD";
  toEmail?: string | null;
  cc?: string | null;
  bcc?: string | null;
  subject?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
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

export type TicketDetailResponse = {
  ok: true;
  data: {
    ticket: TicketDetail;
    messages: TicketMessage[];
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
  data: TicketRow[];
};
