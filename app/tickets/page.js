'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { revisarRegistro, parseNum, normalizeRemito } from '@/lib/tickets/extract.mjs';
import { MATERIALES, RAZONES_SOCIALES } from '@/lib/tickets/base.mjs';
import { CATALOGO_PRODUCTOS, normalizar } from '@/lib/productos';
import { evaluarCompletarManual } from '@/lib/importar-remitos-dev';
import EditorTicket from '@/components/EditorTicket';
import SectionHero from '@/components/SectionHero';
import {
  IconUpload,
  IconFileText,
  IconDownload,
  IconCheck,
  IconAlert,
  IconX,
  IconRefresh,
  IconPencil,
  IconTrash,
} from '@/components/Icons';

const CAMPOS = [
  'Fecha',
  'Proveedor',
  'N Remito',
  'Razon Social',
  'Material',
  'Neto',
  'Peso Neto',
  'Chofer',
  'Pat. Chasis',
  'Centro',
  'Carga',
];

const CENTROS = ['Lujan', 'Campana'];
const CARGAS = ['Entrada', 'Salida'];
const EDICIONES_KEY = 'falpat:tickets:ediciones';

const COLUMNAS_TABLA = [...CAMPOS, 'Archivo', 'Estado', 'Base de datos'];

function claveFechaOrden(valor) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(valor || ''));
  if (!m) return 0;
  return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
}

function claveNumeroOrden(valor) {
  const s = String(valor ?? '').trim();
  if (!s || s.toUpperCase() === 'N/D') return -Infinity;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : -Infinity;
}

function compararRegistros(a, b, campo) {
  if (campo === 'Centro' || campo === 'Carga' || campo === 'Base de datos') return 0;
  if (campo === 'Fecha') return claveFechaOrden(a.Fecha) - claveFechaOrden(b.Fecha);
  if (campo === 'Neto' || campo === 'Peso Neto') {
    return claveNumeroOrden(a[campo]) - claveNumeroOrden(b[campo]);
  }
  return String(a[campo] ?? '').localeCompare(String(b[campo] ?? ''), 'es', {
    numeric: true,
    sensitivity: 'base',
  });
}

function sinDato(valor) {
  const v = valor === undefined || valor === null ? '' : String(valor).trim();
  return v === '' || v.toUpperCase() === 'N/D';
}

function claveRemitoEntrada(proveedor, remito) {
  const supplier = normalizar(proveedor);
  const number = normalizeRemito(remito)?.toUpperCase();
  return supplier && number ? `${supplier}|${number}` : '';
}

function camposVaciosParaCompletar(existing, incoming) {
  const labels = {
    fechaRemito: 'Fecha',
    producto: 'Material',
    codigoProducto: 'Código',
    patente: 'Patente',
    chofer: 'Chofer',
    nroRemitoProveedor: 'Remito proveedor',
    pesoProveedor: 'Neto proveedor',
    pesoBalanza: 'Peso neto',
    planta: 'Centro',
    proveedor: 'Proveedor',
    razonSocial: 'Razón social',
  };
  return Object.keys(labels).filter(
    (field) => sinDato(existing[field]) && !sinDato(incoming[field])
  ).map((field) => labels[field]);
}

function toneladasDesdeKg(value) {
  const kilograms = parseNum(value);
  if (kilograms === null) return '';
  return `${(kilograms / 1000).toFixed(3).replace(/\.?0+$/, '')} tn`;
}

function valorImportableDesdeKg(value) {
  const kilograms = parseNum(value);
  return kilograms === null ? '' : Number((kilograms / 1000).toFixed(3));
}

function fechaIsoDesdeTicket(value) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value || '').trim());
  if (!match) return '';
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) return '';
  return date.toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

function entradaDesdeTicket(record, centro) {
  const product = String(record.Material || '').trim();
  const exactCode =
    CATALOGO_PRODUCTOS.find((item) => item.codigo && normalizar(item.nombre) === normalizar(product))
      ?.codigo || '';
  return {
    carga: 'Entrada',
    producto: product,
    codigoProducto: exactCode,
    fechaRemito: fechaIsoDesdeTicket(record.Fecha),
    patente: String(record['Pat. Chasis'] || '').trim().toUpperCase(),
    chofer: String(record.Chofer || '').trim(),
    nroRemitoProveedor: String(record['N Remito'] || '').trim(),
    nroRemitoFalpat: '',
    pesoProveedor: toneladasDesdeKg(record.Neto),
    pesoBalanza: toneladasDesdeKg(record['Peso Neto']),
    planta: centro,
    proveedor: String(record.Proveedor || '').trim(),
    cliente: '',
    razonSocial: String(record['Razon Social'] || '').trim(),
    archivoOrigen: String(record.Archivo || '').trim(),
  };
}

function keyConciliacion(record, existing) {
  return `${record.Archivo || record['N Remito'] || ''}|${existing.id}`;
}

