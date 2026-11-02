'use client';

// ============================================================
// context/AppContext.js
// Contexto global de la aplicacion.
//
// Los datos se guardan en el repo de GitHub (data/db.json) via las
// API Routes /api/db. Al iniciar se hace UNA sola lectura y todo se
// cachea en memoria: los dropdowns de autocompletado, la tabla, los
// filtros y las estadisticas se resuelven localmente sin nuevas
// lecturas. Se asume que el volumen de registros no superara los
// miles de documentos a corto plazo.
// ============================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  fetchState,
  fetchBase,
  saveBase,
  saveBaseMateriales,
  createRecord,
  removeRecord,
  updateRecord as updateRecordApi,
} from '@/lib/api';
import { toMillis } from '@/lib/utils';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [records, setRecords] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  // Tipo de carga preseleccionado al abrir el modal de alta ("Entrada" | "Salida" | null).
  const [defaultCarga, setDefaultCarga] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // Estado global de la sección Tickets: sobrevive a la navegación entre
  // secciones, así el OCR sigue corriendo aunque el usuario cambie de página.
  const [tickets, setTickets] = useState({ procesando: false, resultado: null, error: '' });

  // Base de conocimiento de tickets (data/base.json): se carga una vez y se
  // va poblando sola con cada incorporacion.
  const [baseConocimiento, setBaseConocimiento] = useState({});
  const baseRef = useRef(baseConocimiento);
  const baseCargadaRef = useRef(false);
  const cargaBaseRef = useRef(null);
  const registrosCargadosRef = useRef(false);
  const cargaRegistrosRef = useRef(null);
  const errorRegistrosRef = useRef(null);
  useEffect(() => {
    baseRef.current = baseConocimiento;
  }, [baseConocimiento]);

  // Registros guardados accesibles desde el OCR (para aprender patentes por
  // chofer) sin volver a declarar la dependencia en procesarTickets.
  const recordsRef = useRef(records);
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  const loadRecords = useCallback(async () => {
    if (cargaRegistrosRef.current) return cargaRegistrosRef.current;

    const carga = (async () => {
      setLoading(true);
      setError(null);
      try {
        const { records: data, productos: prods } = await fetchState();

        // Ordenar por fecha de remito (mas reciente primero); empates por createdAt
        data.sort((a, b) => {
          const fa = toMillis(a.fechaRemito) || 0;
          const fb = toMillis(b.fechaRemito) || 0;
          if (fa !== fb) return fb - fa;
          const ca = a.createdAt ? toMillis(a.createdAt) || 0 : 0;
          const cb = b.createdAt ? toMillis(b.createdAt) || 0 : 0;
          return cb - ca;
        });

        setRecords(data);
        recordsRef.current = data;
        setProductos(prods);
        registrosCargadosRef.current = true;
        errorRegistrosRef.current = null;
      } catch (err) {
        console.error('Error leyendo datos:', err);
        errorRegistrosRef.current = err;
        setError(err.message || 'No se pudieron leer los datos.');
      } finally {
        setLoading(false);
      }
    })();

    cargaRegistrosRef.current = carga;
    try {
      await carga;
    } finally {
      if (cargaRegistrosRef.current === carga) cargaRegistrosRef.current = null;
    }
  }, []);

  const cargarRegistrosParaOCR = useCallback(async () => {
    if (!registrosCargadosRef.current) {
      await loadRecords();
    }
    if (!registrosCargadosRef.current) {
      throw new Error(
        `No se pudieron cargar los movimientos para completar la base de conocimiento. ${
          errorRegistrosRef.current?.message || ''
        }`.trim()
      );
    }
    return recordsRef.current;
  }, [loadRecords]);

  // Carga inicial.
  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // La base de conocimiento debe estar lista antes de comenzar el OCR.
  // Comparte una única lectura entre el arranque de la página y el primer PDF.
  const cargarBaseConocimiento = useCallback(async () => {
    if (baseCargadaRef.current) return baseRef.current;
    if (!cargaBaseRef.current) {
      cargaBaseRef.current = fetchBase()
        .then((base) => {
          if (!base || typeof base !== 'object' || Array.isArray(base)) {
            throw new Error('El servidor devolvió una base de conocimiento inválida.');
          }
          baseRef.current = base;
          baseCargadaRef.current = true;
          setBaseConocimiento(base);
          return base;
        })
        .catch((err) => {
          console.error('Error leyendo la base de conocimiento:', err);
          throw new Error(
            `No se pudo cargar la base de conocimiento; no se inició el OCR para evitar completar datos a ciegas. ${err.message || ''}`.trim()
          );
        })
        .finally(() => {
          cargaBaseRef.current = null;
        });
    }
    return cargaBaseRef.current;
  }, []);

  useEffect(() => {
    cargarBaseConocimiento().catch(() => {});
  }, [cargarBaseConocimiento]);

  const procesarTickets = useCallback(async (files, options = {}) => {
    setTickets({ procesando: true, resultado: null, error: '' });
    try {
      // El OCR corre en el propio navegador (pdf.js + tesseract.js): no
      // depende de un servidor con Python/Tesseract instalado.
      const [{ procesarArchivos }, { learnFromRecords, unirBase }] = await Promise.all([
        import('@/lib/tickets/ocr.mjs'),
        import('@/lib/tickets/extract.mjs'),
      ]);
      const [conocimiento, registrosConocidos] = await Promise.all([
        cargarBaseConocimiento(),
        cargarRegistrosParaOCR(),
      ]);
      const base = unirBase(learnFromRecords(registrosConocidos), conocimiento);
      const data = await procesarArchivos(files, { base, onProgress: options.onProgress });
      setTickets({ procesando: false, resultado: data, error: '' });
      return data;
    } catch (err) {
      const msg = err.message || 'No se pudieron procesar los archivos.';
      setTickets({ procesando: false, resultado: null, error: msg });
      throw err;
    }
  }, [cargarBaseConocimiento, cargarRegistrosParaOCR]);

  const limpiarTickets = useCallback(() => {
    setTickets({ procesando: false, resultado: null, error: '' });
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  // Aprende de los tickets incorporados y actualiza la base persistida.
  const guardarBase = useCallback(async (filas, correcciones = []) => {
    const data = await saveBase(filas, correcciones);
    if (!data?.base) throw new Error('El servidor no devolvió la base de conocimiento actualizada.');
    setBaseConocimiento(data.base);
    baseRef.current = data.base;
    return data;
  }, []);

  // Agrega materiales nuevos al catalogo persistido (data/base.json).
  const agregarMateriales = useCallback(async (materiales) => {
    const data = await saveBaseMateriales(materiales);
    if (!data?.base) throw new Error('El servidor no devolvió la base de conocimiento actualizada.');
    setBaseConocimiento(data.base);
    baseRef.current = data.base;
    return data;
  }, []);

  // Agrega nuevas razones sociales al catalogo persistido.
  const agregarRazonesSociales = useCallback(async (razones) => {
    const data = await fetch('/api/base', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ razonesSociales: razones }),
    });
    const json = await data.json();
    if (!json?.base) throw new Error(json?.error || 'Error al guardar razones sociales');
    setBaseConocimiento(json.base);
    baseRef.current = json.base;
    return json;
  }, []);

  // Agrega nuevos choferes al catalogo persistido (apellido -> nombre completo).
  const agregarChoferes = useCallback(async (choferes) => {
    const mapa = {};
    for (const nombre of choferes || []) {
      const limpio = String(nombre || '').trim().toUpperCase();
      const apellido = limpio.split(/\s+/)[0];
      if (apellido && apellido !== 'N/D') mapa[apellido] = limpio;
    }
    if (!Object.keys(mapa).length) return null;
    const data = await fetch('/api/base', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choferes: mapa }),
    });
    const json = await data.json();
    if (!json?.base) throw new Error(json?.error || 'Error al guardar choferes');
    setBaseConocimiento(json.base);
    baseRef.current = json.base;
    return json;
  }, []);

  // Agrega nuevas patentes al catalogo persistido (apellido -> [patentes]).
  // Recibe [{ chofer, patente }] para asociar la patente al chofer.
  const agregarPatentes = useCallback(async (patentes) => {
    const mapa = {};
    for (const item of patentes || []) {
      const apellido = String(item?.chofer || '').trim().toUpperCase().split(/\s+/)[0];
      const patente = String(item?.patente || '').trim().toUpperCase();
      if (!apellido || !patente) continue;
      const lista = mapa[apellido] || (mapa[apellido] = []);
      if (!lista.includes(patente)) lista.push(patente);
    }
    if (!Object.keys(mapa).length) return null;
    const data = await fetch('/api/base', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patentes: mapa }),
    });
    const json = await data.json();
    if (!json?.base) throw new Error(json?.error || 'Error al guardar patentes');
    setBaseConocimiento(json.base);
    baseRef.current = json.base;
    return json;
  }, []);

  const openModal = useCallback((carga) => {
    setEditingRecord(null);
    setDefaultCarga(carga || null);
    setModalOpen(true);
  }, []);
  const openEdit = useCallback((record) => {
    setEditingRecord(record);
    setDefaultCarga(null);
    setModalOpen(true);
  }, []);
  const closeModal = useCallback(() => {
    setEditingRecord(null);
    setDefaultCarga(null);
    setModalOpen(false);
  }, []);

  const addRecord = useCallback(
    async (data) => {
      const { record, productos: prods } = await createRecord(data);
      setRecords((prev) => [record, ...prev]);
      setProductos(prods);
      showToast('Registro guardado correctamente');
      return record;
    },
    [showToast]
  );

  const deleteRecord = useCallback(
    async (id) => {
      await removeRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
      showToast('Registro eliminado');
    },
    [showToast]
  );

  const updateRecord = useCallback(
    async (id, data) => {
      const { record, productos: prods } = await updateRecordApi(id, data);
      setRecords((prev) => prev.map((r) => (r.id === id ? record : r)));
      setProductos(prods);
      showToast('Registro actualizado correctamente');
      return record;
    },
    [showToast]
  );

  // Valores unicos para el autocompletado (extraidos de la cache local).
  const uniqueValues = useMemo(() => {
    const FIELDS = [
      'producto',
      'codigoProducto',
      'patente',
      'chofer',
      'pesoBalanza',
      'planta',
      'cliente',
      'proveedor',
      'nroRemitoFalpat',
      'chofer',
      'patenteChasis',
    ];
    const sets = Object.fromEntries(FIELDS.map((f) => [f, new Set()]));
    for (const r of records) {
      for (const field of FIELDS) {
        const v = typeof r[field] === 'string' ? r[field].trim() : '';
        if (v) sets[field].add(v);
      }
    }
    // El catalogo de productos es fuente de verdad adicional.
    for (const p of productos) {
      if (p) sets.producto.add(p);
    }
    return Object.fromEntries(
      Object.entries(sets).map(([k, set]) => [
        k,
        [...set].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
      ])
    );
  }, [records, productos]);

  // Estadisticas globales del dashboard
  const stats = useMemo(() => {
    const total = records.length;
    const entradas = records.filter((r) => r.carga === 'Entrada').length;
    const salidas = total - entradas;
    return { total, entradas, salidas, ultimo: records[0] || null };
  }, [records]);

  const value = useMemo(
    () => ({
      records,
      productos,
      loading,
      error,
      reload: loadRecords,
      addRecord,
      updateRecord,
      deleteRecord,
      uniqueValues,
      stats,
      modalOpen,
      editingRecord,
      defaultCarga,
      openModal,
      openEdit,
      closeModal,
      toast,
      showToast,
      tickets,
      procesarTickets,
      limpiarTickets,
      baseConocimiento,
      guardarBase,
      agregarMateriales,
      agregarRazonesSociales,
      agregarChoferes,
      agregarPatentes,
    }),
    [
      records,
      productos,
      loading,
      error,
      loadRecords,
      addRecord,
      updateRecord,
      deleteRecord,
      uniqueValues,
      stats,
      modalOpen,
      editingRecord,
      defaultCarga,
      openModal,
      openEdit,
      closeModal,
      toast,
      showToast,
      tickets,
      procesarTickets,
      limpiarTickets,
      baseConocimiento,
      guardarBase,
      agregarMateriales,
      agregarRazonesSociales,
      agregarChoferes,
      agregarPatentes,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp debe usarse dentro de <AppProvider>.');
  }
  return ctx;
}

export { AppContext };