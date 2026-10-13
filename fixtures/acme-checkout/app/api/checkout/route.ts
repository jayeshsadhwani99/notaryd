import { prisma } from '@/lib/db';

export async function POST() {
  await prisma.order.create({ data: { userId: 'u', totalCents: 100, status: 'paid' } });
  return Response.json({ ok: true });
}
