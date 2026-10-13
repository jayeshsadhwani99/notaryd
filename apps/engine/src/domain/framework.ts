export type PackageShape = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  prisma?: { seed?: string };
};

const DEP_MARKERS: { id: string; deps: string[] }[] = [
  { id: 'next', deps: ['next'] },
  { id: 'remix', deps: ['@remix-run/react', '@remix-run/node', '@remix-run/serve'] },
  { id: 'sveltekit', deps: ['@sveltejs/kit'] },
  { id: 'nuxt', deps: ['nuxt'] },
  { id: 'astro', deps: ['astro'] },
  { id: 'angular', deps: ['@angular/core'] },
  { id: 'vue', deps: ['vue'] },
  { id: 'react', deps: ['react'] },
  { id: 'nest', deps: ['@nestjs/core', '@nestjs/common'] },
  { id: 'fastify', deps: ['fastify'] },
  { id: 'hono', deps: ['hono'] },
  { id: 'koa', deps: ['koa'] },
  { id: 'express', deps: ['express'] },
  { id: 'fastapi', deps: ['fastapi'] },
  { id: 'flask', deps: ['flask'] },
  { id: 'django', deps: ['django'] },
];

const TEXT_MARKERS: { id: string; test: RegExp }[] = [
  { id: 'fastapi', test: /\bfrom fastapi\b|\bimport fastapi\b/ },
  { id: 'flask', test: /\bfrom flask\b|\bimport flask\b/ },
  { id: 'django', test: /\bfrom django\b|\bimport django\b/ },
  { id: 'gin', test: /github\.com\/gin-gonic\/gin/ },
  { id: 'echo', test: /github\.com\/labstack\/echo/ },
];

export function detectFrameworks(input: { dependencies: string[]; files: { path: string; text: string }[] }): string[] {
  const deps = new Set(input.dependencies);
  const found: string[] = [];
  const add = (id: string) => {
    if (!found.includes(id)) found.push(id);
  };
  for (const marker of DEP_MARKERS) {
    if (marker.deps.some((dep) => deps.has(dep))) add(marker.id);
  }
  const text = input.files.map((file) => file.text).join('\n');
  for (const marker of TEXT_MARKERS) {
    if (marker.test.test(text)) add(marker.id);
  }
  const paths = input.files.map((file) => file.path.replace(/\\/g, '/'));
  if (paths.some((file) => /(?:^|\/)manage\.py$/.test(file))) add('django');
  if (paths.some((file) => /(?:^|\/)go\.mod$/.test(file) && found.length === 0)) add('go');
  if (
    !found.includes('next') &&
    paths.some((file) => /(?:^|\/)app\/(?:.*\/)?page\.(tsx|jsx|ts|js)$/.test(file) || /(?:^|\/)pages\/.+\.(tsx|jsx|ts|js)$/.test(file))
  ) {
    found.unshift('next');
  }
  if (found.includes('next') || found.includes('remix')) {
    const reactAt = found.indexOf('react');
    if (reactAt >= 0) found.splice(reactAt, 1);
  }
  if (found.includes('nuxt')) {
    const vueAt = found.indexOf('vue');
    if (vueAt >= 0) found.splice(vueAt, 1);
  }
  return found.length > 0 ? found : ['unknown'];
}

export function nodeStartCommand(pkg: PackageShape): string {
  const deps = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  const start = pkg.scripts?.start ?? '';
  if (deps.includes('next') || /\bnext\b/.test(start)) {
    return 'npx next build && npx next start -H 0.0.0.0 -p 3000';
  }
  if (start) return 'npm start';
  if (deps.includes('@nestjs/core')) return 'npx nest start';
  if (deps.includes('fastify') || deps.includes('express') || deps.includes('hono') || deps.includes('koa')) return 'npm start';
  return 'npm start';
}
