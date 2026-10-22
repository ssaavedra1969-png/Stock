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
import { fetchState, fetchBase, saveBase, createRecord, removeRecord, updateRecord as updateRecordApi } from '@/lib/api';
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
  useEffect(() => {
    baseRef.current = baseConocimiento;
  }, [baseConocimiento]);

  // Registros guardados accesibles desde el OCR (para aprender patentes por
  // chofer) sin volver a declarar la dependencia en procesarTickets.
  const recordsRef = useRef(records);
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  const procesarTickets = useCallback(async (files) => {
    setTickets({ procesando: true, resultado: null, error: '' });
    try {
      // El OCR corre en el propio navegador (pdf.js + tesseract.js): no
      // depende de un servidor con Python/Tesseract instalado.
      const [{ procesarArchivos }, { learnFromRecords, unirBase }] = await Promise.all([
        import('@/lib/tickets/ocr.mjs'),
        import('@/lib/tickets/extract.mjs'),
      ]);
      const base = unirBase(baseRef.current, learnFromRecords(recordsRef.current));
      const data = await procesarArchivos(files, { base });
      setTickets({ procesando: false, resultado: data, error: '' });
      return data;
    } catch (err) {
      const msg = err.message || 'No se pudieron procesar los archivos.';
      setTickets({ procesando: false, resultado: null, error: msg });
      throw err;
    }
  }, []);

  const limpiarTickets = useCallback(() => {
    setTickets({ procesando: false, resultado: null, error: '' });
  }, []);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const loadRecords = useCallback(async () => {
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
      setProductos(prods);
    } catch (err) {
      console.error('Error leyendo datos:', err);
      setError(err.message || 'No se pudieron leer los datos.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga inicial.
  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // Base de conocimiento (data/base.json): se lee una vez al iniciar.
  const loadBase = useCallback(async () => {
    try {
      setBaseConocimiento(await fetchBase());
    } catch (err) {
      console.error('Error leyendo la base de conocimiento:', err);
    }
  }, []);
  useEffect(() => {
    loadBase();
  }, [loadBase]);

  // Aprende de los tickets incorporados y actualiza la base persistida.
  const guardarBase = useCallback(async (filas, correcciones = []) => {
    const data = await saveBase(filas, correcciones);
    if (!data?.base) throw new Error('El servidor no devolvió la base de conocimiento actualizada.');
    setBaseConocimiento(data.base);
    baseRef.current = data.base;
    return data;
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
