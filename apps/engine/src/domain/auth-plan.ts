import type { PrismaEnum, PrismaModel } from './prisma';
import type { SeededAccount } from './env';

export type AuthDetection = {
  provider: string;
  loginMethods: string[];
  roles: string[];
  roleSource: string;
};

export type AccountSuggestion = {
  role: string;
  count: number;
  login: 'password' | 'saved_session' | 'logged_out';
  why: string;
};

export type AuthSuggestion = {
  suggestions: AccountSuggestion[];
  recommendTestModeBypass: boolean;
  bypassReason: string;
};

const PROVIDERS: { id: string; test: (deps: string[], text: string) => boolean }[] = [
  { id: 'next-auth', test: (deps, text) => deps.some((dep) => dep === 'next-auth' || dep.startsWith('@auth/')) || /next-auth|NextAuth/.test(text) },
  { id: 'clerk', test: (deps) => deps.some((dep) => dep.startsWith('@clerk/')) },
  { id: 'supabase', test: (deps, text) => deps.some((dep) => dep.includes('@supabase/auth') || dep === '@supabase/ssr') || /supabase\.auth/.test(text) },
  { id: 'firebase', test: (deps) => deps.some((dep) => dep.startsWith('firebase')) },
];

export function detectAuth(input: {
  dependencies: string[];
  fileText: string;
  models: PrismaModel[];
  enums: PrismaEnum[];
}): AuthDetection {
  const provider = PROVIDERS.find((item) => item.test(input.dependencies, input.fileText))?.id ?? 'custom';
  const loginMethods: string[] = [];
  if (/type=["']password["']|signIn\(\s*["']credentials["']|authorize\(/.test(input.fileText)) loginMethods.push('password');
  if (/signIn\(\s*["']google["']|Google|accounts\.google/.test(input.fileText)) loginMethods.push('google');
  if (/magic link|signIn\(\s*["']email["']|otp/i.test(input.fileText)) loginMethods.push('magic_link');
  if (loginMethods.length === 0) loginMethods.push('password');

  const user = input.models.find((model) => model.name === 'User');
  const roleField = user?.fields.find((field) => field.name.toLowerCase() === 'role');
  const roleEnum = roleField ? input.enums.find((item) => item.name === roleField.type) : undefined;
  const roles = roleEnum?.values.map((value) => value.toLowerCase()) ?? [];
  return {
    provider,
    loginMethods,
    roles,
    roleSource: roleEnum ? `${roleEnum.name} enum` : roles.length ? 'role column' : 'none',
  };
}

export function suggestAuthPlan(detection: AuthDetection, seeded: SeededAccount[]): AuthSuggestion {
  const suggestions: AccountSuggestion[] = [];
  const roles = detection.roles.length > 0 ? detection.roles : ['admin', 'member'];
  const passwordOk = detection.loginMethods.includes('password');
  const login = passwordOk ? 'password' : 'saved_session';
  for (const role of roles) {
    const existing = seeded.filter((account) => account.role === role);
    if (existing.length > 0) {
      suggestions.push({
        role,
        count: existing.length,
        login,
        why: `Seed already defines ${existing.length} ${role} account${existing.length === 1 ? '' : 's'} (${existing.map((item) => item.email).join(', ')}).`,
      });
      continue;
    }
    const count = role === 'admin' || role === 'owner' ? 1 : 2;
    const why = detection.roles.includes(role)
      ? `The schema has a ${role} role with no seeded user.`
      : `No role column was found, so start with a ${role} account.`;
    suggestions.push({ role, count, login, why });
  }
  suggestions.push({
    role: 'logged_out',
    count: 1,
    login: 'logged_out',
    why: 'Public pages and signup need a logged-out pass.',
  });
  const googleOnly = detection.loginMethods.includes('google') && !passwordOk;
  return {
    suggestions,
    recommendTestModeBypass: googleOnly,
    bypassReason: googleOnly
      ? 'Google is the only login method. A sandbox-only bypass avoids automating Google’s login page.'
      : 'Password login is available, so a bypass is optional.',
  };
}
