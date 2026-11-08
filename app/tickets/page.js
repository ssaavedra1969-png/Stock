'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { revisarRegistro, parseNum } from '@/lib/tickets/extract.mjs';
import { MATERIALES, RAZONES_SOCIALES } from '@/lib/tickets/base.mjs';
import EditorTicket from '@/components/EditorTicket';
import SectionHero from '@/components/SectionHero';
import {
  IconUpload,
  IconFileText,
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

const COLUMNAS_TABLA = [...CAMPOS, 'Archivo', 'Estado'];

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
  if (campo === 'Centro' || campo === 'Carga') return 0;
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

function toneladasDesdeKg(value) {
  const kilograms = parseNum(value);
  if (kilograms === null) return '';
  return `${(kilograms / 1000).toFixed(3).replace(/\.?0+$/, '')} tn`;
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

function ordenarPorFecha(registros) {
  return [...registros].sort((a, b) => {
    const fa = String(a.Fecha || a.fecha || '');
    const fb = String(b.Fecha || b.fecha || '');
    return fa.localeCompare(fb);
  });
}

function opcionesUnicas(valores) {
  const opciones = new Map();
  for (const valor of valores) {
    const limpio = String(valor ?? '').trim();
    if (!limpio || limpio.toUpperCase() === 'N/D') continue;
    const clave = limpio.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (!opciones.has(clave)) opciones.set(clave, limpio);
  }
  return [...opciones.values()].sort((a, b) => a.localeCompare(b, 'es', {
    sensitivity: 'base',
    numeric: true,
  }));
}

function identificarRegistros(registros) {
  return registros.map((registro, index) => ({
    ...registro,
    _editorId: registro._editorId || `ticket-${index}`,
  }));
}

export default function TicketsPage() {
  const {
    showToast,
    tickets,
    procesarTickets,
    limpiarTickets,
    guardarBase,
    agregarMateriales,
    agregarRazonesSociales,
    agregarChoferes,
    agregarPatentes,
    baseConocimiento,
  } = useApp();
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [registrosEditados, setRegistrosEditados] = useState([]);
  const [erroresExcluidos, setErroresExcluidos] = useState(() => new Set());
  const [archivosQuitados, setArchivosQuitados] = useState(() => new Set());
  const [huboEdiciones, setHuboEdiciones] = useState(false);
  const [editandoIdx, setEditandoIdx] = useState(null);
  const [idsEdicion, setIdsEdicion] = useState([]);
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [incorporando, setIncorporando] = useState(false);
  const [ultimaIncorporacion, setUltimaIncorporacion] = useState(null);
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
  const [devEnvironment, setDevEnvironment] = useState(null);
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
  const ticketsRef = useRef(tickets);
  ticketsRef.current = tickets;

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
    const lista = identificarRegistros(
      huboEdiciones ? registrosEditados : resultado?.registros || []
    );
    const claves = clavesPlanilla;
    const conEstado = lista.map((r) => ({
      ...r,
      Estado: claves
        ? claves.has(`${r.Proveedor || ''}|${r['N Remito'] || ''}`)
          ? 'DUPLICADO'
          : 'NUEVO'
        : r.Estado,
    }));
    const ordenados = ordenarPorFecha(conEstado);
    if (!orden.campo) return ordenados;
    const factor = orden.dir === 'asc' ? 1 : -1;
    return [...ordenados].sort((a, b) => factor * compararRegistros(a, b, orden.campo));
  }, [resultado, registrosEditados, huboEdiciones, clavesPlanilla, orden]);

  const opcionesChofer = useMemo(
    () => opcionesUnicas([
      ...Object.values(baseConocimiento?.choferes || {}),
      ...registros.map((record) => record.Chofer || record.chofer),
    ]),
    [baseConocimiento, registros]
  );
  const opcionesPatente = useMemo(
    () => opcionesUnicas([
      ...Object.values(baseConocimiento?.patentes || {}).flat(),
      ...Object.values(baseConocimiento?.patentesPorTicket || {}),
      ...registros.flatMap((record) => [
        record['Pat. Chasis'],
        record.patente,
        record.patenteChasis,
      ]),
    ]),
    [baseConocimiento, registros]
  );

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
  const erroresLectura = (resultado?.errores || []).filter(
    (error, index) =>
      !erroresExcluidos.has(index) && !archivosQuitados.has(error.archivo)
  );
  const erroresLecturaExcluidos = (resultado?.errores || [])
    .map((error, index) => ({ ...error, index }))
    .filter(
      (error) =>
        erroresExcluidos.has(error.index) && !archivosQuitados.has(error.archivo)
    );

  const alertas = useMemo(() => {
    if (!resultado) return [];
    return registros.filter((r) => r.Estado === 'DUPLICADO');
  }, [resultado, registros]);

  function addFiles(lista) {
    const nuevos = Array.from(lista).filter((f) => /\.pdf$/i.test(f.name));
    if (nuevos.length === 0) {
      showToast('Solo se aceptan archivos PDF', 'error');
      return;
    }
    if (procesando || incorporando) {
      showToast(
        'Esperá a que termine el proceso actual antes de agregar más PDF.',
        'error'
      );
      return;
    }
    const vistos = new Set(files.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
    const unicos = nuevos.filter((file) => {
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      if (vistos.has(key)) return false;
      vistos.add(key);
      return true;
    });
    if (unicos.length === 0) {
      showToast('Esos PDF ya están en la tanda actual.', 'error');
      return;
    }

    setFiles((prev) => [...prev, ...unicos]);
    if (resultado) {
      setArchivosQuitados((prev) => {
        const next = new Set(prev);
        for (const file of unicos) next.delete(file.name);
        return next;
      });
      procesarAdicionales(unicos);
    }
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
    if (files.length === 0 || ticketsRef.current.procesando || ticketsRef.current.resultado) return;
    procesar();
  }, [files]);

  useEffect(() => {
    if (alertas.length > 0) {
      setMostrarModalDuplicados(true);
    }
  }, [alertas]);

  function removeFile(index) {
    const file = files[index];
    if (!file) return;
    const yaProcesado = Boolean(resultado);
    if (
      yaProcesado &&
      !window.confirm(
        `¿Sacar "${file.name}" de esta tanda? No se incorporará ni se moverá; el PDF original quedará intacto en Entrada. Los demás registros no se volverán a procesar.`
      )
    ) {
      return;
    }

    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (yaProcesado) {
      setArchivosQuitados((prev) => new Set([...prev, file.name]));
      setRegistrosEditados(registros.filter((registro) => registro.Archivo !== file.name));
      setHuboEdiciones(true);
      setConfirmacionVisual(false);
      setEditandoIdx(null);
      setIdsEdicion([]);
      showToast(`${file.name} quitado de la tanda; el PDF original queda intacto en Entrada`);
    }
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
    setErroresExcluidos(new Set());
    setArchivosQuitados(new Set());
    progresoRef.current = null;
    setProgreso(null);
    setRegistrosEditados([]);
    setHuboEdiciones(false);
    setEditandoIdx(null);
    setSoloPendientes(false);
    setCentro('');
    setCarga('');
    setConfirmacionVisual(false);
    try {
      sessionStorage.removeItem(EDICIONES_KEY);
    } catch {
      // storage no disponible
    }
    if (inputRef.current) inputRef.current.value = '';
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
      showToast(`Carpeta STOCK lista: ${handle.name}${nota} · el histórico se actualiza al confirmar`);
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
    setUltimaIncorporacion(null);
    setErroresExcluidos(new Set());
    setRegistrosEditados([]);
    setHuboEdiciones(false);
    try {
      sessionStorage.removeItem(EDICIONES_KEY);
    } catch {
      // storage no disponible
    }
    setEditandoIdx(null);
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
    } catch (err) {
      showToast(err.message || 'Error al procesar los remitos', 'error');
    }
  }

  async function procesarAdicionales(nuevos) {
    if (nuevos.length === 0) return;
    progresoRef.current = {
      total: nuevos.length,
      archivos: nuevos.map((file) => file.name),
      items: nuevos.map((file) => ({
        archivo: file.name,
        estado: 'pendiente',
        progreso: 0,
        fase: 'en cola',
      })),
      terminado: false,
    };
    setProgreso(progresoRef.current);
    try {
      const data = await procesarTickets(nuevos, {
        append: true,
        onProgress: onProgreso,
      });
      const offsetRegistros = resultado?.registros?.length || 0;
      const nuevosIdentificados = (data.registros || []).map((registro, index) => ({
        ...registro,
        _editorId: `ticket-${offsetRegistros + index}`,
      }));
      setRegistrosEditados([...registros, ...nuevosIdentificados]);
      setHuboEdiciones(true);
      setConfirmacionVisual(false);
      setEditandoIdx(null);
      setIdsEdicion([]);
      setUltimaIncorporacion(null);
      showToast(
        `Se agregaron ${nuevos.length} PDF(s) al lote · ${data.nuevos ?? data.registros?.length ?? 0} registro(s) leído(s)`
      );
    } catch (err) {
      showToast(
        `No se pudieron procesar los PDF agregados: ${err.message || 'error de lectura'}`,
        'error'
      );
    }
  }

  function iniciarEdicion(idx) {
    setConfirmacionVisual(false);
    setIdsEdicion(registrosVisibles.map((registro) => registro._editorId));
    setEditandoIdx(idx);
  }

  function cancelarEdicion() {
    setEditandoIdx(null);
    setIdsEdicion([]);
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
      const base = identificarRegistros(resultado?.registros || []);
      const lista = prev.length > 0 ? [...prev] : [...base];
      const revision = { ...(form._revision || {}) };
      for (const campo of Object.keys(formNormalizado)) delete revision[campo];
      const editado = { ...formNormalizado, _revision: revision };
      if (Object.keys(revision).length === 0) delete editado._revision;
      const indiceReal = lista.findIndex((r) => r._editorId === editado._editorId);
      if (indiceReal >= 0) lista[indiceReal] = editado;
      return lista;
    });
    setConfirmacionVisual(false);
    setHuboEdiciones(true);
    if (irSiguiente && editandoIdx < idsEdicion.length - 1) {
      setEditandoIdx(editandoIdx + 1);
    } else {
      setEditandoIdx(null);
      setIdsEdicion([]);
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

  function eliminarRegistro(editorId) {
    setRegistrosEditados((prev) => {
      const base = identificarRegistros(resultado?.registros || []);
      const lista = prev.length > 0 ? [...prev] : [...base];
      const indiceReal = lista.findIndex((r) => r._editorId === editorId);
      if (indiceReal >= 0) lista.splice(indiceReal, 1);
      return lista;
    });
    setConfirmacionVisual(false);
    setHuboEdiciones(true);
    showToast('Registro quitado de esta tanda; el PDF original queda intacto en Entrada');
  }

  function excluirErrorLectura(index) {
    const error = resultado?.errores?.[index];
    if (!error?.archivo) {
      showToast('No se puede excluir esta falla porque no identifica el PDF afectado.', 'error');
      return;
    }
    const accepted = window.confirm(
      `¿Quitar "${error.archivo}" solo de esta tanda? No se incorporará ni se moverá; el PDF original quedará intacto en Entrada para revisarlo después.`
    );
    if (!accepted) return;
    setErroresExcluidos((prev) => new Set([...prev, index]));
    setConfirmacionVisual(false);
    showToast(`PDF excluido de esta tanda; permanece intacto en Entrada`);
  }

  function restaurarErrorLectura(index) {
    setErroresExcluidos((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    setConfirmacionVisual(false);
    showToast('PDF restaurado a la tanda');
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
      const originales = new Map(
        identificarRegistros(resultado.registros || []).map((r) => [r._editorId, r])
      );
      const camposCorregibles = CAMPOS.filter((c) => !['Proveedor', 'Centro', 'Carga'].includes(c));
      const correcciones = registros.flatMap((corregido) => {
        const original = originales.get(corregido._editorId);
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
    if (!carpeta?.handle) {
      showToast('Elegí primero la carpeta STOCK para guardar en el histórico compartido.', 'error');
      return;
    }
    const accepted = window.confirm(
      `¿Confirmás incorporar ${nNuevos} remito(s) nuevo(s) y archivar ${registros.length} PDF(s)? Se actualizará Stock-Historico.xlsx en la carpeta STOCK y se moverán solo esos PDF a procesados.${erroresLecturaExcluidos.length ? ` Los ${erroresLecturaExcluidos.length} PDF(s) excluidos quedarán intactos en Entrada.` : ''}`
    );
    if (!accepted) return;

    setIncorporando(true);
    try {
      const { incorporarEnCarpeta } = await import('@/lib/tickets/archivo.mjs');
      const registrosConMeta = registros.map((record) => ({
        ...record,
        Centro: centro,
        Carga: carga,
        _file: files.find((file) => file.name === record.Archivo),
      }));
      const data = await incorporarEnCarpeta(carpeta.handle, registrosConMeta);
      setUltimaIncorporacion({
        agregados: data.agregados,
        duplicados: data.duplicados,
        movidos: data.movidos.length,
        total: registrosConMeta.length,
        errores: data.errores,
      });
      if (data.claves) setClavesPlanilla(new Set(data.claves));
      const erroresMovimiento = data.errores
        .slice(0, 3)
        .map(({ archivo, error }) => `${archivo || 'PDF'}: ${error}`)
        .join(' · ');
      const mensaje =
        `${data.agregados} fila(s) agregada(s) al histórico · ` +
        `${data.movidos.length} PDF(s) archivado(s)` +
        (data.duplicados ? ` · ${data.duplicados} repetida(s)` : '') +
        (data.errores.length
          ? ` · ${data.errores.length} PDF(s) no pudieron moverse: ${erroresMovimiento}`
          : '');
      showToast(mensaje, data.errores.length ? 'error' : undefined);
      if (data.errores.length === 0) limpiar();
    } catch (err) {
      showToast(err.message || 'Error al guardar en el histórico compartido', 'error');
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
        subtitle="Leé y corregí los remitos; al confirmar se actualiza Stock-Historico.xlsx y se archivan los PDF"
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
        ayuda={
          resultado
            ? 'Agregá más PDF al mismo lote; se procesarán solo los archivos nuevos y se conservarán las correcciones anteriores.'
            : 'Arrastrá PDF, elegí archivos o seleccioná la carpeta STOCK para leer los PDF de Entrada y consultar duplicados en el histórico.'
        }
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
            disabled={procesando || incorporando}
          />
          <IconFileText className="h-5 w-5 text-falpat" />
          <span className="text-xs text-slate-300">
            Arrastrá PDF acá o{' '}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-falpat-soft underline hover:text-falpat"
              disabled={procesando || incorporando}
              title={
                resultado
                  ? 'Agregar PDF nuevos al lote; solo se procesarán los archivos agregados.'
                  : undefined
              }
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
                  disabled={procesando || incorporando}
                  title="Quitar de esta tanda; el PDF original queda intacto en Entrada y no se reprocesan los demás."
                  className="text-slate-500 hover:text-red-300"
                >
                  <IconX className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {archivosQuitados.size > 0 && (
          <div className="rounded border border-amber-400/25 bg-amber-400/[0.06] p-2 text-[10px] text-amber-100">
            {archivosQuitados.size} PDF(s) fuera de esta tanda; no se incorporan ni se mueven y quedan intactos en Entrada:
            {' '}
            {[...archivosQuitados].join(', ')}
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
                  {clavesPlanilla ? `${clavesPlanilla.size} registro(s) existentes en el histórico` : ''}
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
                ?                 <span className="text-emerald-400">Entrada lista para revisar e incorporar al histórico</span>
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
                Errores de lectura ({erroresLectura.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {(resultado.errores || []).map((e, i) =>
                  erroresExcluidos.has(i) || archivosQuitados.has(e.archivo) ? null : (
                    <li
                      key={`${e.archivo || 'error'}-${i}`}
                      className="flex flex-wrap items-start justify-between gap-2 rounded border border-red-500/20 bg-black/10 p-2"
                    >
                      <span className="min-w-0 break-words font-mono text-[11px]">
                        {e.archivo || 'PDF sin identificar'}: {e.error}
                      </span>
                      <button
                        type="button"
                        onClick={() => excluirErrorLectura(i)}
                        disabled={!e.archivo || procesando || incorporando}
                        className="shrink-0 rounded border border-amber-400/30 px-2 py-1 text-[10px] font-semibold text-amber-200 transition hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Excluir solo de esta tanda; deja el PDF original en Entrada"
                      >
                        Excluir · dejar en Entrada
                      </button>
                    </li>
                  )
                )}
              </ul>
              {erroresLecturaExcluidos.length > 0 && (
                <div className="mt-2 rounded border border-amber-400/25 bg-amber-400/[0.06] p-2 text-amber-100">
                  <p className="font-semibold">
                    {erroresLecturaExcluidos.length} PDF(s) fuera de esta tanda; permanecen intactos en Entrada.
                  </p>
                  <ul className="mt-1 space-y-1">
                    {erroresLecturaExcluidos.map((error) => (
                      <li
                        key={`${error.archivo || 'error'}-${error.index}`}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span className="break-all font-mono text-[10px]">
                          {error.archivo || 'PDF sin identificar'}
                        </span>
                        <button
                          type="button"
                          onClick={() => restaurarErrorLectura(error.index)}
                          disabled={procesando || incorporando}
                          className="rounded px-2 py-1 text-[10px] font-semibold text-amber-200 underline underline-offset-2 hover:text-white disabled:opacity-50"
                        >
                          Deshacer
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
                      <tr key={r._editorId} className="border-t border-white/5">
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
                              onClick={() => eliminarRegistro(r._editorId)}
                              className="rounded p-0.5 text-slate-400 hover:bg-white/5 hover:text-red-300"
                              title="Quitar de esta tanda; el PDF original queda intacto en Entrada"
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

      {/* Paso 3 — Guardar en el histórico compartido */}
      <Paso
        n="3"
        titulo="Incorporar al histórico"
        ayuda="Al confirmar, se agregan los remitos al Excel histórico de la carpeta STOCK y se archivan los PDF."
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
              : 'Confirmo que revisé cada registro contra su PDF original.'}
          </span>
        </label>

        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Histórico de la carpeta compartida
          </p>
          <p className="mb-2 rounded border border-sky-400/20 bg-sky-400/[0.05] p-2 text-[10px] text-sky-100">
            La escritura se realiza desde el navegador en la carpeta STOCK que elegiste: agrega filas a
            <span className="font-semibold"> Salida\Stock-Historico.xlsx</span> y mueve los PDF de Entrada a procesados.
            No modifica la base de movimientos de la aplicación.
          </p>
          {ultimaIncorporacion && (
            <p
              role="status"
              className={`mb-2 rounded border p-2 text-xs ${
                ultimaIncorporacion.errores.length
                  ? 'border-amber-400/30 bg-amber-400/[0.08] text-amber-100'
                  : 'border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-100'
              }`}
            >
              Última carga confirmada: {ultimaIncorporacion.agregados} fila(s) agregada(s) al Excel,
              {' '}{ultimaIncorporacion.duplicados} duplicada(s) omitida(s) y{' '}
              {ultimaIncorporacion.movidos} de {ultimaIncorporacion.total} PDF(s) archivado(s).
              {ultimaIncorporacion.errores.length > 0 &&
                ` ${ultimaIncorporacion.errores.length} PDF(s) no pudieron archivarse; revisá el aviso antes de reintentar.`}
            </p>
          )}
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
              ok={!!carpeta?.handle}
              texto={carpeta ? `Carpeta STOCK autorizada · ${carpeta.nombre}` : 'Falta elegir la carpeta STOCK'}
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
              ok={registros.length > 0}
              texto={
                registros.length > 0
                  ? `${nNuevos} remito(s) nuevo(s) · ${nDuplicados} repetido(s)`
                  : 'Sin remitos en la tanda actual'
              }
            />
          </ul>
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
              !carpeta?.handle ||
              carga !== 'Entrada' ||
              registros.length === 0 ||
              incorporando ||
              registrosConObservaciones.length > 0 ||
              erroresLectura.length > 0 ||
              !confirmacionVisual
            }
            className="btn-primary"
          >
            <IconCheck className="h-4 w-4" />
            {incorporando
              ? 'Guardando histórico…'
              : registros.length > 0
                ? `Guardar en histórico (${nNuevos} nuevo(s) · ${nDuplicados} repetido(s))`
                : 'Sin registros para incorporar'}
          </button>
        </div>
      </Paso>

      {procesando && <ProcessingOverlay progreso={progreso} archivos={files.length} />}

      {/* Editor de ticket — modal con visor de PDF */}
      {editandoIdx !== null && idsEdicion[editandoIdx] && (
        <EditorTicket
          registro={registros.find((registro) => registro._editorId === idsEdicion[editandoIdx])}
          index={editandoIdx}
          total={idsEdicion.length}
          pendientes={registrosConObservaciones.length}
          centro={centro}
          carga={carga}
          materiales={opcionesMaterial}
          razones={opcionesRazon}
          choferes={opcionesChofer}
          patentes={opcionesPatente}
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
