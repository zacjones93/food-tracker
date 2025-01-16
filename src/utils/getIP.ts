import "server-only";

import { headers } from "next/headers";

export async function getIP() {
  const headersList = await headers();

  const ip = headersList.get('cf-connecting-ip') || headersList.get('x-forwarded-for') || null;
  if (!ip) {
    throw new Error('IP not found');
  }

  return ip;
}
