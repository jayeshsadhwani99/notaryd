import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.user.upsert({
    where: { email: 'qa+admin@acme.test' },
    update: {},
    create: { email: 'qa+admin@acme.test', passwordHash: 'hash', role: 'ADMIN' },
  });
}

main();
