// src/services/googleDirectoryGroups.ts
import { google } from "googleapis";

const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const GOOGLE_ADMIN_EMAIL = process.env.GOOGLE_ADMIN_EMAIL;

const DIRECTORY_SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.group.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.member.readonly",
];

function getAdminDirectoryClient() {
  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_ADMIN_EMAIL) {
    throw new Error("Faltan envs de service account para Directory");
  }

  const auth = new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key:   GOOGLE_PRIVATE_KEY,
    scopes: DIRECTORY_SCOPES,
    subject: GOOGLE_ADMIN_EMAIL,   // usuario admin del dominio
  });

  return google.admin({ version: "directory_v1", auth });
}

export async function listGroupMembersEmails(groupEmail: string): Promise<string[]> {
  const admin = getAdminDirectoryClient();

  const res = await admin.members.list({ groupKey: groupEmail });
  const members = res.data.members ?? [];

  return members
    .filter(m => !!m.email)
    .map(m => (m.email as string).toLowerCase());
}
