import {
  getHistoricalImportStatus,
  postHistoricalImport,
} from '@/lib/importar-remitos-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isDevelopmentOnly() {
  return !process.env.VERCEL && process.env.GITHUB_BRANCH === 'dev';
}

export async function GET() {
  const enabled = isDevelopmentOnly();
  return getHistoricalImportStatus({
    enabled,
    environment: process.env.VERCEL ? 'vercel' : 'local',
    branch: process.env.GITHUB_BRANCH || '(no configurada)',
    message: 'Esta herramienta solo funciona localmente con GITHUB_BRANCH=dev.',
  });
}

export async function POST(request) {
  return postHistoricalImport(request, {
    enabled: isDevelopmentOnly(),
    branch: 'dev',
    mode: 'dev',
    message: 'Importación bloqueada: esta herramienta solo funciona localmente con GITHUB_BRANCH=dev.',
  });
}
