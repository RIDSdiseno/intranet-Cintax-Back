// src/services/gmailDelegated.service.ts
import { google } from "googleapis";
import "dotenv/config";

const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const SERVICE_ACCOUNT_KEY = process.env.GOOGLE_PRIVATE_KEY;
const ALLOWED_DOMAIN = process.env.GOOGLE_ALLOWED_DOMAIN || "cintax.cl";

if (!SERVICE_ACCOUNT_EMAIL || !SERVICE_ACCOUNT_KEY) {
  throw new Error(
    "Faltan GOOGLE_CLIENT_EMAIL o GOOGLE_PRIVATE_KEY para el service account"
  );
}

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send"];

// Normaliza la key por si viene con \\n
function getPrivateKey(): string {
  return SERVICE_ACCOUNT_KEY!.replace(/\\n/g, "\n");
}

// Crea un cliente Gmail impersonando a un usuario @cintax.cl
function getDelegatedGmail(userEmail: string) {
  if (!userEmail.endsWith(`@${ALLOWED_DOMAIN}`)) {
    throw new Error(
      `Solo se pueden enviar correos como usuarios del dominio ${ALLOWED_DOMAIN}`
    );
  }

  const jwtClient = new google.auth.JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    key: getPrivateKey(),
    scopes: GMAIL_SCOPES,
    subject: userEmail, // 👈 usuario que estamos impersonando
  });

  const gmail = google.gmail({
    version: "v1",
    auth: jwtClient,
  });

  return gmail;
}

export type AttachmentInput = {
  filename: string;
  mimeType: string;
  content: Buffer; // contenido binario
};

export type SendDelegatedEmailParams = {
  fromUserEmail: string; // correo del trabajador que hizo la tarea
  to: string;
  subject: string;
  bodyText: string;
  attachments?: AttachmentInput[];
};

export async function sendEmailAsUser({
  fromUserEmail,
  to,
  subject,
  bodyText,
  attachments = [],
}: SendDelegatedEmailParams) {
  const gmail = getDelegatedGmail(fromUserEmail);

  console.log("[Correo] Enviando como:", fromUserEmail);
  console.log(
    "[Correo] Adjuntos:",
    attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.content.length,
    }))
  );

  const boundary = "cintax_boundary_" + Date.now().toString(16);

  const lines: string[] = [
    `From: ${fromUserEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    bodyText || "",
  ];

  // Adjuntar archivos
  for (const att of attachments) {
    const base64Content = att.content.toString("base64");

    lines.push(
      "",
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${att.filename}"`,
      "",
      base64Content
    );
  }

  // Cierre del multipart
  lines.push("", `--${boundary}--`, "");

  const message = lines.join("\r\n");

  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodedMessage,
    },
  });

  return res.data;
}
