import { cpSync } from 'node:fs';

// Standalone Next.js output needs its static assets alongside the server.
cpSync(new URL('../.next/static', import.meta.url), new URL('../.next/standalone/.next/static', import.meta.url), { recursive: true });
process.env.HOSTNAME = '0.0.0.0';
await import('../.next/standalone/server.js');
