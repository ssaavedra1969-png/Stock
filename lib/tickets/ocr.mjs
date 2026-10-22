// ============================================================
// lib/tickets/ocr.mjs
// Procesamiento de tickets 100% en el navegador.
//   PDF (File) -> pdf.js renderiza cada pagina a canvas
//              -> tesseract.js reconoce texto + palabras con coordenadas
//              -> extract.mjs arma el registro.
// Solo se ejecuta en el cliente (usa document/canvas).
//
// Rendimiento:
//   - Pool de workers de Tesseract reutilizado entre tandas (evita recargar
//     el idioma en cada procesamiento).
//   - Los archivos se reparten entre los workers en paralelo.
//   - Cada recorte (ocrRect) se escala solo lo necesario segun su altura:
//     antes se ampliaba TODO 4x (incluso zonas grandes) y eso dominaba el
//     tiempo de reconocimiento.
// ============================================================
import { extractRecord } from './extract.mjs';

const RENDER_SCALE = 3;
const PDFJS_VERSION = '4.8.69';
// Altura objetivo (px) del recorte antes de pasarlo a Tesseract. Las zonas
// chicas (patente) se amplian hasta 4x; las grandes quedan a escala 1-2.
const CROP_TARGET_HEIGHT = 240;

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

function cropScale(height) {
  const h = Math.max(1, Math.floor(height));
  return Math.max(1, Math.min(4, Math.round(CROP_TARGET_HEIGHT / h)));
}

async function buildExtractionPage(worker, { canvas, width, height }) {
  const data = await recognizeFullPage(worker, canvas);
  const words = (data.words || []).map((w) => ({ text: w.text, bbox: w.bbox }));
  const cache = new Map();
  return {
    text: data.text || '',
    words,
    width,
    height,
    async ocrRect(rect, psm, enhanced = false, useWhitelist = true) {
      const key = [
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height),
        String(psm),
        enhanced ? '1' : '0',
        useWhitelist ? '1' : '0',
      ].join('|');
      if (cache.has(key)) return cache.get(key);

      const tarea = (async () => {
        const cw = Math.max(1, Math.floor(rect.width));
        const ch = Math.max(1, Math.floor(rect.height));
        // Escala adaptativa: suficiente resolucion, sin ampliar de mas.
        const scale = cropScale(ch);
        if (scale === 1) {
          // A escala 1 no hace falta copiar a otro canvas.
          await worker.setParameters({
            tessedit_pageseg_mode: String(psm),
            tessedit_char_whitelist: useWhitelist ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.- ' : '',
          });
          const r = await worker.recognize(canvas, {
            rectangle: {
              left: Math.floor(rect.left),
              top: Math.floor(rect.top),
              width: cw,
              height: ch,
            },
          });
          await worker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '' });
          return r.data.text || '';
        }

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
      })();

      cache.set(key, tarea);
      try {
        return await tarea;
      } catch (err) {
        cache.delete(key);
        throw err;
      }
    },
  };
}

// ------------------------------------------------------------
// Pool de workers + progreso por archivo
// ------------------------------------------------------------
function poolSize() {
  const hc =
    (typeof navigator !== 'undefined' && Number(navigator.hardwareConcurrency)) || 2;
  if (hc >= 8) return 3;
  if (hc >= 4) return 2;
  return 1;
}

let poolPromise = null;

