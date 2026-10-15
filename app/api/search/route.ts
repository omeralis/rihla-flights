import { createSearchHandler } from '@/lib/search-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 100;
export const GET = createSearchHandler();
