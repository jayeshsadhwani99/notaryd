import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const engine = (process.env.ENGINE_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
  const target = `${engine}/${path.join('/')}${request.nextUrl.search}`;
  const headers = new Headers(request.headers);
  headers.delete('host');
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();
  const upstream = await fetch(target, { method: request.method, headers, body, redirect: 'manual' });
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (['content-encoding', 'transfer-encoding', 'set-cookie'].includes(key.toLowerCase())) return;
    responseHeaders.set(key, value);
  });
  const cookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : [];
  for (const cookie of cookies) responseHeaders.append('set-cookie', cookie);
  return new NextResponse(await upstream.arrayBuffer(), { status: upstream.status, headers: responseHeaders });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