async function getPool() {
  if (!poolPromise) {
    poolPromise = (async () => {
      const { createWorker } = await getTesseract();
      const n = poolSize();
      const active = new Array(n).fill(null);
      const workers = await Promise.all(
        Array.from({ length: n }, (_, i) =>
          createWorker('eng', 1, {
            logger: (m) => {
              const job = active[i];
              if (!job) return;
              if (m.status === 'recognizing text') {
                job.tracker.bump(m.progress || 0);
              } else if (m.status === 'loading language traineddata' || m.status === 'initializing api') {
                job.tracker.start('inicializando OCR');
              }
            },
          })
        )
      );
      return { workers, active };
    })().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

// Progreso monotono por archivo, mapeado a una franja (rango) de la barra.
function crearTracker({ index, total, archivo, onProgress }) {
  let valor = 0;
  let rango = [0, 1];
  let fase = 'en cola';
  const emitir = () => {
    if (!onProgress) return;
    onProgress({
      tipo: 'progreso',
      index,
      total,
      archivo,
      fase,
      progreso: Math.min(1, Math.max(0, valor)),
    });
  };
  return {
    start(nuevaFase, inicio) {
      fase = nuevaFase;
      if (typeof inicio === 'number') valor = Math.max(valor, inicio);
      emitir();
    },
    range(desde, hasta) {
      rango = [desde, hasta];
    },
    bump(frac) {
      const f = Number.isFinite(frac) ? frac : 0;
      valor = Math.max(valor, rango[0] + (rango[1] - rango[0]) * Math.min(1, Math.max(0, f)));
      emitir();
    },
    finish() {
      valor = 1;
      fase = 'completado';
      emitir();
    },
    fail() {
      fase = 'error';
      emitir();
    },
  };
}

// Procesa una lista de archivos PDF y devuelve el mismo formato que la
// antigua ruta /api/tickets (registros, errores, total, nuevos, ...).
// onProgress recibe eventos:
//   { tipo:'inicio', total, archivos }
//   { tipo:'progreso', index, total, archivo, fase, progreso }
//   { tipo:'archivo-ok' | 'archivo-error', index, total, archivo, error? }
//   { tipo:'fin', total, registros, errores }
export async function procesarArchivos(files, { onProgress, base } = {}) {
  const total = files.length;
  const archivos = files.map((f) => f.name);
  if (onProgress) onProgress({ tipo: 'inicio', total, archivos });

  const resultados = [];
  const errores = [];

  if (total > 0) {
    const { workers, active } = await getPool();
    let siguiente = 0;

    const correrWorker = async (w) => {
      for (;;) {
        const index = siguiente++;
        if (index >= total) return;
        const file = files[index];
        const archivo = file.name;
        const tracker = crearTracker({ index: index + 1, total, archivo, onProgress });
        active[w] = { tracker };
        tracker.start('preparando');
        try {
          const rendered = await renderPdfPages(file);
          if (rendered.length < 2) throw new Error('El PDF no tiene 2 páginas');

          tracker.start('leyendo página 1', 0.12);
          tracker.range(0.12, 0.48);
          const pages = [await buildExtractionPage(workers[w], rendered[0])];

          tracker.start('leyendo página 2', 0.48);
          tracker.range(0.48, 0.74);
          pages.push(await buildExtractionPage(workers[w], rendered[1]));

          tracker.start('extrayendo datos', 0.78);
          tracker.range(0.78, 0.98);
          const { rec } = await extractRecord({ fileName: archivo, pages, base });

          resultados.push({ index, registro: { ...rec, Archivo: archivo, _file: file, Estado: 'NUEVO' } });
          tracker.finish();
          if (onProgress) onProgress({ tipo: 'archivo-ok', index: index + 1, total, archivo });
        } catch (e) {
          const error = String(e?.message || e);
          errores.push({ index, error: { archivo, error } });
          tracker.fail();
          if (onProgress) onProgress({ tipo: 'archivo-error', index: index + 1, total, archivo, error });
        } finally {
          active[w] = null;
        }
      }
    };

    await Promise.all(workers.map((_, w) => correrWorker(w)));
    resultados.sort((a, b) => a.index - b.index);
    errores.sort((a, b) => a.index - b.index);
  }

  const registros = resultados.map((r) => r.registro);
  const erroresFinal = errores.map((e) => e.error);
  if (onProgress) {
    onProgress({ tipo: 'fin', total, registros: registros.length, errores: erroresFinal.length });
  }

  return {
    ok: true,
    registros,
    errores: erroresFinal,
    total,
    nuevos: registros.length,
    duplicados: 0,
    similares: 0,
    alertas: [],
  };
}