function tieneFaltantes(registro) {
  return Object.keys(revisarRegistro(registro)).length > 0;
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ahora() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function ordenarPorFecha(registros) {
  return [...registros].sort((a, b) => {
    const fa = String(a.Fecha || a.fecha || '');
    const fb = String(b.Fecha || b.fecha || '');
    return fa.localeCompare(fb);
  });
}

export default function TicketsPage() {
  const {
    showToast,
    records: movimientosDb,
    tickets,
    procesarTickets,
    limpiarTickets,
    guardarBase,
    agregarMateriales,
    agregarRazonesSociales,
    agregarChoferes,
    agregarPatentes,
    baseConocimiento,
    reload,
  } = useApp();
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [registrosEditados, setRegistrosEditados] = useState([]);
  const [huboEdiciones, setHuboEdiciones] = useState(false);
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [editandoIdx, setEditandoIdx] = useState(null);
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [incorporando, setIncorporando] = useState(false);
  const [centro, setCentro] = useState('');
  const [carga, setCarga] = useState('');
  const [carpeta, setCarpeta] = useState(null); // { handle, nombre } — carpeta STOCK
  const [eligiendoCarpeta, setEligiendoCarpeta] = useState(false);
  const [leyendoEntrada, setLeyendoEntrada] = useState(false);
  const [clavesPlanilla, setClavesPlanilla] = useState(null); // Set "Proveedor|Remito" del historial
  const [mostrarModalDuplicados, setMostrarModalDuplicados] = useState(false);
  const [confirmacionVisual, setConfirmacionVisual] = useState(false);
  const [guardandoAprendizaje, setGuardandoAprendizaje] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [orden, setOrden] = useState({ campo: '', dir: 'asc' });
  const [selectedDbMatches, setSelectedDbMatches] = useState([]);
  const [devEnvironment, setDevEnvironment] = useState(null);
  const isProductionVercel =
    devEnvironment?.environment === 'vercel' && devEnvironment?.branch === 'main';
  const opcionesMaterial = useMemo(
    () => [...new Set([...MATERIALES, ...(baseConocimiento?.materiales || [])])],
    [baseConocimiento]
  );
  const opcionesRazon = useMemo(
    () => [...new Set([...RAZONES_SOCIALES, ...(baseConocimiento?.razonesSociales || [])])],
    [baseConocimiento]
  );
  const progresoRef = useRef(null);
  const progresoFlush = useRef(null);

  useEffect(() => {
    let active = true;
    fetch('/api/db/import-tickets-dev')
      .then(async (response) => {
        const data = await response.json();
        if (active) setDevEnvironment({ ...data, status: response.status });
      })
      .catch((cause) => {
        if (active) setDevEnvironment({ enabled: false, error: cause.message });
      });
    return () => {
      active = false;
    };
  }, []);

  // Recupera ediciones pendientes (por ejemplo, si el guardado falló y se
  // recargó la página). Se guardan sin el File del PDF, que no es serializable.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(EDICIONES_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data?.registrosEditados) && data.registrosEditados.length) {
        setRegistrosEditados(data.registrosEditados);
        setHuboEdiciones(true);
      }
      if (typeof data?.centro === 'string') setCentro(data.centro);
      if (typeof data?.carga === 'string') setCarga(data.carga);
    } catch {
      // storage no disponible: se ignora
    }
  }, []);

  useEffect(() => {
    if (!huboEdiciones || registrosEditados.length === 0) return;
    try {
      const limpios = registrosEditados.map(({ _file, ...r }) => r);
      sessionStorage.setItem(
        EDICIONES_KEY,
        JSON.stringify({ registrosEditados: limpios, centro, carga })
      );
    } catch {
      // storage lleno o no disponible: se ignora
    }
  }, [registrosEditados, huboEdiciones, centro, carga]);

  useEffect(() => () => {
    if (progresoFlush.current) clearTimeout(progresoFlush.current);
  }, []);

  const onProgreso = useCallback((evento) => {
    const prev = progresoRef.current;
    if (evento.tipo === 'inicio') {
      progresoRef.current = {
        total: evento.total || 0,
        archivos: evento.archivos || [],
        items: (evento.archivos || []).map((nombre) => ({
          archivo: nombre,
          estado: 'pendiente',
          progreso: 0,
          fase: 'en cola',
        })),
        terminado: false,
      };
    } else if (prev) {
      const idx = Math.max(0, (evento.index || 1) - 1);
      const items = [...prev.items];
      const actual = items[idx] || { archivo: evento.archivo, progreso: 0 };
      if (evento.tipo === 'progreso') {
        items[idx] = {
          ...actual,
          archivo: evento.archivo || actual.archivo,
          estado: 'procesando',
          progreso: evento.progreso || 0,
          fase: evento.fase || actual.fase,
        };
      } else if (evento.tipo === 'archivo-ok') {
        items[idx] = { ...actual, estado: 'ok', progreso: 1, fase: 'completado' };
      } else if (evento.tipo === 'archivo-error') {
        items[idx] = { ...actual, estado: 'error', fase: 'error', error: evento.error };
      } else if (evento.tipo === 'fin') {
        progresoRef.current = { ...prev, items: prev.items, terminado: true };
        if (!progresoFlush.current) {
          progresoFlush.current = setTimeout(() => {
            progresoFlush.current = null;
            setProgreso(progresoRef.current);
          }, 60);
        }
        return;
      } else {
        return;
      }
      progresoRef.current = { ...prev, items };
    } else {
      return;
    }

    if (!progresoFlush.current) {
      progresoFlush.current = setTimeout(() => {
        progresoFlush.current = null;
        setProgreso(progresoRef.current);
      }, 120);
    }
  }, []);

  const procesando = tickets.procesando;
  const resultado = tickets.resultado;
  const errorMsg = tickets.error;

  const registros = useMemo(() => {
    const lista = huboEdiciones ? registrosEditados : resultado?.registros || [];
    const claves = clavesPlanilla;
    const registrosBase = lista.map((r) => {
      const key = claveRemitoEntrada(r.Proveedor, r['N Remito']);
      const entradaDb = centro ? entradaDesdeTicket(r, centro) : null;
      const matches = key
        ? movimientosDb.filter(
            (record) =>
              record.carga === 'Entrada' &&
              claveRemitoEntrada(record.proveedor, record.nroRemitoProveedor) === key
          )
        : [];
      const datosEnriquecimiento =
        matches.length === 1 && entradaDb
          ? evaluarCompletarManual(matches[0], entradaDb)
          : { completar: {}, conflictos: [] };
      return {
        ...r,
        Estado: claves
          ? claves.has(`${r.Proveedor || ''}|${r['N Remito'] || ''}`)
            ? 'DUPLICADO'
            : 'NUEVO'
          : r.Estado,
        EntradaDb: entradaDb,
        CoincidenciasBase: matches,
        CamposACompletar: matches.length === 1 && entradaDb
          ? camposVaciosParaCompletar(matches[0], entradaDb)
          : [],
        ConflictosBase: datosEnriquecimiento.conflictos,
      };
    });
    const conEstado = registrosBase;
    const ordenados = ordenarPorFecha(conEstado);
    if (!orden.campo) return ordenados;
    const factor = orden.dir === 'asc' ? 1 : -1;
    return [...ordenados].sort((a, b) => factor * compararRegistros(a, b, orden.campo));
  }, [resultado, registrosEditados, huboEdiciones, clavesPlanilla, movimientosDb, centro, orden]);

  const registrosVisibles = useMemo(
    () => (soloPendientes ? registros.filter((r) => tieneFaltantes(r)) : registros),
    [registros, soloPendientes]
  );

  const nNuevos = useMemo(() => registros.filter((r) => r.Estado !== 'DUPLICADO').length, [registros]);
  const nDuplicados = registros.length - nNuevos;
  const registrosConObservaciones = useMemo(
    () => registros.filter((r) => Object.keys(revisarRegistro(r)).length > 0),
    [registros]
  );
  const pendientesDetalle = useMemo(
    () =>
      registros
        .map((r) => ({
          archivo: r.Archivo,
          campos: Object.keys(revisarRegistro(r)),
        }))
        .filter((p) => p.campos.length > 0),
    [registros]
  );
  const erroresLectura = resultado?.errores || [];

  const alertas = useMemo(() => {
    if (!resultado) return [];
    return registros.filter((r) => r.Estado === 'DUPLICADO');
  }, [resultado, registros]);
  const coincidenciasBase = useMemo(
    () => registros.filter((registro) => registro.CoincidenciasBase?.length > 0),
    [registros]
  );
  const registrosPdfYaCargados = useMemo(
    () => registros.filter((registro) => registro.CoincidenciasBase?.some(
      (match) => match.origenCarga === 'pdf' || match.enriquecidoPorPdf
    )),
    [registros]
  );
  const coincidenciasSinResolver = useMemo(
    () => registros.filter((registro) => {
      if (registro.CoincidenciasBase?.length > 1) return true;
      if (registro.CoincidenciasBase?.length !== 1) return false;
      const match = registro.CoincidenciasBase[0];
      if (match.origenCarga === 'pdf' || match.enriquecidoPorPdf) return false;
      if (!registro.CamposACompletar.length) return false;
      const key = keyConciliacion(registro, match);
      return !selectedDbMatches.includes(key);
    }),
    [registros, selectedDbMatches]
  );
  const registrosNuevosDb = useMemo(
    () => registros.filter((registro) =>
      registro.CoincidenciasBase?.length === 0 && registro.Estado !== 'DUPLICADO'
    ),
    [registros]
  );

  function addFiles(lista) {
    const nuevos = Array.from(lista).filter((f) => /\.pdf$/i.test(f.name));
    if (nuevos.length === 0) {
      showToast('Solo se aceptan archivos PDF', 'error');
      return;
    }
    setFiles((prev) => {
      const vistos = new Set(prev.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
      const merge = [...prev];
      for (const f of nuevos) {
        const k = `${f.name}|${f.size}|${f.lastModified}`;
        if (!vistos.has(k)) {
          vistos.add(k);
          merge.push(f);
        }
      }
      return merge;
    });
  }

  function onInput(event) {
    addFiles(event.target.files);
    if (inputRef.current) inputRef.current.value = '';
  }

  function onDrop(event) {
    event.preventDefault();
    setArrastrando(false);
    if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
  }

  useEffect(() => {
    if (files.length === 0 || procesando) return;
    procesar();
  }, [files]);

  useEffect(() => {
    if (alertas.length > 0) {
      setMostrarModalDuplicados(true);
    }
  }, [alertas]);

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // Abre el PDF del archivo leído directamente desde el navegador (funciona
  // en cualquier PC de la red sin depender del servidor). Si no tenemos el
  // File en memoria, cae al endpoint del servidor como respaldo.
  function abrirPdf(archivo, event) {
    const file = files.find((f) => f.name === archivo);
    if (!file) return;
    event.preventDefault();
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }


  function limpiar() {
    setFiles([]);
    limpiarTickets();
    progresoRef.current = null;
    setProgreso(null);
    setRegistrosEditados([]);
    setHuboEdiciones(false);
    setEditandoIdx(null);
    setSoloPendientes(false);
    setCentro('');
    setCarga('');
    setConfirmacionVisual(false);
    setSelectedDbMatches([]);
    try {
      sessionStorage.removeItem(EDICIONES_KEY);
    } catch {
      // storage no disponible
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  async function descargarExcelParaImportar() {
    if (erroresLectura.length > 0 || registrosConObservaciones.length > 0) {
      showToast('Corregí los campos pendientes antes de descargar el Excel.', 'error');
      return;
    }
    if (!centro || carga !== 'Entrada') {
      showToast('Seleccioná el Centro y confirmá Carga = Entrada antes de descargar.', 'error');
      return;
    }

    setExportandoExcel(true);
    try {
      const XLSX = await import('xlsx');
      const headers = [
        'REMITOS',
        'OBSERVACION',
        'FECHA',
        'CODIGO DEL PRODUCTO',
        'DESCRIPCION',
        'CANTIDAD KG',
        'CENTRO DE DISTRIBUCION',
        'NETO',
        'CHOFER',
        'PAT. CHASIS',
        'RAZON SOCIAL',
      ];
      const exportables = registros.filter((record) => record.Estado !== 'DUPLICADO');
      if (exportables.length === 0) {
        throw new Error('No hay Entradas nuevas para descargar.');
      }

      const rows = exportables.map((record) =>
        [
          record['N Remito'] ?? '',
          record.Proveedor ?? '',
          record.Fecha ?? '',
          CATALOGO_PRODUCTOS.find(
            (item) => item.codigo && normalizar(item.nombre) === normalizar(record.Material)
          )?.codigo || '',
          record.Material ?? '',
          valorImportableDesdeKg(record['Peso Neto']),
          centro,
          valorImportableDesdeKg(record.Neto),
          record.Chofer ?? '',
          record['Pat. Chasis'] ?? '',
          record['Razon Social'] ?? '',
        ]
      );
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      worksheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'CARGA');
      XLSX.writeFile(workbook, `Remitos-Entradas-Importar-${ahora()}.xlsx`);
      showToast(`Excel listo para Importar Excel · ${exportables.length} Entrada(s)${registros.length > exportables.length ? ` · ${registros.length - exportables.length} duplicado(s) omitido(s)` : ''}`);
    } catch (err) {
      showToast(err.message || 'No se pudo generar el Excel corregido.', 'error');
    } finally {
      setExportandoExcel(false);
    }
  }

  async function elegirCarpeta() {
    setEligiendoCarpeta(true);
    try {
      const {
        soportaCarpetas,
        elegirCarpetaServidor,
        prepararCarpeta,
        buscarSubcarpetaStock,
        leerPlanillaDeCarpeta,
        clavesDeFilas,
      } = await import('@/lib/tickets/archivo.mjs');
      if (!soportaCarpetas()) {
        showToast('Este navegador no permite elegir carpetas. Usá Chrome o Edge.', 'error');
        return;
      }
      let handle = await elegirCarpetaServidor();
      let info = await prepararCarpeta(handle);
      let nota = '';
      // Si eligió la carpeta que contiene a STOCK (por ejemplo la carpeta del
      // proyecto), buscamos la subcarpeta que sí tiene Entrada y procesados.
      if (!info.esStock) {
        const hija = await buscarSubcarpetaStock(handle);
        if (hija) {
          handle = hija;
          info = await prepararCarpeta(handle);
          nota = ` (la carpeta STOCK estaba dentro: ${handle.name})`;
        }
      }
      if (!info.esStock) {
        const faltan = Object.entries(info.faltantes)
          .filter(([, falta]) => falta)
          .map(([nombre]) => nombre)
          .join(', ');
        const encontradas = info.subcarpetas.length
          ? info.subcarpetas.join(', ')
          : 'ninguna subcarpeta';
        throw new Error(
          `Elegiste "${handle.name}", pero no es la carpeta STOCK: faltan ${faltan}. Subcarpetas encontradas: ${encontradas}. Elegí la carpeta que contiene Entrada y procesados (y Salida).`
        );
      }
      setCarpeta({ handle, nombre: handle.name });
      const { rows } = await leerPlanillaDeCarpeta(handle);
      setClavesPlanilla(clavesDeFilas(rows && rows.length ? rows : [CAMPOS]));
      showToast(`Carpeta STOCK lista: ${handle.name}${nota} · el Excel se actualiza solo al confirmarlo`);
    } catch (err) {
      if (err?.name !== 'AbortError') showToast(err.message || 'No se pudo abrir la carpeta', 'error');
    } finally {
      setEligiendoCarpeta(false);
    }
  }

  async function leerEntrada() {
    if (!carpeta?.handle) {
      showToast('Elegí primero la carpeta STOCK', 'error');
      return;
    }
    setLeyendoEntrada(true);
    try {
      const { leerPdfDeEntrada } = await import('@/lib/tickets/archivo.mjs');
      const pdfs = await leerPdfDeEntrada(carpeta.handle);
      if (pdfs.length === 0) {
        showToast('No hay archivos PDF en Entrada', 'error');
        return;
      }
      addFiles(pdfs);
      showToast(`${pdfs.length} PDF(s) de Entrada listos para lectura`);
    } catch (err) {
      showToast(err.message || 'No se pudieron leer los PDF de Entrada', 'error');
    } finally {
      setLeyendoEntrada(false);
    }
  }

  async function procesar() {
    if (files.length === 0) return;
    setRegistrosEditados([]);
    setHuboEdiciones(false);
    try {
      sessionStorage.removeItem(EDICIONES_KEY);
    } catch {
      // storage no disponible
    }
    setEditandoIdx(null);
    setSelectedDbMatches([]);
    progresoRef.current = {
      total: files.length,
      archivos: files.map((f) => f.name),
      items: files.map((f) => ({ archivo: f.name, estado: 'pendiente', progreso: 0, fase: 'en cola' })),
      terminado: false,
    };
    setProgreso(progresoRef.current);
    try {
      const data = await procesarTickets(files, { onProgress: onProgreso });
      const nuevos = data.nuevos ?? 0;
      const dup = data.duplicados ?? 0;
      showToast(`Procesado: ${nuevos} nuevo(s), ${dup} duplicado(s)`);
    } catch {
      showToast('Error al procesar los remitos', 'error');
    }
  }

  function iniciarEdicion(idx) {
    setConfirmacionVisual(false);
    setEditandoIdx(idx);
  }

  function cancelarEdicion() {
    setEditandoIdx(null);
  }

  function cambiarOrden(campo) {
    setEditandoIdx(null);
    setOrden((prev) =>
      prev.campo === campo
        ? { campo, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { campo, dir: 'asc' }
    );
  }

  // Helper: convertir Neto/Peso Neto a numero puro (kilos) para sumar en Excel.
  // Usa parseNum, que respeta el formato argentino: punto = miles, coma = decimal.
  function normalizarNumero(valor) {
    if (valor === '' || valor === null || valor === undefined) return '';
    const num = parseNum(valor);
    return num == null ? valor : num;
  }

  // Llamada desde el EditorTicket: recibe el formulario completo.
  async function guardarEdicion(form, irSiguiente) {
    // Normalizar Neto y Peso Neto a numeros puros (kilos) antes de guardar
    const formNormalizado = {
      ...form,
      Neto: normalizarNumero(form.Neto),
      'Peso Neto': normalizarNumero(form['Peso Neto']),
    };
    setRegistrosEditados((prev) => {
      const base = resultado?.registros || [];
      const lista = prev.length > 0 ? [...prev] : [...base];
      const revision = { ...(form._revision || {}) };
      for (const campo of Object.keys(formNormalizado)) delete revision[campo];
      const editado = { ...formNormalizado, _revision: revision };
      if (Object.keys(revision).length === 0) delete editado._revision;
      const indiceReal = lista.findIndex((r) => r.Archivo === editado.Archivo);
      if (indiceReal >= 0) lista[indiceReal] = editado;
      return lista;
    });
    setConfirmacionVisual(false);
    setSelectedDbMatches([]);
    setHuboEdiciones(true);
    if (irSiguiente && editandoIdx < registrosVisibles.length - 1) {
      setEditandoIdx(editandoIdx + 1);
    } else {
      setEditandoIdx(null);
    }

    const material = String(form.Material || '').trim();
    const materialNuevo =
      material &&
      !opcionesMaterial.some(
        (m) => String(m).trim().toLowerCase() === material.toLowerCase()
      );
    if (materialNuevo) {
      try {
        await agregarMateriales([material]);
        showToast(`Registro actualizado · Material "${material}" agregado a la lista`);
      } catch (err) {
        showToast(
          `Registro actualizado, pero no se pudo agregar "${material}" a la lista: ${
            err.message || 'error de conexión'
          }`,
          'error'
        );
      }
    } else {
      showToast('Registro actualizado');
    }

    const razonSocial = String(form['Razon Social'] || '').trim();
    const razonSocialNueva =
      razonSocial &&
      !opcionesRazon.some(
        (r) => String(r).trim().toLowerCase() === razonSocial.toLowerCase()
      );
    if (razonSocialNueva) {
      try {
        await agregarRazonesSociales([razonSocial]);
        showToast(
          `Registro actualizado · Razón social "${razonSocial}" agregada a la lista`
        );
      } catch (err) {
        showToast(
          `Registro actualizado, pero no se pudo agregar "${razonSocial}" a la lista: ${
            err.message || 'error de conexión'
          }`,
          'error'
        );
      }
    }

    const chofer = String(form.Chofer || '').trim();
    const choferApellido = chofer.split(/\s+/)[0].toUpperCase();
    const choferesBase = baseConocimiento?.choferes || {};
    const choferConocido =
      !!choferesBase[choferApellido] ||
      Object.values(choferesBase).some(
        (nombre) => String(nombre).trim().toUpperCase() === chofer.toUpperCase()
      );
    if (chofer && !choferConocido) {
      try {
        await agregarChoferes([chofer]);
        showToast(`Registro actualizado · Chofer "${chofer}" agregado a la lista`);
      } catch (err) {
        showToast(
          `Registro actualizado, pero no se pudo agregar "${chofer}" a la lista: ${
            err.message || 'error de conexión'
          }`,
          'error'
        );
      }
    }

    const patChasis = String(form['Pat. Chasis'] || '').trim().toUpperCase();
    const patentesBase = Object.values(baseConocimiento?.patentes || {})
      .flat()
      .map((p) => String(p).toUpperCase());
    if (patChasis && !patentesBase.includes(patChasis)) {
      try {
        await agregarPatentes([{ chofer, patente: patChasis }]);
        showToast(`Registro actualizado · Patente "${patChasis}" agregada a la lista`);
      } catch (err) {
        showToast(
          `Registro actualizado, pero no se pudo agregar "${patChasis}" a la lista: ${
            err.message || 'error de conexión'
          }`,
          'error'
        );
      }
    }
  }

  function eliminarRegistro(archivo) {
    setRegistrosEditados((prev) => {
      const base = resultado?.registros || [];
      const lista = prev.length > 0 ? [...prev] : [...base];
      const indiceReal = lista.findIndex((r) => r.Archivo === archivo);
      if (indiceReal >= 0) lista.splice(indiceReal, 1);
      return lista;
    });
    setConfirmacionVisual(false);
    setHuboEdiciones(true);
    showToast('Registro eliminado');
  }

  async function confirmarRevision(checked) {
    if (!checked) {
      setConfirmacionVisual(false);
      return;
    }
    setConfirmacionVisual(true);
    if (!devEnvironment?.enabled || !resultado) return;
    if (guardandoAprendizaje) return;

    setGuardandoAprendizaje(true);
    try {
      const filas = registros.map((r) => ({
        ...Object.fromEntries(CAMPOS.map((c) => [c, r[c]])),
        Archivo: r.Archivo,
      }));
      const originales = new Map((resultado.registros || []).map((r) => [r.Archivo, r]));
      const camposCorregibles = CAMPOS.filter((c) => !['Proveedor', 'Centro', 'Carga'].includes(c));
      const correcciones = registros.flatMap((corregido) => {
        const original = originales.get(corregido.Archivo);
        if (!original) return [];
        const cambios = Object.fromEntries(
          camposCorregibles
            .filter((campo) => String(original[campo] ?? '').trim() !== String(corregido[campo] ?? '').trim())
            .map((campo) => [campo, { de: original[campo], a: corregido[campo] }])
        );
        return Object.keys(cambios).length ? [{ original, corregido, cambios }] : [];
      });
      const data = await guardarBase(filas, correcciones);
      const learned = data.aprendidos || {};
      showToast(
        `Revisión confirmada · base de lectura actualizada (${learned.tickets || 0} remitos, ${learned.reglas || 0} reglas)`
      );
    } catch (err) {
      showToast(
        `Revisión confirmada. No se pudo actualizar la base de lectura (${err.message || 'error de conexión'}); podés incorporar igual.`,
        'error'
      );
    } finally {
      setGuardandoAprendizaje(false);
    }
  }

  async function incorporar() {
    if (registros.length === 0) return;
    if (erroresLectura.length > 0) {
      showToast('Resolvé los errores de lectura o quitá esos PDF antes de incorporar', 'error');
      return;
    }
    if (registrosConObservaciones.length > 0) {
      showToast('Revisá y corregí todos los campos marcados antes de incorporar', 'error');
      return;
    }
    if (!confirmacionVisual) {
      showToast('Confirmá que revisaste cada registro contra su PDF original', 'error');
      return;
    }
    if (!centro || !carga) {
      showToast('Seleccioná el Centro y la Carga antes de incorporar', 'error');
      return;
    }
    if (carga !== 'Entrada') {
      showToast('La incorporación de remitos de Salida todavía no está habilitada.', 'error');
      return;
    }
    if (!devEnvironment?.enabled) {
      showToast('La escritura está bloqueada: esta función solo opera localmente en la rama dev.', 'error');
      return;
    }
    if (coincidenciasSinResolver.length > 0) {
      showToast('Resolvé las coincidencias con la base o quitá esos registros antes de incorporar.', 'error');
      return;
    }
    const reconciliations = registros
      .filter((record) => record.CoincidenciasBase?.length === 1)
      .filter((record) => {
        const existing = record.CoincidenciasBase[0];
        return selectedDbMatches.includes(keyConciliacion(record, existing));
      })
      .map((record) => ({
        id: record.CoincidenciasBase[0].id,
        record: record.EntradaDb,
      }));
    const recordsToSave = registrosNuevosDb.map((record) => record.EntradaDb);
    if (recordsToSave.length === 0 && reconciliations.length === 0) {
      showToast('No hay Entradas nuevas ni coincidencias seleccionadas para completar.', 'error');
      return;
    }
    const accepted = window.confirm(
      `¿Confirmás guardar ${recordsToSave.length} Entrada(s) nueva(s) y completar ${reconciliations.length} registro(s) existentes en la base de desarrollo? No se modificará el Excel ni se moverá ningún PDF.`
    );
    if (!accepted) return;

    setIncorporando(true);
    try {
      const response = await fetch('/api/db/import-tickets-dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmar: true,
          records: recordsToSave,
          reconciliations,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
      await reload();
      showToast(
        `${data.insertados} Entrada(s) nueva(s) agregada(s) · ${data.actualizados} movimiento(s) completado(s) en dev · total ${data.total}`
      );
      limpiar();
    } catch (err) {
      showToast(err.message || 'Error al incorporar en desarrollo', 'error');
    } finally {
      setIncorporando(false);
    }
  }

  const hayResultado = !!resultado;

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <SectionHero
        icon={IconFileText}
        title="Cargar Entrada desde PDF"
        tag="Lectura de remitos"
        subtitle="Leé y corregí los remitos; después descargá el Excel para importarlos a producción"
      >
        {(files.length > 0 || hayResultado) && (
          <button type="button" onClick={limpiar} className="btn-ghost !px-3 !py-1.5 !text-xs" disabled={procesando}>
            <IconRefresh className="h-3.5 w-3.5" />
            Nueva
          </button>
        )}
      </SectionHero>

      {/* Paso 1 — Cargar los remitos */}
      <Paso
        n="1"
        titulo="Cargá los remitos"
        ayuda="Arrastrá PDF, elegí archivos o seleccioná la carpeta STOCK para leer los PDF de Entrada y consultar duplicados en el histórico."
      >
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={onDrop}
          data-drag={arrastrando}
          className="omx-dropzone flex items-center justify-center gap-3 px-4 py-4 text-center transition"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            onChange={onInput}
            className="hidden"
            disabled={procesando}
          />
          <IconFileText className="h-5 w-5 text-falpat" />
          <span className="text-xs text-slate-300">
            Arrastrá PDF acá o{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-falpat-soft underline hover:text-falpat"
              disabled={procesando}
            >
              elegí archivos
            </button>
          </span>
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span
                key={`${f.name}-${f.size}-${i}`}
                className="omx-chip inline-flex items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-300"
              >
                <IconFileText className="h-3 w-3 text-falpat-soft" />
                <span className="max-w-[120px] truncate">{f.name}</span>
                <span className="font-mono text-[10px] text-slate-500">{fmtBytes(f.size)}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={procesando}
                  className="text-slate-500 hover:text-red-300"
                >
                  <IconX className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
            <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </Paso>

      {/* Paso 2 — Revisar y completar */}
      <Paso
        n="2"
        titulo="Revisá y completá"
        ayuda="Elegí STOCK y el Centro y la Carga. Revisá que los datos leídos sean correctos."
      >
        <div className="space-y-2 border-t border-white/5 pt-3 mb-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={elegirCarpeta}
              disabled={eligiendoCarpeta}
              className="btn-ghost !px-3 !py-1.5 !text-xs"
            >
              <IconUpload className="h-3.5 w-3.5" />
              {eligiendoCarpeta ? 'Abriendo…' : carpeta ? 'Cambiar STOCK' : 'Elegir carpeta STOCK'}
            </button>
            <button
              type="button"
              onClick={leerEntrada}
              disabled={!carpeta || leyendoEntrada || procesando}
              className="btn-ghost !px-3 !py-1.5 !text-xs"
            >
              <IconFileText className="h-3.5 w-3.5" />
              {leyendoEntrada ? 'Leyendo Entrada…' : 'Leer PDFs de Entrada'}
            </button>
            <span className="text-[11px] text-slate-400">
              {carpeta ? (
                <>
                  STOCK: <span className="font-mono text-slate-200">{carpeta.nombre}</span> ·
                  {clavesPlanilla ? `${clavesPlanilla.size} registro(s) de referencia en el histórico (solo lectura)` : ''}
                </>
              ) : (
                <>
                  Elegí la carpeta <span className="font-mono text-slate-300">STOCK</span> (la que tiene{' '}
                  <span className="font-mono text-slate-300">Entrada</span>,{' '}
                  <span className="font-mono text-slate-300">Salida</span> y{' '}
                  <span className="font-mono text-slate-300">procesados</span>).
                </>
              )}
            </span>
          </div>
        </div>

        {/* Centro y Carga */}
        <div className="flex flex-wrap items-end gap-4">
          <label className="block w-44">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Centro <span className="text-red-400">*</span>
            </span>
            <select
              value={centro}
              onChange={(e) => setCentro(e.target.value)}
              className="field !py-2 text-xs"
            >
              <option value="">Elegí…</option>
              {CENTROS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block w-44">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Carga <span className="text-red-400">*</span>
            </span>
            <select
              value={carga}
              onChange={(e) => setCarga(e.target.value)}
              className="field !py-2 text-xs"
            >
              <option value="">Elegí…</option>
              {CARGAS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <p className="mb-2 text-[11px] text-slate-500">
            {centro && carga
              ? carga === 'Entrada'
                ? <span className="text-emerald-400">Entrada lista para revisar e incorporar solo en desarrollo</span>
                : <span className="text-amber-300">La incorporación de remitos de Salida todavía no está habilitada</span>
              : <span className="text-amber-400">Obligatorio para incorporar</span>}
          </p>
        </div>

        {/* Resultado */}
        {hayResultado && (
          <div className="space-y-3 border-t border-white/5 pt-3">
          <div className="grid grid-cols-6 gap-1.5">
            <Stat label="Archivos" value={resultado.total ?? 0} cls="text-slate-100" />
            <Stat label="Nuevos" value={nNuevos} cls="text-emerald-400" />
            <Stat label="Duplicados" value={nDuplicados} cls="text-amber-400" />
            <Stat label="Similares" value={resultado.similares ?? 0} cls="text-falpat-soft" />
            <Stat label="Revisar" value={registrosConObservaciones.length} cls={registrosConObservaciones.length ? 'text-red-400' : 'text-emerald-400'} />
            <Stat label="Errores" value={erroresLectura.length} cls={erroresLectura.length ? 'text-red-400' : 'text-slate-400'} />
          </div>

          {alertas.length > 0 && !mostrarModalDuplicados && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-100">
              <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{alertas.length} remito(s) ya existían en el historial.</span>
            </div>
          )}

          {coincidenciasBase.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-sky-400/30 bg-sky-400/[0.08] p-2 text-xs text-sky-100">
              <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Se encontraron {coincidenciasBase.length} posible(s) coincidencia(s) con la base de movimientos.
                Revisá la columna «Base de datos»: diferencia cargas manuales identificadas, registros antiguos
                sin origen y remitos ya incorporados desde PDF. El escaneo no modifica esos registros.
              </span>
            </div>
          )}

          {(resultado.alertas || []).length > 0 && (
            <details className="omx-info rounded-lg border p-2 text-xs">
              <summary className="cursor-pointer font-semibold uppercase tracking-wider">
                Similares ({(resultado.alertas || []).length})
              </summary>
              <ul className="mt-1 space-y-0.5 pl-2">
                {(resultado.alertas || []).map((a, i) => (
                  <li key={i} className="font-mono text-[11px]">
                    {a.archivo} · {a.campo}: &ldquo;{a.valor}&rdquo; ~ &ldquo;{a.similar_a}&rdquo; ({a.ratio})
                  </li>
                ))}
              </ul>
            </details>
          )}

          {(resultado.errores || []).length > 0 && (
            <details className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">
              <summary className="cursor-pointer font-semibold uppercase tracking-wider text-red-300">
                Errores ({(resultado.errores || []).length})
              </summary>
              <ul className="mt-1 space-y-0.5 pl-2">
                {(resultado.errores || []).map((e, i) => (
                  <li key={i} className="font-mono text-[11px]">{e.archivo}: {e.error}</li>
                ))}
              </ul>
            </details>
          )}

          {registros.length > 0 && (
            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {registrosVisibles.length} de {registros.length} registros — revisá todos contra sus PDF antes de exportar
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <input
                      type="checkbox"
                      checked={soloPendientes}
                      onChange={(e) => setSoloPendientes(e.target.checked)}
                      className="accent-amber-400"
                    />
                    Solo pendientes ({registrosConObservaciones.length})
                  </label>
                  <button
                    type="button"
                    onClick={descargarExcelParaImportar}
                    disabled={
                      exportandoExcel ||
                      procesando ||
                      erroresLectura.length > 0 ||
                      registrosConObservaciones.length > 0 ||
                      !centro ||
                      carga !== 'Entrada'
                    }
                    className="btn-ghost !px-2.5 !py-1.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                    title="Descarga un Excel compatible con Importar Excel; no guarda movimientos"
                  >
                    <IconDownload className="h-3.5 w-3.5" />
                    {exportandoExcel ? 'Generando…' : 'Descargar para Importar Excel'}
                  </button>
                </div>
              </div>
              <div className="table-scroll rounded-lg border border-white/10">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-night-800">
                    <tr className="text-left text-[9px] uppercase tracking-wider text-slate-500">
                          {COLUMNAS_TABLA.map((c) => {
                            const activo = orden.campo === c;
                            return (
                              <th key={c} className="whitespace-nowrap px-2 py-1.5 font-semibold">
                                <button
                                  type="button"
                                  onClick={() => cambiarOrden(c)}
                                  className={`inline-flex items-center gap-1 uppercase tracking-wider transition hover:text-slate-200 ${
                                    activo ? 'text-falpat-soft' : ''
                                  }`}
                                  title={`Ordenar por ${c === 'Archivo' ? 'PDF' : c}`}
                                >
                                  {c === 'Archivo' ? 'PDF' : c}
                                  <span className={`text-[8px] ${activo ? 'text-falpat' : 'text-slate-600'}`}>
                                    {activo ? (orden.dir === 'asc' ? '▲' : '▼') : '↕'}
                                  </span>
                                </button>
                              </th>
                            );
                          })}
                      <th className="px-2 py-1.5 font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrosVisibles.map((r, i) => {
                      const dudosos = revisarRegistro(r);
                      return (
                      <tr key={i} className="border-t border-white/5">
                        {CAMPOS.map((c) => {
                          if (c === 'Centro' || c === 'Carga') {
                            const v = c === 'Centro' ? centro : carga;
                            return (
                              <td key={c} className="whitespace-nowrap px-2 py-1">
                                <span className={`text-[11px] ${v ? 'text-slate-300' : 'font-semibold text-amber-400'}`}>
                                  {v || 'pendiente'}
                                </span>
                              </td>
                            );
                          }
                          const crudo = r[c];
                          const falta = sinDato(crudo);
                          const motivo = dudosos[c];
                          const rojo = !!motivo || falta;
                          const mono = c === 'N Remito' || c === 'Pat. Chasis';
                          const rojoCls = 'rounded bg-red-500/15 px-1 font-bold text-red-300';
                          return (
                            <td key={c} className="whitespace-nowrap px-2 py-1 text-slate-300" title={motivo || undefined}>
                              {r.Archivo ? (
                                <a
                                  href={`/api/tickets/pdf?file=${encodeURIComponent(r.Archivo)}`}
                                  onClick={(e) => abrirPdf(r.Archivo, e)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={motivo ? `${motivo} · Ver PDF: ${r.Archivo}` : `Ver PDF: ${r.Archivo}`}
                                  className={`inline-block cursor-pointer underline decoration-dotted underline-offset-2 hover:bg-white/5 hover:text-white ${
                                    rojo ? rojoCls : ''
                                  } ${mono ? 'font-mono text-[10px]' : 'text-[11px]'}`}
                                >
                                  {falta ? 'N/D' : crudo}
                                </a>
                              ) : (
                                <span className={`${rojo ? rojoCls : ''} ${mono ? 'font-mono text-[10px]' : 'text-[11px]'}`}>
                                  {falta ? 'N/D' : crudo}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-1 py-1">
                          {r.Archivo ? (
                            <a
                              href={`/api/tickets/pdf?file=${encodeURIComponent(r.Archivo)}`}
                              onClick={(e) => abrirPdf(r.Archivo, e)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Abrir PDF original: ${r.Archivo}`}
                              className="inline-flex items-center gap-1 rounded p-0.5 text-falpat-soft hover:bg-white/5 hover:text-white"
                            >
                              <IconFileText className="h-3 w-3 shrink-0" />
                              <span className="text-[9px] uppercase tracking-wider">PDF</span>
                            </a>
                          ) : (
                            <span className="px-0.5 text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {r.Estado === 'DUPLICADO' ? (
                            <span className="badge badge-salida !text-[9px] !px-1.5 !py-0.5">Duplicado</span>
                          ) : (
                            <span className="badge badge-entrada !text-[9px] !px-1.5 !py-0.5">Nuevo</span>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {r.CoincidenciasBase?.length > 1 ? (
                            <span
                              className="inline-flex whitespace-nowrap rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200"
                              title="Hay más de un registro con este proveedor y número de remito."
                            >
                              Varias coincidencias
                            </span>
                          ) : r.CoincidenciasBase?.length === 1 ? (
                            (() => {
                              const existing = r.CoincidenciasBase[0];
                              const manual = existing.origenCarga === 'manual';
                              const desdePdf = existing.origenCarga === 'pdf' || existing.enriquecidoPorPdf;
                              const label = desdePdf
                                ? 'Ya incorporado desde PDF'
                                : manual
                                  ? 'Carga manual'
                                  : 'Origen no identificado';
                              const selectionKey = keyConciliacion(r, existing);
                              const selected = selectedDbMatches.includes(selectionKey);
                              const canComplete = r.CamposACompletar.length > 0 && !desdePdf;
                              return (
                                <div className="min-w-[180px] space-y-1">
                                  <span
                                    className={`inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 text-[9px] font-semibold ${
                                      manual
                                        ? 'border-sky-400/30 bg-sky-400/10 text-sky-200'
                                        : desdePdf
                                          ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                                          : 'border-slate-400/20 bg-white/[0.04] text-slate-300'
                                    }`}
                                  >
                                    {label}
                                  </span>
                                  {r.CamposACompletar.length > 0 ? (
                                    <p className="max-w-[260px] whitespace-normal text-[9px] leading-snug text-emerald-300">
                                      Se pueden completar: {r.CamposACompletar.join(', ')}
                                    </p>
                                  ) : (
                                    <p className="text-[9px] text-slate-500">
                                      Sin campos vacíos compatibles; se omitirá sin modificarlo.
                                    </p>
                                  )}
                                  {r.ConflictosBase.length > 0 && (
                                    <p className="max-w-[260px] whitespace-normal text-[9px] leading-snug text-amber-300">
                                      Datos distintos: {r.ConflictosBase.map((item) => item.campo).join(', ')}. No se sobrescriben.
                                    </p>
                                  )}
                                  {canComplete && (
                                    <label className="flex items-start gap-1 text-[9px] leading-snug text-slate-300">
                                      <input
                                        type="checkbox"
                                        className="mt-0.5 accent-sky-400"
                                        checked={selected}
                                        disabled={incorporando}
                                        onChange={(event) => {
                                          setSelectedDbMatches((current) =>
                                            event.target.checked
                                              ? [...current, selectionKey]
                                              : current.filter((key) => key !== selectionKey)
                                          );
                                        }}
                                      />
                                      Confirmo completar solo campos vacíos
                                      {!manual && ' · origen no identificado'}
                                    </label>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            <span className="text-[10px] text-slate-600">Sin coincidencia</span>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-0.5">
                            {r.Archivo && tieneFaltantes(r) && (
                              <a
                                href={`/api/tickets/pdf?file=${encodeURIComponent(r.Archivo)}`}
                                onClick={(e) => abrirPdf(r.Archivo, e)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded p-0.5 text-red-300 hover:bg-red-500/10"
                                title="Ver PDF original (faltan datos)"
                              >
                                <IconFileText className="h-3 w-3" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => iniciarEdicion(i)}
                              className="rounded p-0.5 text-slate-400 hover:bg-white/5 hover:text-falpat-soft"
                              title="Editar"
                            >
                              <IconPencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => eliminarRegistro(r.Archivo)}
                              className="rounded p-0.5 text-slate-400 hover:bg-white/5 hover:text-red-300"
                              title="Eliminar"
                            >
                              <IconTrash className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {registros.length === 0 && (resultado.errores || []).length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-100">
              <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>No se pudo extraer ningún registro.</span>
            </div>
          )}
          </div>
        )}
      </Paso>

      {/* Paso 3 — Guardar en el servidor */}
      <Paso
        n="3"
        titulo={isProductionVercel ? 'Importar las Entradas a producción' : 'Guardar las Entradas revisadas'}
        ayuda={isProductionVercel
          ? 'Descargá el Excel compatible y cargalo desde la sección Importar Excel para incorporarlo a producción.'
          : 'En desarrollo, podés guardar las Entradas revisadas en la base dev.'}
      >
        <label className="flex items-start gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={confirmacionVisual}
            onChange={(e) => confirmarRevision(e.target.checked)}
            disabled={
              registros.length === 0 ||
              registrosConObservaciones.length > 0 ||
              erroresLectura.length > 0 ||
              procesando ||
              guardandoAprendizaje
            }
            className="mt-0.5 accent-emerald-500"
          />
          <span>
            {guardandoAprendizaje
              ? 'Guardando lo aprendido…'
              : isProductionVercel
                ? 'Confirmo que revisé cada registro contra su PDF original. Esta confirmación no guarda movimientos; después debo descargar el Excel e importarlo desde Importar Excel.'
                : 'Confirmo que revisé cada registro contra su PDF original. En desarrollo, al tildar también guardo las correcciones en la base de lectura para las próximas tandas.'}
          </span>
        </label>

        {isProductionVercel ? (
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Importación a producción
            </p>
            <p className="mb-2 rounded border border-sky-400/20 bg-sky-400/[0.05] p-2 text-[10px] text-sky-100">
              Este paso no escribe en el Excel de la carpeta compartida ni en la base. Primero descargá el archivo
              desde el paso 2; después subilo en Importar Excel y confirmá allí la importación a producción.
            </p>
            <Requisito
              ok={erroresLectura.length === 0 && registrosConObservaciones.length === 0}
              texto={erroresLectura.length
                ? `${erroresLectura.length} PDF(s) con error`
                : registrosConObservaciones.length
                  ? `${registrosConObservaciones.length} registro(s) con campos pendientes`
                  : 'Todos los campos completos'}
            />
            <a href="/incorporar" className="btn-primary mt-3 inline-flex">
              <IconUpload className="h-4 w-4" />
              Ir a Importar Excel
            </a>
          </div>
        ) : (
        <>
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Entorno de prueba protegido
          </p>
          <p className={`mb-2 text-[10px] font-semibold ${devEnvironment?.enabled ? 'text-emerald-300' : 'text-amber-300'}`}>
            {devEnvironment
              ? devEnvironment.enabled
                ? `Escritura habilitada · local · rama ${devEnvironment.branch}`
                : `Escritura bloqueada · ${devEnvironment.error || `rama ${devEnvironment.branch}`}`
              : 'Verificando entorno de desarrollo…'}
          </p>
          <p className="mb-2 rounded border border-sky-400/20 bg-sky-400/[0.05] p-2 text-[10px] text-sky-100">
            Al confirmar, solo se modifica la base de desarrollo. No se escribe en Stock-Historico.xlsx ni se mueve ningún PDF.
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            <Requisito
              ok={erroresLectura.length === 0}
              texto={
                erroresLectura.length
                  ? `${erroresLectura.length} PDF(s) no se pudieron leer`
                  : 'PDFs leídos sin errores'
              }
            />
            <Requisito
              ok={registrosConObservaciones.length === 0}
              texto={
                registrosConObservaciones.length
                  ? `${registrosConObservaciones.length} registro(s) con campos por revisar`
                  : 'Todos los campos revisados'
              }
            />
            <Requisito
              ok={!!devEnvironment?.enabled}
              texto={devEnvironment?.enabled ? `Base protegida · rama ${devEnvironment.branch}` : 'La base dev todavía no está habilitada'}
            />
            <Requisito
              ok={!!centro && carga === 'Entrada'}
              texto={centro && carga ? `Centro ${centro} · ${carga}${carga === 'Salida' ? ' (no habilitada)' : ''}` : 'Falta elegir Centro y Carga'}
            />
            <Requisito
              ok={confirmacionVisual}
              texto={confirmacionVisual ? 'Revisión visual confirmada' : 'Falta confirmar la revisión visual'}
            />
            <Requisito
              ok={registrosNuevosDb.length + selectedDbMatches.length > 0}
              texto={`${registrosNuevosDb.length} Entrada(s) nueva(s) · ${selectedDbMatches.length} coincidencia(s) seleccionada(s) para completar`}
            />
          </ul>
          {coincidenciasSinResolver.length > 0 && (
            <p className="mt-1 text-[10px] text-amber-200">
              Hay {coincidenciasSinResolver.length} coincidencia(s) sin resolver. Seleccioná completar campos vacíos o quitá las filas ambiguas.
            </p>
          )}
          {registrosPdfYaCargados.length > 0 && (
            <p className="mt-1 text-[10px] text-amber-200">
              Se omitirán {registrosPdfYaCargados.length} remito(s) que ya fueron incorporados desde PDF.
            </p>
          )}
          {nDuplicados > 0 && (
            <p className="mt-1 text-[10px] text-amber-200">
              Se omitirán {nDuplicados} remito(s) ya presentes en el Excel histórico de referencia.
            </p>
          )}
          {registrosConObservaciones.length > 0 && (
            <p className="mt-1 text-[10px] text-red-300">
              Primero corregí los campos pendientes en la tabla del paso 2; el tilde se habilita cuando no queden
              observaciones.
            </p>
          )}
          {pendientesDetalle.length > 0 && (
            <div className="mt-1.5 rounded border border-amber-400/20 bg-amber-400/[0.06] p-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                Pendientes de corregir ({pendientesDetalle.length})
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {pendientesDetalle.slice(0, 6).map((p, i) => (
                  <li key={`${p.archivo}-${i}`} className="font-mono text-[10px] text-amber-200/90">
                    {p.archivo}: {p.campos.join(', ')}
                  </li>
                ))}
                {pendientesDetalle.length > 6 && (
                  <li className="text-[10px] text-amber-200/70">
                    … y {pendientesDetalle.length - 6} más
                  </li>
                )}
              </ul>
            </div>
          )}
          {(registros.length > 0 || carpeta) && !confirmacionVisual && (
            <p className="mt-1 text-[10px] text-slate-500">
              Si editás o eliminás un registro después de confirmar, tenés que volver a tildar la revisión.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={incorporar}
            disabled={
              !devEnvironment?.enabled ||
              carga !== 'Entrada' ||
              registros.length === 0 ||
              incorporando ||
              registrosConObservaciones.length > 0 ||
              erroresLectura.length > 0 ||
              !confirmacionVisual ||
              coincidenciasSinResolver.length > 0 ||
              registrosNuevosDb.length + selectedDbMatches.length === 0
            }
            className="btn-primary"
          >
            <IconCheck className="h-4 w-4" />
            {incorporando
              ? 'Incorporando…'
              : `Guardar en dev (${registrosNuevosDb.length} nueva(s) · ${selectedDbMatches.length} completar)`}
          </button>
        </div>
        </>
        )}
      </Paso>

      {procesando && <ProcessingOverlay progreso={progreso} archivos={files.length} />}

      {/* Editor de ticket — modal con visor de PDF */}
      {editandoIdx !== null && registrosVisibles[editandoIdx] && (
        <EditorTicket
          registro={registrosVisibles[editandoIdx]}
          index={editandoIdx}
          total={registrosVisibles.length}
          pendientes={registrosConObservaciones.length}
          centro={centro}
          carga={carga}
          materiales={opcionesMaterial}
          razones={opcionesRazon}
          onClose={cancelarEdicion}
          onSave={guardarEdicion}
          onNavigate={(nuevoIdx) => setEditandoIdx(nuevoIdx)}
        />
      )}

      {alertas.length > 0 && mostrarModalDuplicados && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="omx-modal bg-night-900 border border-white/10 rounded-lg p-5 w-full max-w-2xl mx-4 shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-amber-500/20 rounded-full p-2 shrink-0">
                <IconAlert className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100 mb-1">
                  Remito(s) ya existente(s) en el historial
                </h2>
                <p className="text-sm text-slate-400">
                  Estos {alertas.length} remito(s) ya fueron cargados anteriormente. No se agregarán de nuevo.
                </p>
              </div>
            </div>
            <table className="w-full text-xs mb-4">
              <thead>
                <tr className="text-left border-b border-white/5 mb-1 text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="pb-1 font-semibold">Archivo</th>
                  <th className="pb-1 font-semibold">Proveedor</th>
                  <th className="pb-1 font-semibold">N Remito</th>
                  <th className="pb-1 font-semibold">Fecha</th>
                  <th className="pb-1 font-semibold">Material</th>
                  <th className="pb-1 font-semibold">Neto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {alertas.map((a, i) => (
                  <tr key={i} className="hover:bg-white/5">
                    <td className="py-1.5 text-slate-300 font-mono text-[11px]">{a.Archivo ?? '-'}</td>
                    <td className="py-1.5 text-slate-300 text-[11px]">{a.Proveedor ?? '-'}</td>
                    <td className="py-1.5 text-slate-300 text-[11px]">{a['N Remito'] ?? '-'}</td>
                    <td className="py-1.5 text-slate-300 text-[11px]">{a.Fecha ?? '-'}</td>
                    <td className="py-1.5 text-slate-300 text-[11px]">{a.Material ?? '-'}</td>
                    <td className="py-1.5 text-slate-300 text-[11px]">{a.Neto ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setMostrarModalDuplicados(false)}
                className="btn-ghost !px-3 !py-1.5 !text-xs"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Paso({ n, titulo, ayuda, children }) {
  return (
    <section className="card omx-step space-y-3">
      <header className="flex items-start gap-3">
        <span className="omx-step-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold">
          {n}
        </span>
        <div className="min-w-0">
          <h2 className="omx-step-title text-sm">{titulo}</h2>
          {ayuda && <p className="omx-step-help mt-0.5 text-[11px] leading-relaxed">{ayuda}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, cls }) {
  return (
    <div className="omx-stat rounded-lg border p-2 text-center">
      <div className={`font-mono text-sm font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="text-[8px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}

function Requisito({ ok, texto }) {
  return (
    <li className={`flex items-start gap-1.5 text-[11px] ${ok ? 'text-emerald-300' : 'text-amber-300'}`}>
      {ok ? (
        <IconCheck className="mt-0.5 h-3 w-3 shrink-0" />
      ) : (
        <IconX className="mt-0.5 h-3 w-3 shrink-0" />
      )}
      <span>{texto}</span>
    </li>
  );
}

function ProcessingOverlay({ progreso, archivos }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => setElapsed((Date.now() - start) / 1000), 200);
    return () => clearInterval(interval);
  }, []);

  const items = progreso?.items || [];
  const total = progreso?.total || archivos || 0;
  const completados = items.filter((it) => it.estado === 'ok' || it.estado === 'error').length;
  const activos = items.filter((it) => it.estado === 'procesando');
  const actual = activos[0];
  const suma = items.reduce(
    (acc, it) => acc + (it.estado === 'ok' || it.estado === 'error' ? 1 : it.progreso || 0),
    0
  );
  const pct = total ? Math.min(100, (suma / total) * 100) : 0;
  const enCurso = total ? Math.min(completados + (activos.length ? 1 : 0), total) : 0;
  const listo = total > 0 && completados >= total;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-night-950/80 backdrop-blur-sm">
      <div className="card !p-5 w-full max-w-md mx-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-falpat/30 animate-ping" />
            <div className="absolute inset-0 flex items-center justify-center">
              <IconFileText className="h-5 w-5 text-falpat" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-100">
              Procesando {enCurso} de {total} archivo{total === 1 ? '' : 's'}
            </p>
            <p className="truncate font-mono text-[11px] text-falpat-soft" title={actual?.archivo || ''}>
              {listo ? 'Listo' : actual?.archivo || 'Preparando…'}
              {activos.length > 1 ? ` (+${activos.length - 1} en paralelo)` : ''}
            </p>
          </div>
          <span className="font-mono text-xs font-bold text-slate-300">{Math.round(pct)}%</span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="omx-progress-bar h-full rounded-full transition-all duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="max-h-44 space-y-1 overflow-auto pr-1">
          {items.map((it, i) => {
            const valor = it.estado === 'ok' || it.estado === 'error' ? 1 : it.progreso || 0;
            const color =
              it.estado === 'ok'
                ? 'bg-emerald-400'
                : it.estado === 'error'
                  ? 'bg-red-400'
                  : it.estado === 'procesando'
                    ? 'bg-falpat'
                    : 'bg-white/15';
            const texto =
              it.estado === 'procesando'
                ? 'text-slate-200'
                : it.estado === 'error'
                  ? 'text-red-300'
                  : 'text-slate-500';
            return (
              <div key={`${it.archivo}-${i}`} className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />
                <span
                  className={`min-w-0 flex-1 truncate font-mono text-[10px] ${texto}`}
                  title={it.error || it.fase || it.archivo}
                >
                  {it.archivo}
                </span>
                <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full ${color} transition-all duration-200`}
                    style={{ width: `${Math.round(valor * 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-[9px] text-slate-500">
                  {Math.round(valor * 100)}%
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-white/5 pt-2">
          <span className="font-mono text-[10px] text-slate-500">{elapsed.toFixed(1)}s</span>
          <span className="omx-brand-gradient bg-clip-text text-[10px] font-bold text-transparent">
            Grupo Falpat SRL
          </span>
        </div>
      </div>
    </div>
  );
}
