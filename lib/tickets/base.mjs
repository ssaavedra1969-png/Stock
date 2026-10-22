// ============================================================
// lib/tickets/base.mjs
// BASE DE CONOCIMIENTO de tickets FALPAT.
//
// Se va ampliando con cada correccion manual de la UI y con lo que
// traiga LECTURA/base_conocimiento.xlsx. El extractor (extract.mjs)
// la usa para resolver dudas de OCR en campos fragiles.
//
// Como agregar un dato:
//   1. Patente nueva por chofer -> BASE.patentes[APELLIDO] = ['XX000XX']
//      (si cambio de camion, agregar varias: ['AA111AA', 'BB222BB'])
//   2. Neto verificado -> BASE.netos['EMPRESA|NRemito'] = '35.080'
//   3. Patente verificada por ticket -> BASE.patentesPorTicket['EMPRESA|NRemito']
// Las correcciones confirmadas por el operador se guardan en data/base.json:
// por ticket/archivo para relecturas exactas y como regla textual por proveedor
// solo si se corrigio explicitamente el mismo texto OCR.
// Las claves de ticket son: SPO = SPOSITO, LCE = ALMAJO NORTE,
// AVE = CEMENTO AVELLANEDA.
// ============================================================

// Tablas canonicas. Todo material o razon social leido se resuelve contra
// estas listas: si no coincide exacto se asigna el mas parecido y se marca
// la advertencia para revisarlo.
export const RAZONES_SOCIALES = [
  'ALMAJO NORTE',
  'ARENERA CANELONES',
];

export const MATERIALES = [
  'ARENA MODULO 1.8-1.9',
  'ARENA FINA',
  'ARENA GRANITICA 0/6',
  'PIEDRA PARTIDA 0/6',
  'PIEDRA PARTIDA 6/12',
  'PIEDRA PARTIDA 6/20',
  'PIEDRA PARTIDA 10/30',
  'CTO AVELLANEDA',
];

export const BASE = {
  actualizado: '2026-10-19',
  origen: 'correcciones manuales + LECTURA/base_conocimiento.xlsx',

  // Tablas canonicas de razones sociales y materiales.
  razonesSociales: RAZONES_SOCIALES,
  materiales: MATERIALES,

  // Apellido del chofer -> patentes verificadas.
  // Una sola: se usa tal cual. Varias (cambio de camion): se elige la mas
  // parecida a lo que leyo el OCR.
  patentes: {
    ALONSO: ['AH702XX'],
    OCHOA: ['AG894ER'],
    RODRIGUEZ: ['AH784OX'],
    WILBERGER: ['AH784OW'],
    PIACENTINI: ['AH919IQ'],
    LEDESMA: ['AH919KE'],
    TOLOSA: ['AH784OY'],
    GARCIA: ['AE403QQ', 'AG266CJ'],
  },

  // Nombre completo del chofer por apellido: sirve para completar el campo
  // cuando la hoja no lo lee pero la patente si se pudo resolver.
  choferes: {
    ALONSO: 'ALONSO MIGUEL',
    OCHOA: 'OCHOA ANIBAL',
    RODRIGUEZ: 'RODRIGUEZ MATIAS',
    WILBERGER: 'WILBERGER JUAN',
    PIACENTINI: 'PIACENTINI ALEJANDRO MIGUEL',
    LEDESMA: 'LEDESMA CAMILO',
    TOLOSA: 'TOLOSA CESAR',
    GARCIA: 'GARCIA CRISTIAN',
  },

  // Netos verificados por ticket (Pag.1 escaneada / OCR fragil).
  netos: {
    'SPO|65979': '35.900',
    'SPO|66006': '34.600',
    'LCE|112340': '35.080',
    'AVE|166403': '35.330',
  },

  // Correcciones confirmadas para relecturas exactas por ticket.
  correccionesPorTicket: {
    'LCE|112246': {
      Fecha: '10/10/2026',
      Material: 'PIEDRA PARTIDA 6/12',
      Neto: '35.460',
      'Peso Neto': '35.300',
      'N Remito': '112246',
    },
    'LCE|112212': {
      Fecha: '09/10/2026',
      Material: 'PIEDRA PARTIDA 6/12',
      Neto: '34.800',
      'Peso Neto': '34.700',
      'N Remito': '112212',
      'Pat. Chasis': 'AH702XY',
    },
    'LCE|112376': {
      Fecha: '15/10/2026',
      Neto: '34.520',
      'Peso Neto': '34.720',
      'N Remito': '112376',
      Chofer: 'AGUERD TOMAS AGUSTIN',
      'Pat. Chasis': 'AH702YZ',
    },
  },

  // Correcciones confirmadas por archivo, para tickets cuyo remito OCR no es fiable.
  correccionesPorArchivo: {
    'SPO|IMG-261019134610-001.PDF': {
      Material: 'ARENA MODULO 1.8-1.9',
      Neto: '36.200',
      'N Remito': '65971',
    },
    'SPO|IMG-261019121018-001.PDF': {
      Fecha: '15/10/2026',
      Material: 'ARENA MODULO 1.8-1.9',
      Neto: '34.400',
      'Peso Neto': '35.920',
      'N Remito': '66008',
      Chofer: 'OCHOA ANIBAL',
    },
    'LCE|IMG-261019121152-001.PDF': {
      Material: 'ARENA GRANITICA 0/6',
    },
    'LCE|IMG-261019121422-001.PDF': {
      Fecha: '15/10/2026',
      'N Remito': '112388',
      Material: 'ARENA GRANITICA 0/6',
      Neto: '34.960',
      Chofer: 'LEDESMA CAMILO',
      'Peso Neto': '34.540',
    },
  },

  // Patentes verificadas por ticket (cuando el chofer no alcanza a resolver).
  patentesPorTicket: {
    'LCE|112392': 'AH784OW',
  },
};
