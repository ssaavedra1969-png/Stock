// ============================================================
// lib/tickets/ocr.mjs
// Procesamiento de tickets 100% en el navegador.
//   PDF (File) -> pdf.js renderiza cada pagina a canvas
//              -> tesseract.js reconoce texto + palabras con coordenadas
//              -> extract.mjs arma el registro.
// Solo se ejecuta en el cliente (usa document/canvas).
// ============================================================
import { extractRecord } from './extract.mjs';

const RENDER_SCALE = 3;
const PDFJS_VERSION = '4.8.69';

let pdfjsPromise = null;
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc =
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

let tesseractModule = null;
async function getTesseract() {
  if (!tesseractModule) tesseractModule = await import('tesseract.js');
  return tesseractModule;
}

async function renderPdfPages(file) {
  const pdfjs = await getPdfjs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;
      pages.push({ canvas, width: canvas.width, height: canvas.height });
    }
  } finally {
    doc.destroy();
  }
  return pages;
}

async function recognizeFullPage(worker, canvas) {
  // PSM 6 (bloque uniforme) lee bien las dos paginas; PSM 3 por defecto
  // devolvia vacia la pagina 1 (remito del proveedor).
  const modes = ['6', '11', '3'];
  let best = { data: { text: '', words: [] } };
  for (const psm of modes) {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const res = await worker.recognize(canvas);
    if ((res.data.text || '').trim().length > (best.data.text || '').trim().length) best = res;
    if ((best.data.text || '').trim().length >= 80) break;
  }
  await worker.setParameters({ tessedit_pageseg_mode: '6' });
  return best.data;
}

async function buildExtractionPage(worker, { canvas, width, height }) {
  const data = await recognizeFullPage(worker, canvas);
  const words = (data.words || []).map((w) => ({ text: w.text, bbox: w.bbox }));
  return {
    text: data.text || '',
    words,
    width,
    height,
    async ocrRect(rect, psm, enhanced = false, useWhitelist = true) {
      // Recorta la zona pedida y la amplia 4x: mejora mucho lecturas
      // chicas como la patente (Chasis).
      const scale = 4;
      const cw = Math.max(1, Math.floor(rect.width));
      const ch = Math.max(1, Math.floor(rect.height));
      const off = document.createElement('canvas');
      off.width = cw * scale;
      off.height = ch * scale;
      const ctx = off.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      if (enhanced) ctx.filter = 'grayscale(100%) contrast(200%)';
      ctx.drawImage(canvas, rect.left, rect.top, cw, ch, 0, 0, off.width, off.height);
      ctx.filter = 'none';
      await worker.setParameters({
        tessedit_pageseg_mode: String(psm),
        tessedit_char_whitelist: useWhitelist ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.- ' : '',
      });
      const r = await worker.recognize(off);
      await worker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '' });
      return r.data.text || '';
    },
  };
}

// Procesa una lista de archivos PDF y devuelve el mismo formato que la
// antigua ruta /api/tickets (registros, errores, total, nuevos, ...).
export async function procesarArchivos(files, { onProgress, base } = {}) {
  const { createWorker } = await getTesseract();
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (onProgress && (m.status === 'recognizing text' || m.status === 'loading language traineddata')) {
        onProgress({ fase: m.status, progreso: m.progress || 0 });
      }
    },
  });

  const registros = [];
  const errores = [];
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (onProgress) onProgress({ archivo: file.name, index: i + 1, total: files.length });
      try {
        const rendered = await renderPdfPages(file);
        if (rendered.length < 2) throw new Error('El PDF no tiene 2 páginas');
        const pages = [];
        for (const p of rendered) pages.push(await buildExtractionPage(worker, p));
        const { rec } = await extractRecord({ fileName: file.name, pages, base });
        registros.push({ ...rec, Archivo: file.name, _file: file, Estado: 'NUEVO' });
      } catch (e) {
        errores.push({ archivo: file.name, error: String(e?.message || e) });
      }
    }
  } finally {
    await worker.terminate();
  }

  return {
    ok: true,
    registros,
    errores,
    total: files.length,
    nuevos: registros.length,
    duplicados: 0,
    similares: 0,
    alertas: [],
  };
}
