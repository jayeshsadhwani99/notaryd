import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { Public, type AuthUser } from '../common/auth';
import { parseBody } from '../common/parse';
import { AuthService } from './auth.service';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, 'Use at least 10 characters'),
  name: z.string().min(1).max(80),
  orgName: z.string().min(1).max(80),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('signup')
  async signup(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = parseBody(signupSchema, body);
    const result = await this.auth.signup(input);
    setSession(response, result.token);
    return { user: result.user };
  }

  @Public()
  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = parseBody(loginSchema, body);
    const result = await this.auth.login(input.email, input.password);
    setSession(response, result.token);
    return { user: result.user };
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = readCookie(request.headers.cookie, 'notaryd_session');
    await this.auth.logout(token);
    response.clearCookie('notaryd_session', { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@Req() request: Request & { user: AuthUser }) {
    return { user: request.user };
  }
}

function setSession(response: Response, token: string): void {
  response.cookie('notaryd_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    maxAge: 14 * 24 * 60 * 60 * 1000,
  });
}

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
