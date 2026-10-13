import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  const body = await request.json();
  await prisma.refund.create({ data: { orderId: body.orderId, userId: body.userId, reason: body.reason } });
  return Response.json({ ok: true });
}
