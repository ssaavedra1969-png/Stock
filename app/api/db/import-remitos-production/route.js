import {
  getHistoricalImportStatus,
  postHistoricalImport,
} from '@/lib/importar-remitos-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isProductionOnly() {
  return Boolean(process.env.VERCEL) && (process.env.GITHUB_BRANCH || 'main') === 'main';
}

export async function GET() {
  const enabled = isProductionOnly();
  return getHistoricalImportStatus({
    enabled,
    environment: process.env.VERCEL ? 'vercel' : 'local',
    branch: process.env.GITHUB_BRANCH || 'main',
    message: 'Esta herramienta solo funciona en Vercel con GITHUB_BRANCH=main.',
  });
}

export async function POST(request) {
  return postHistoricalImport(request, {
    enabled: isProductionOnly(),
    branch: 'main',
    mode: 'production',
    message: 'Importación bloqueada: esta herramienta solo funciona en Vercel con GITHUB_BRANCH=main.',
  });
}
