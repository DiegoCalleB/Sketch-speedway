import { Track, TrackPoint, Point, AIArchetype } from '../types';

// Ray-casting algorithm for point-in-polygon check
export function isPointInPolygon(p: TrackPoint, polygon: TrackPoint[]): boolean {
  let isInside = false;
  const len = polygon.length;
  for (let i = 0, j = len - 1; i < len; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersect) isInside = !isInside;
  }
  return isInside;
}

// Distance between two points
export function getDistance(p1: TrackPoint, p2: TrackPoint): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

// Distance from point P to segment AB
export function distToSegment(
  p: TrackPoint,
  a: TrackPoint,
  b: TrackPoint
): { dist: number; closest: TrackPoint; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { dist: Math.hypot(p.x - a.x, p.y - a.y), closest: { x: a.x, y: a.y }, t: 0 };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closest = { x: a.x + t * dx, y: a.y + t * dy };
  return { dist: Math.hypot(p.x - closest.x, p.y - closest.y), closest, t };
}

// Check if a line segment intersects another line segment
export function lineIntersects(
  a1: TrackPoint,
  a2: TrackPoint,
  b1: TrackPoint,
  b2: TrackPoint
): boolean {
  const det = (a2.x - a1.x) * (b2.y - b1.y) - (b2.x - b1.x) * (a2.y - a1.y);
  if (det === 0) return false; // Parallel

  const lambda = ((b2.y - b1.y) * (b2.x - a1.x) + (b1.x - b2.x) * (b2.y - a1.y)) / det;
  const gamma = ((a1.y - a2.y) * (b2.x - a1.x) + (a2.x - a1.x) * (b2.y - a1.y)) / det;

  return 0 <= lambda && lambda <= 1 && 0 <= gamma && gamma <= 1;
}

// Create a gate segment spanning from outerBoundary[idx] to innerBoundary[idx] with safety margin
function createGateAt(
  outer: TrackPoint[],
  inner: TrackPoint[],
  idx: number,
  margin: number = 14
): { p1: TrackPoint; p2: TrackPoint } {
  const o = outer[idx % outer.length];
  const i = inner[idx % inner.length];
  const dx = o.x - i.x;
  const dy = o.y - i.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;
  return {
    p1: { x: o.x + nx * margin, y: o.y + ny * margin },
    p2: { x: i.x - nx * margin, y: i.y - ny * margin }
  };
}

// Generate smooth ellipse points
function generateEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  count: number
): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry
    });
  }
  return points;
}

// Track 1: Oval (Easy) — fits cleanly within [60..740] x [55..445]
const outer1 = generateEllipse(400, 250, 340, 192, 72);
const inner1 = generateEllipse(400, 250, 215, 96, 72);

// Track 2: S-Curve / Technical (Medium) — fits cleanly within [55..745] x [45..455]
function generateTrack2Points(): { outer: TrackPoint[]; inner: TrackPoint[] } {
  const outer: TrackPoint[] = [];
  const inner: TrackPoint[] = [];
  const count = 80;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    let rCenter = 168;
    const halfWidth = 48;

    const wave1 = Math.sin(angle * 2) * 26;
    const wave2 = Math.cos(angle * 3) * 14;
    rCenter += wave1 + wave2;

    const rOuter = rCenter + halfWidth;
    const rInner = rCenter - halfWidth;

    const cx = 400;
    const cy = 250;
    const scaleX = 1.32;
    const scaleY = 0.86;

    outer.push({
      x: cx + Math.cos(angle) * rOuter * scaleX,
      y: cy + Math.sin(angle) * rOuter * scaleY
    });

    inner.push({
      x: cx + Math.cos(angle) * rInner * scaleX,
      y: cy + Math.sin(angle) * rInner * scaleY
    });
  }

  return { outer, inner };
}

const track2Points = generateTrack2Points();

function buildSplineTrack(
  centerlineKeypoints: TrackPoint[],
  halfWidth: number = 36,
  targetCount: number = 112
): { outer: TrackPoint[]; inner: TrackPoint[] } {
  const denseCenterline: TrackPoint[] = [];
  const len = centerlineKeypoints.length;
  const subSteps = 20;

  for (let i = 0; i < len; i++) {
    const p0 = centerlineKeypoints[(i - 1 + len) % len];
    const p1 = centerlineKeypoints[i];
    const p2 = centerlineKeypoints[(i + 1) % len];
    const p3 = centerlineKeypoints[(i + 2) % len];

    for (let j = 0; j < subSteps; j++) {
      const t = j / subSteps;
      const t2 = t * t;
      const t3 = t2 * t;

      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

      denseCenterline.push({ x, y });
    }
  }

  // Apply gentle Laplacian smoothing pass on dense centerline to prevent high-frequency curvature spikes
  let smoothedDense = denseCenterline;
  for (let pass = 0; pass < 3; pass++) {
    const nDense = smoothedDense.length;
    smoothedDense = smoothedDense.map((pt, idx) => {
      const prev = smoothedDense[(idx - 1 + nDense) % nDense];
      const next = smoothedDense[(idx + 1) % nDense];
      return {
        x: pt.x * 0.5 + (prev.x + next.x) * 0.25,
        y: pt.y * 0.5 + (prev.y + next.y) * 0.25
      };
    });
  }

  // Resample closed loop to uniform arc-length steps (targetCount vertices)
  const denseLen = smoothedDense.length;
  const cumArc: number[] = [0];
  let totalArc = 0;
  for (let i = 0; i < denseLen; i++) {
    const curr = smoothedDense[i];
    const next = smoothedDense[(i + 1) % denseLen];
    totalArc += Math.hypot(next.x - curr.x, next.y - curr.y);
    cumArc.push(totalArc);
  }

  const uniformCenterline: TrackPoint[] = [];
  let segIdx = 0;
  for (let k = 0; k < targetCount; k++) {
    const targetDist = (k / targetCount) * totalArc;
    while (segIdx < denseLen - 1 && cumArc[segIdx + 1] < targetDist) {
      segIdx++;
    }
    const d0 = cumArc[segIdx];
    const d1 = cumArc[segIdx + 1];
    const ratio = d1 > d0 ? (targetDist - d0) / (d1 - d0) : 0;
    const pA = smoothedDense[segIdx];
    const pB = smoothedDense[(segIdx + 1) % denseLen];
    uniformCenterline.push({
      x: pA.x + (pB.x - pA.x) * ratio,
      y: pA.y + (pB.y - pA.y) * ratio
    });
  }

  // Compute smoothed normals across a window so tight hairpins never self-intersect on inner/outer boundaries
  const rawNormals: TrackPoint[] = [];
  for (let i = 0; i < targetCount; i++) {
    const prev = uniformCenterline[(i - 2 + targetCount) % targetCount];
    const next = uniformCenterline[(i + 2) % targetCount];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tLen = Math.hypot(tx, ty) || 1;
    rawNormals.push({ x: ty / tLen, y: -tx / tLen });
  }

  const outer: TrackPoint[] = [];
  const inner: TrackPoint[] = [];

  for (let i = 0; i < targetCount; i++) {
    let sx = 0;
    let sy = 0;
    for (let w = -2; w <= 2; w++) {
      const n = rawNormals[(i + w + targetCount) % targetCount];
      sx += n.x;
      sy += n.y;
    }
    const sLen = Math.hypot(sx, sy) || 1;
    const nx = sx / sLen;
    const ny = sy / sLen;
    const curr = uniformCenterline[i];

    outer.push({
      x: curr.x + nx * halfWidth,
      y: curr.y + ny * halfWidth
    });
    inner.push({
      x: curr.x - nx * halfWidth,
      y: curr.y - ny * halfWidth
    });
  }

  return { outer, inner };
}

// Automatically build a 4-slot staggered F1 starting grid aligned with the track tangent behind startLineIdx
function createAlignedStartGrid(
  outer: TrackPoint[],
  inner: TrackPoint[],
  startLineIdx: number
): { x: number; y: number; angle: number }[] {
  const len = Math.min(outer.length, inner.length);
  const centerAt = (idx: number): TrackPoint => {
    const i = ((idx % len) + len) % len;
    return {
      x: (outer[i].x + inner[i].x) * 0.5,
      y: (outer[i].y + inner[i].y) * 0.5
    };
  };

  // Place the 4 grid slots at indices behind startLineIdx along the main straight
  const slotConfigs = [
    { offsetIdx: -2, lateralBias: -0.22 },
    { offsetIdx: -3, lateralBias: 0.22 },
    { offsetIdx: -4, lateralBias: -0.22 },
    { offsetIdx: -5, lateralBias: 0.22 }
  ];

  const cStart = centerAt(startLineIdx - 4);
  const cEnd = centerAt(startLineIdx + 1);
  const straightAngle = Math.atan2(cEnd.y - cStart.y, cEnd.x - cStart.x);

  return slotConfigs.map(({ offsetIdx, lateralBias }) => {
    const idx = ((startLineIdx + offsetIdx) % len + len) % len;
    const o = outer[idx];
    const i = inner[idx];
    const cx = (o.x + i.x) * 0.5;
    const cy = (o.y + i.y) * 0.5;
    const rx = (o.x - i.x) * 0.5;
    const ry = (o.y - i.y) * 0.5;
    return {
      x: Number((cx + rx * lateralBias).toFixed(1)),
      y: Number((cy + ry * lateralBias).toFixed(1)),
      angle: Number(straightAngle.toFixed(3))
    };
  });
}

// Track 3: Templo de la Velocidad (Autodromo Nazionale Monza GP)
// Authentic Italian GP pistol/boot silhouette: Long southern Rettifilo straight, Curva Grande on the west,
// Roggia & Lesmo 1/2 at the north, diagonal Serraglio straight into Ascari, and iconic 180° Parabolica on the east
const track3Points = buildSplineTrack(
  [
    { x: 535, y: 394 }, // Rettifilo Tribune start
    { x: 345, y: 394 }, // Rettifilo Main Straight mid
    { x: 168, y: 376 }, // Braking into Variante del Rettifilo
    { x: 116, y: 272 }, // Curva Grande (Biassono)
    { x: 158, y: 144 }, // Approach to Variante della Roggia
    { x: 288, y: 114 }, // Curve di Lesmo 1
    { x: 410, y: 136 }, // Curve di Lesmo 2
    { x: 525, y: 184 }, // Discesa del Serraglio
    { x: 642, y: 188 }, // Variante Ascari
    { x: 692, y: 284 }, // Rettilineo Centrale into Parabolica entry
    { x: 652, y: 380 }  // Curva Parabolica (Alboreto) 180° apex
  ],
  40,
  112
);

// Track 4: Circuito del Jarama – RACE (Madrid)
// Authentic Spanish GP layout: Long northern main straight past Torre del Jarama, Nuvolari & Fangio loop,
// inward Varzi / Farina / Le Mans hairpin fold, Pegaso ramp, Ascari/Bugatti Esses, and María de Villota (Túnel) 180° turn
const jaramaPoints = buildSplineTrack(
  [
    { x: 182, y: 122 }, // Salida Curva María de Villota -> Recta Principal
    { x: 350, y: 118 }, // Recta Principal frente a Torre del Jarama
    { x: 520, y: 122 }, // Final Recta Principal / Frenada Nuvolari
    { x: 654, y: 142 }, // Curva Fangio (Noreste)
    { x: 674, y: 218 }, // Bajada hacia Varzi
    { x: 576, y: 244 }, // Horquilla Farina / Le Mans (pliegue interior característico del Jarama)
    { x: 568, y: 312 }, // Salida Le Mans hacia Curva Hípica
    { x: 654, y: 338 }, // Subida Rampa Pegaso (Sureste)
    { x: 634, y: 396 }, // Coronación Pegaso hacia S de Ascari
    { x: 492, y: 394 }, // Curva Portago
    { x: 375, y: 340 }, // Ese de Bugatti (cresta)
    { x: 238, y: 392 }, // Bajada Bugatti / Curva Monza
    { x: 128, y: 336 }, // Curva María de Villota (Túnel)
    { x: 118, y: 210 }  // Salida Túnel hacia Recta Principal
  ],
  40,
  112
);

// Track 5: Madring F1 – Circuito de Madrid IFEMA (2026 Spanish GP)
// Authentic IFEMA-Valdebebas dual-zone silhouette: Western IFEMA exhibition halls straight & 90° street corners,
// fast northern Valdebebas highway stretch, wide semicircular banked "La Monumental" on the east, and technical return
const madringPoints = buildSplineTrack(
  [
    { x: 128, y: 274 }, // Recta Principal IFEMA (Oeste)
    { x: 134, y: 156 }, // Frenada Pabellón 1 IFEMA
    { x: 238, y: 116 }, // Curva Avenida Partenón
    { x: 338, y: 166 }, // Chicane técnica entre Pabellones IFEMA
    { x: 448, y: 122 }, // Salida hacia enlace M-11 Valdebebas
    { x: 588, y: 118 }, // Recta rápida de Valdebebas
    { x: 682, y: 180 }, // Entrada a La Monumental (curva peraltada semicircular)
    { x: 694, y: 280 }, // Ápice central de La Monumental (Este)
    { x: 642, y: 382 }, // Salida de La Monumental
    { x: 502, y: 390 }, // Sector rápido Valdebebas Sur
    { x: 385, y: 334 }, // Enlazadas rápidas de retorno
    { x: 254, y: 390 }, // Entrada a recinto ferial Sur
    { x: 146, y: 364 }  // Última curva hacia Recta Principal IFEMA
  ],
  40,
  112
);

// Track 6: Circuit de Monaco – Monte-Carlo
// Authentic Principality street layout: Boulevard Albert Ier start straight, Sainte-Dévote (T1), uphill Beau Rivage
// to Massenet & Casino Square, tight Mirabeau / Fairmont Hairpin / Portier fold, coastal Louis II Tunnel on the east,
// Nouvelle Chicane, Tabac & Piscine complex along the southern yacht harbor, and La Rascasse hairpin
const monacoPoints = buildSplineTrack(
  [
    { x: 146, y: 278 }, // Boulevard Albert Ier (Recta de Salida)
    { x: 198, y: 168 }, // Sainte-Dévote (Curva 1) & subida Beau Rivage
    { x: 314, y: 118 }, // Massenet
    { x: 435, y: 116 }, // Place du Casino
    { x: 508, y: 182 }, // Mirabeau & Horquilla Fairmont (pliegue interior)
    { x: 615, y: 142 }, // Portier hacia la costa
    { x: 686, y: 226 }, // Entrada Túnel Louis II (costa Este)
    { x: 662, y: 340 }, // Salida del Túnel hacia el Puerto
    { x: 550, y: 380 }, // Nouvelle Chicane
    { x: 455, y: 332 }, // Curva Tabac (frente al puerto deportivo)
    { x: 345, y: 390 }, // Complejo de la Piscina (Louis Chiron)
    { x: 206, y: 388 }, // La Rascasse & Antony Noghès
    { x: 140, y: 346 }  // Retorno a Boulevard Albert Ier
  ],
  40,
  112
);

export const TRACKS: Track[] = [
  {
    id: 'jarama',
    name: 'Circuito del Jarama – RACE',
    difficulty: 'Medio',
    description:
      'Trazado histórico de Madrid con la recta principal frente a la Torre RACE, horquillas Farina/Le Mans, rampa Pegaso y bajada Bugatti.',
    width: 800,
    height: 500,
    outerBoundary: jaramaPoints.outer,
    innerBoundary: jaramaPoints.inner,
    startGrid: createAlignedStartGrid(jaramaPoints.outer, jaramaPoints.inner, 8),
    startLine: createGateAt(jaramaPoints.outer, jaramaPoints.inner, 8, 14),
    checkpoints: [
      createGateAt(jaramaPoints.outer, jaramaPoints.inner, 36, 14),
      createGateAt(jaramaPoints.outer, jaramaPoints.inner, 64, 14),
      createGateAt(jaramaPoints.outer, jaramaPoints.inner, 92, 14)
    ],
    trees: [
      { x: 75, y: 65, size: 19, type: 'pine' },
      { x: 730, y: 65, size: 19, type: 'pine' },
      { x: 735, y: 435, size: 18, type: 'pine' },
      { x: 70, y: 435, size: 18, type: 'pine' },
      { x: 245, y: 235, size: 17, type: 'pine' },
      { x: 385, y: 245, size: 16, type: 'pine' }
    ],
    grandstands: [
      { x: 335, y: 30, width: 210, height: 15, angle: 0, title: 'TRIBUNA PRINCIPAL JARAMA · RACE' },
      { x: 560, y: 474, width: 150, height: 14, angle: 0, title: 'GRADERÍO FARINA & PEGASO' }
    ],
    decorations: [
      { x: 280, y: 225, type: 'flag', color: '#dc2626' },
      { x: 140, y: 468, type: 'tent', color: '#f59e0b' },
      { x: 685, y: 468, type: 'tent', color: '#ef4444' }
    ]
  },
  {
    id: 'madring',
    name: 'Madring F1 – Madrid IFEMA',
    difficulty: 'Difícil',
    description:
      'Circuito semiurbano del GP de España en IFEMA-Valdebebas con rápidas avenidas, chicanes entre pabellones y la curva peraltada La Monumental.',
    width: 800,
    height: 500,
    outerBoundary: madringPoints.outer,
    innerBoundary: madringPoints.inner,
    startGrid: createAlignedStartGrid(madringPoints.outer, madringPoints.inner, 6),
    startLine: createGateAt(madringPoints.outer, madringPoints.inner, 6, 14),
    checkpoints: [
      createGateAt(madringPoints.outer, madringPoints.inner, 34, 14),
      createGateAt(madringPoints.outer, madringPoints.inner, 62, 14),
      createGateAt(madringPoints.outer, madringPoints.inner, 90, 14)
    ],
    trees: [
      { x: 65, y: 60, size: 18, type: 'leaf' },
      { x: 735, y: 60, size: 18, type: 'leaf' },
      { x: 735, y: 440, size: 18, type: 'pine' },
      { x: 65, y: 440, size: 18, type: 'leaf' },
      { x: 235, y: 265, size: 16, type: 'leaf' }
    ],
    grandstands: [
      { x: 280, y: 30, width: 200, height: 15, angle: 0, title: 'PADDOCK CLUB IFEMA MADRID' },
      { x: 580, y: 474, width: 175, height: 15, angle: 0, title: 'ARENA LA MONUMENTAL' }
    ],
    decorations: [
      { x: 475, y: 245, type: 'flag', color: '#ec4899' },
      { x: 200, y: 468, type: 'tent', color: '#38bdf8' },
      { x: 535, y: 245, type: 'tent', color: '#f43f5e' }
    ]
  },
  {
    id: 'monaco',
    name: 'Circuit de Monaco – Monte-Carlo',
    difficulty: 'Difícil',
    description:
      'El legendario trazado urbano del Principado: Sainte-Dévote, Casino, horquilla Fairmont, el Túnel Louis II junto al puerto y la Piscina.',
    width: 800,
    height: 500,
    outerBoundary: monacoPoints.outer,
    innerBoundary: monacoPoints.inner,
    startGrid: createAlignedStartGrid(monacoPoints.outer, monacoPoints.inner, 6),
    startLine: createGateAt(monacoPoints.outer, monacoPoints.inner, 6, 14),
    checkpoints: [
      createGateAt(monacoPoints.outer, monacoPoints.inner, 34, 14),
      createGateAt(monacoPoints.outer, monacoPoints.inner, 62, 14),
      createGateAt(monacoPoints.outer, monacoPoints.inner, 90, 14)
    ],
    trees: [
      { x: 65, y: 65, size: 19, type: 'leaf' },
      { x: 735, y: 65, size: 19, type: 'leaf' },
      { x: 265, y: 255, size: 17, type: 'leaf' },
      { x: 545, y: 255, size: 16, type: 'pine' }
    ],
    grandstands: [
      { x: 350, y: 28, width: 195, height: 15, angle: 0, title: 'PLACE DU CASINO · MONTE-CARLO' },
      { x: 380, y: 475, width: 210, height: 15, angle: 0, title: 'YACHT CLUB & PISCINE HARBOR' }
    ],
    decorations: [
      { x: 425, y: 255, type: 'flag', color: '#ef4444' },
      { x: 135, y: 468, type: 'tent', color: '#f8fafc' },
      { x: 665, y: 468, type: 'tent', color: '#dc2626' }
    ]
  },
  {
    id: 'oval',
    name: 'Circuito Óvalo de Iniciación',
    difficulty: 'Fácil',
    description:
      'Dos grandes rectas para acelerar a fondo y dos curvas de 180° donde debes dosificar el trazo para no derrapar.',
    width: 800,
    height: 500,
    outerBoundary: outer1,
    innerBoundary: inner1,
    startGrid: [
      { x: 385, y: 382, angle: 0 },
      { x: 355, y: 406, angle: 0 },
      { x: 325, y: 380, angle: 0 },
      { x: 295, y: 404, angle: 0 }
    ],
    startLine: createGateAt(outer1, inner1, 18, 14),
    checkpoints: [
      createGateAt(outer1, inner1, 0, 14),
      createGateAt(outer1, inner1, 54, 14),
      createGateAt(outer1, inner1, 36, 14)
    ],
    trees: [
      { x: 260, y: 225, size: 18, type: 'leaf' },
      { x: 290, y: 265, size: 15, type: 'pine' },
      { x: 540, y: 225, size: 18, type: 'leaf' },
      { x: 510, y: 265, size: 15, type: 'pine' },
      { x: 65, y: 65, size: 20, type: 'pine' },
      { x: 735, y: 65, size: 20, type: 'pine' },
      { x: 65, y: 435, size: 20, type: 'leaf' },
      { x: 735, y: 435, size: 20, type: 'leaf' }
    ],
    grandstands: [
      { x: 400, y: 26, width: 220, height: 16, angle: 0, title: 'TRIBUNA DE HONOR OVAL' },
      { x: 230, y: 474, width: 120, height: 15, angle: 0, title: 'PADDOCK GENERAL' }
    ],
    decorations: [
      { x: 400, y: 230, type: 'flag', color: '#3b82f6' },
      { x: 130, y: 472, type: 'tent', color: '#8b5cf6' },
      { x: 670, y: 472, type: 'tent', color: '#10b981' }
    ]
  },
  {
    id: 'forest',
    name: 'Circuito S-Bucle Forestal',
    difficulty: 'Medio',
    description:
      'Curvas enlazadas en S y cambios de apoyo que exigen frenar el trazo antes de cada vértice y acelerar al salir.',
    width: 800,
    height: 500,
    outerBoundary: track2Points.outer,
    innerBoundary: track2Points.inner,
    startGrid: [
      { x: 385, y: 382, angle: 0 },
      { x: 355, y: 404, angle: 0 },
      { x: 325, y: 378, angle: 0 },
      { x: 295, y: 400, angle: 0 }
    ],
    startLine: createGateAt(track2Points.outer, track2Points.inner, 20, 14),
    checkpoints: [
      createGateAt(track2Points.outer, track2Points.inner, 0, 14),
      createGateAt(track2Points.outer, track2Points.inner, 60, 14),
      createGateAt(track2Points.outer, track2Points.inner, 40, 14)
    ],
    trees: [
      { x: 400, y: 250, size: 20, type: 'leaf' },
      { x: 435, y: 265, size: 16, type: 'pine' },
      { x: 365, y: 240, size: 16, type: 'pine' },
      { x: 75, y: 60, size: 20, type: 'pine' },
      { x: 725, y: 65, size: 20, type: 'pine' },
      { x: 735, y: 435, size: 20, type: 'pine' },
      { x: 75, y: 435, size: 20, type: 'pine' }
    ],
    grandstands: [
      { x: 400, y: 22, width: 140, height: 14, angle: 0, title: 'TRIBUNA FOREST' }
    ],
    decorations: [
      { x: 335, y: 235, type: 'tent', color: '#eab308' },
      { x: 465, y: 235, type: 'tent', color: '#06b6d4' }
    ]
  },
  {
    id: 'grandprix',
    name: 'Templo de la Velocidad',
    difficulty: 'Difícil',
    description:
      'Trazado clásico de Monza GP: larguísima recta Rettifilo, Curva Grande, Lesmo 1 y 2, bajada del Serraglio hacia Ascari y la mítica Parabólica.',
    width: 800,
    height: 500,
    outerBoundary: track3Points.outer,
    innerBoundary: track3Points.inner,
    startGrid: createAlignedStartGrid(track3Points.outer, track3Points.inner, 8),
    startLine: createGateAt(track3Points.outer, track3Points.inner, 8, 14),
    checkpoints: [
      createGateAt(track3Points.outer, track3Points.inner, 36, 14),
      createGateAt(track3Points.outer, track3Points.inner, 64, 14),
      createGateAt(track3Points.outer, track3Points.inner, 92, 14)
    ],
    trees: [
      { x: 55, y: 55, size: 20, type: 'pine' },
      { x: 745, y: 60, size: 20, type: 'pine' },
      { x: 745, y: 440, size: 18, type: 'leaf' },
      { x: 55, y: 440, size: 18, type: 'pine' },
      { x: 260, y: 255, size: 16, type: 'leaf' },
      { x: 485, y: 285, size: 16, type: 'pine' }
    ],
    grandstands: [
      { x: 410, y: 476, width: 210, height: 15, angle: 0, title: 'TRIBUNA CENTRALE RETTIFILO · MONZA' },
      { x: 320, y: 30, width: 150, height: 14, angle: 0, title: 'CURVA DI LESMO & SERRAGLIO' }
    ],
    decorations: [
      { x: 350, y: 265, type: 'flag', color: '#ef4444' },
      { x: 100, y: 465, type: 'tent', color: '#f43f5e' }
    ]
  }
];

export function checkSegmentCrossing(
  oldPos: TrackPoint,
  newPos: TrackPoint,
  line: { p1: TrackPoint; p2: TrackPoint }
): boolean {
  return lineIntersects(oldPos, newPos, line.p1, line.p2);
}

export function getTrackCenterline(track: Track): TrackPoint[] {
  const outer = track.outerBoundary;
  const inner = track.innerBoundary;
  const len = Math.min(outer.length, inner.length);
  const centerline: TrackPoint[] = [];
  for (let i = 0; i < len; i++) {
    centerline.push({
      x: (outer[i].x + inner[i].x) / 2,
      y: (outer[i].y + inner[i].y) / 2
    });
  }
  return centerline;
}

// Compute smooth 3D banking (peralte) profile for each ring index around the circuit
export function getTrackBankingProfile(track: Track): {
  outerZ: number;
  innerZ: number;
  bankAngleRad: number;
  curvature: number;
  turnSign: number;
}[] {
  const outer = track.outerBoundary;
  const inner = track.innerBoundary;
  const len = Math.min(outer.length, inner.length);

  const rawCurv: number[] = [];
  const rawSign: number[] = [];

  for (let i = 0; i < len; i++) {
    const pPrev = {
      x: (outer[(i - 2 + len) % len].x + inner[(i - 2 + len) % len].x) * 0.5,
      y: (outer[(i - 2 + len) % len].y + inner[(i - 2 + len) % len].y) * 0.5
    };
    const pCurr = {
      x: (outer[i].x + inner[i].x) * 0.5,
      y: (outer[i].y + inner[i].y) * 0.5
    };
    const pNext = {
      x: (outer[(i + 2) % len].x + inner[(i + 2) % len].x) * 0.5,
      y: (outer[(i + 2) % len].y + inner[(i + 2) % len].y) * 0.5
    };

    const d1 = Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y) || 1;
    const d2 = Math.hypot(pNext.x - pCurr.x, pNext.y - pCurr.y) || 1;
    const a1 = Math.atan2(pCurr.y - pPrev.y, pCurr.x - pPrev.x);
    const a2 = Math.atan2(pNext.y - pCurr.y, pNext.x - pCurr.x);
    let dAngle = a2 - a1;
    while (dAngle > Math.PI) dAngle -= Math.PI * 2;
    while (dAngle < -Math.PI) dAngle += Math.PI * 2;

    rawCurv.push(Math.abs(dAngle) / ((d1 + d2) * 0.5));
    rawSign.push(Math.sign(dAngle) || 1);
  }

  // Smooth the curvature over a 5-point window so banking transitions are silky smooth
  const profile: {
    outerZ: number;
    innerZ: number;
    bankAngleRad: number;
    curvature: number;
    turnSign: number;
  }[] = [];

  for (let i = 0; i < len; i++) {
    let sumCurv = 0;
    for (let k = -2; k <= 2; k++) {
      sumCurv += rawCurv[(i + k + len) % len];
    }
    const smoothCurv = sumCurv / 5;
    const width = Math.hypot(outer[i].x - inner[i].x, outer[i].y - inner[i].y) || 88;
    // Raise the outside of curves up to +4.2 units (realistic F1/NASCAR banking)
    const bankHeight = Math.min(4.2, Math.max(0, (smoothCurv - 0.0025) * 340));
    const outerZ = 0.35 + bankHeight;
    const innerZ = 0.32;
    const bankAngleRad = Math.atan2(outerZ - innerZ, width);

    profile.push({
      outerZ,
      innerZ,
      bankAngleRad,
      curvature: smoothCurv,
      turnSign: rawSign[i]
    });
  }

  return profile;
}

// Physical Guardrail ("Quitamiedos") & Trackside Obstacle Offsets (world units beyond track asphalt edge)
// These constants are shared 1:1 between the 3D WebGL TrackMesh geometry and the rigid-body collision physics!
export const OUTER_GUARDRAIL_OFFSET = 13.5; // Continuous outer FIA Tecpro & steel Armco barrier offset outside outerBoundary
export const INNER_GUARDRAIL_OFFSET = 9.5;  // Continuous inner FIA Armco guardrail offset inside innerBoundary (infield perimeter)

// Analyze where a point is relative to the track centerline, boundaries, guardrails, and local track curvature.
// If hintSegmentIdx is provided, searches a local progressive window around hintSegmentIdx first so a car
// can NEVER teleport or snap through an infield guardrail wall onto a different leg of the circuit!
export function getTrackSurfaceInfo(
  pt: TrackPoint,
  track: Track,
  hintSegmentIdx?: number
): {
  onAsphalt: boolean;
  onCurbOrGrass: boolean;
  hitBarrier: boolean;
  closestCenterPt: TrackPoint;
  inwardNormal: TrackPoint;
  outwardEdgeVec: TrackPoint;
  distFromCenter: number;
  signedLateralDist: number; // + toward outer guardrail, - toward inner infield guardrail
  halfWidth: number;
  outerBarrierDistFromCenter: number;
  innerBarrierDistFromCenter: number;
  segmentIdx: number;
  trackCurvature: number; // radians per pixel of centerline turn
  trackTurnSign: number;
  elevationZ: number;
  bankAngleRad: number;
} {
  const outer = track.outerBoundary;
  const inner = track.innerBoundary;
  const len = Math.min(outer.length, inner.length);

  let minDist = Infinity;
  let bestIdx = 0;
  let bestClosest: TrackPoint = { x: 400, y: 250 };
  let bestT = 0;

  const evaluateSegment = (i: number) => {
    const nIdx = (i + 1) % len;
    const c1 = { x: (outer[i].x + inner[i].x) * 0.5, y: (outer[i].y + inner[i].y) * 0.5 };
    const c2 = { x: (outer[nIdx].x + inner[nIdx].x) * 0.5, y: (outer[nIdx].y + inner[nIdx].y) * 0.5 };
    const res = distToSegment(pt, c1, c2);
    if (res.dist < minDist) {
      minDist = res.dist;
      bestIdx = i;
      bestClosest = res.closest;
      bestT = res.t;
    }
  };

  if (typeof hintSegmentIdx === 'number' && hintSegmentIdx >= 0 && hintSegmentIdx < len) {
    // Search a progressive window of ±12 segments around the car's current track progression
    const windowRadius = Math.min(14, Math.floor(len * 0.16));
    for (let offset = -windowRadius; offset <= windowRadius; offset++) {
      const i = (hintSegmentIdx + offset + len * 4) % len;
      evaluateSegment(i);
    }
    // Only fall back to full global search if the point is extraordinarily far from the local corridor (> 145 units)
    if (minDist > 145) {
      for (let i = 0; i < len; i++) {
        evaluateSegment(i);
      }
    }
  } else {
    for (let i = 0; i < len; i++) {
      evaluateSegment(i);
    }
  }

  // Compute local centerline curvature at bestIdx
  const pPrev = {
    x: (outer[(bestIdx - 2 + len) % len].x + inner[(bestIdx - 2 + len) % len].x) * 0.5,
    y: (outer[(bestIdx - 2 + len) % len].y + inner[(bestIdx - 2 + len) % len].y) * 0.5
  };
  const pCurr = {
    x: (outer[bestIdx].x + inner[bestIdx].x) * 0.5,
    y: (outer[bestIdx].y + inner[bestIdx].y) * 0.5
  };
  const pNext = {
    x: (outer[(bestIdx + 2) % len].x + inner[(bestIdx + 2) % len].x) * 0.5,
    y: (outer[(bestIdx + 2) % len].y + inner[(bestIdx + 2) % len].y) * 0.5
  };

  const d1 = Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y) || 1;
  const d2 = Math.hypot(pNext.x - pCurr.x, pNext.y - pCurr.y) || 1;
  const a1 = Math.atan2(pCurr.y - pPrev.y, pCurr.x - pPrev.x);
  const a2 = Math.atan2(pNext.y - pCurr.y, pNext.x - pCurr.x);
  let dAngle = a2 - a1;
  while (dAngle > Math.PI) dAngle -= Math.PI * 2;
  while (dAngle < -Math.PI) dAngle += Math.PI * 2;

  const trackCurvature = Math.abs(dAngle) / ((d1 + d2) * 0.5);
  const trackTurnSign = Math.sign(dAngle) || 1;

  const nBestIdx = (bestIdx + 1) % len;
  const outerPt = {
    x: outer[bestIdx].x + (outer[nBestIdx].x - outer[bestIdx].x) * bestT,
    y: outer[bestIdx].y + (outer[nBestIdx].y - outer[bestIdx].y) * bestT
  };
  const innerPt = {
    x: inner[bestIdx].x + (inner[nBestIdx].x - inner[bestIdx].x) * bestT,
    y: inner[bestIdx].y + (inner[nBestIdx].y - inner[bestIdx].y) * bestT
  };
  const halfWidth = Math.hypot(outerPt.x - innerPt.x, outerPt.y - innerPt.y) * 0.5;

  // Vector pointing from inner apex toward outer curb of the track at interpolated segment point
  const oDx = outerPt.x - innerPt.x;
  const oDy = outerPt.y - innerPt.y;
  const oLen = Math.hypot(oDx, oDy) || 1;
  const outwardEdgeVec = { x: oDx / oLen, y: oDy / oLen };

  // Signed lateral projection from centerline (+ = toward outer boundary, - = toward inner infield boundary)
  const relFromCenterX = pt.x - bestClosest.x;
  const relFromCenterY = pt.y - bestClosest.y;
  const radialDot = relFromCenterX * outwardEdgeVec.x + relFromCenterY * outwardEdgeVec.y;
  const signedLateralDist = radialDot >= 0 ? minDist : -minDist;

  // Inward normal ALWAYS points from the car back toward the track centerline
  const dx = bestClosest.x - pt.x;
  const dy = bestClosest.y - pt.y;
  const dLen = Math.hypot(dx, dy);
  const inwardNormal =
    dLen > 0.001
      ? { x: dx / dLen, y: dy / dLen }
      : { x: -outwardEdgeVec.x * Math.sign(radialDot || 1), y: -outwardEdgeVec.y * Math.sign(radialDot || 1) };

  const outerBarrierDistFromCenter = halfWidth + OUTER_GUARDRAIL_OFFSET;
  const innerBarrierDistFromCenter = halfWidth + INNER_GUARDRAIL_OFFSET;

  const onAsphalt = minDist <= halfWidth + 1.8;
  // Exact 3D painted FIA kerb strip width (~2.4–3.4 units); beyond +3.2 up to the guardrail is deep gravel/grass runoff!
  const onCurbOrGrass = !onAsphalt && minDist <= halfWidth + 3.2;
  const hitBarrier =
    radialDot >= 0
      ? minDist > outerBarrierDistFromCenter
      : minDist > innerBarrierDistFromCenter;

  // Compute banking height & roll angle at this point
  const distToInner = Math.hypot(pt.x - innerPt.x, pt.y - innerPt.y);
  const radialRatio = Math.max(0, Math.min(1, distToInner / Math.max(1, halfWidth * 2)));
  const bankHeight = Math.min(4.2, Math.max(0, (trackCurvature - 0.0025) * 340));
  const elevationZ = onAsphalt ? 0.32 + bankHeight * radialRatio : 0.25;
  const bankAngleRad = onAsphalt ? Math.atan2(bankHeight, halfWidth * 2) : 0;

  return {
    onAsphalt,
    onCurbOrGrass,
    hitBarrier,
    closestCenterPt: bestClosest,
    inwardNormal,
    outwardEdgeVec,
    distFromCenter: minDist,
    signedLateralDist,
    halfWidth,
    outerBarrierDistFromCenter,
    innerBarrierDistFromCenter,
    segmentIdx: bestIdx,
    trackCurvature,
    trackTurnSign,
    elevationZ,
    bankAngleRad
  };
}

/**
 * Constrain a user-drawn point so the player's finger/cursor cannot draw a racing line that passes
 * through the physical 3D inner or outer guardrails ("quitamiedos") or cuts across the infield to another leg.
 */
export function clampDrawnPointToTrackCorridor(
  rawPt: TrackPoint,
  track: Track,
  prevSegmentIdx?: number
): { pt: TrackPoint; segmentIdx: number; clampedAgainstBarrier: boolean } {
  const surf = getTrackSurfaceInfo(rawPt, track, prevSegmentIdx);
  // Keep drawn centerline target inside the physical guardrail face minus car half-width margin (3.3 units)
  const maxOuterDraw = surf.outerBarrierDistFromCenter - 3.3;
  const maxInnerDraw = surf.innerBarrierDistFromCenter - 3.3;

  if (surf.signedLateralDist > maxOuterDraw) {
    return {
      pt: {
        x: surf.closestCenterPt.x + surf.outwardEdgeVec.x * maxOuterDraw,
        y: surf.closestCenterPt.y + surf.outwardEdgeVec.y * maxOuterDraw
      },
      segmentIdx: surf.segmentIdx,
      clampedAgainstBarrier: true
    };
  }
  if (-surf.signedLateralDist > maxInnerDraw) {
    return {
      pt: {
        x: surf.closestCenterPt.x - surf.outwardEdgeVec.x * maxInnerDraw,
        y: surf.closestCenterPt.y - surf.outwardEdgeVec.y * maxInnerDraw
      },
      segmentIdx: surf.segmentIdx,
      clampedAgainstBarrier: true
    };
  }
  return {
    pt: rawPt,
    segmentIdx: surf.segmentIdx,
    clampedAgainstBarrier: false
  };
}

export interface TrackObstacleCollider {
  x: number;
  y: number;
  radius: number;
  kind: 'tire_stack' | 'pillar';
}

const _trackObstacleCache = new Map<string, TrackObstacleCollider[]>();

/**
 * Compute physical 2D rigid-body colliders for trackside 3D obstacles (FIA corner tire barrier stacks,
 * start/finish & sector gantry pillars, and Monaco tunnel colonade pillars) matching TrackMesh.tsx 1:1.
 */
export function getTrackObstacleColliders(track: Track): TrackObstacleCollider[] {
  const cached = _trackObstacleCache.get(track.id);
  if (cached) return cached;

  const colliders: TrackObstacleCollider[] = [];
  const outer = track.outerBoundary;
  const inner = track.innerBoundary;
  const len = Math.min(outer.length, inner.length);
  const banking = getTrackBankingProfile(track);

  const tryPushObstacle = (x: number, y: number, radius: number, kind: 'tire_stack' | 'pillar') => {
    const s = getTrackSurfaceInfo({ x, y }, track);
    // Guarantee zero trackside obstacles ever overhang the racing asphalt or kerbs (even across tight hairpin folds)
    if (s.distFromCenter < s.halfWidth + 7.2) return;
    colliders.push({ x, y, radius, kind });
  };

  // 1. FIA Corner Tire Barrier Stacks flush against outer & inner corner guardrails
  for (let i = 0; i < len; i++) {
    const nIdx = (i + 1) % len;
    const b1 = banking[i];
    const b2 = banking[nIdx];
    if (b1.curvature < 0.0032 && b2.curvature < 0.0032) continue;

    const o1 = outer[i];
    const i1 = inner[i];
    const dx = o1.x - i1.x;
    const dy = o1.y - i1.y;
    const dLen = Math.hypot(dx, dy) || 1;
    const nx = dx / dLen;
    const ny = dy / dLen;

    // Outer tire stack column (matches TrackMesh.tsx cylinder radius 1.45)
    tryPushObstacle(
      o1.x + nx * (OUTER_GUARDRAIL_OFFSET - 0.9),
      o1.y + ny * (OUTER_GUARDRAIL_OFFSET - 0.9),
      1.65,
      'tire_stack'
    );

    // Inner apex tire stack column
    if (i % 2 === 0) {
      tryPushObstacle(
        i1.x - nx * (INNER_GUARDRAIL_OFFSET - 0.9),
        i1.y - ny * (INNER_GUARDRAIL_OFFSET - 0.9),
        1.55,
        'tire_stack'
      );
    }
  }

  // 2. Start/Finish Overhead FIA Gantry Steel Pillars
  {
    const p1 = track.startLine.p1;
    const p2 = track.startLine.p2;
    const mx = (p1.x + p2.x) * 0.5;
    const my = (p1.y + p2.y) * 0.5;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const span = Math.hypot(dx, dy) || 1;
    const ux = dx / span;
    const uy = dy / span;
    const fullDist = Math.max(40, span - 14);
    const pillarOff = fullDist * 0.56;
    tryPushObstacle(mx - ux * pillarOff, my - uy * pillarOff, 2.0, 'pillar');
    tryPushObstacle(mx + ux * pillarOff, my + uy * pillarOff, 2.0, 'pillar');
  }

  // 3. Sector Timing Arch Pillars (S1, S2, S3)
  for (const cp of track.checkpoints) {
    const mx = (cp.p1.x + cp.p2.x) * 0.5;
    const my = (cp.p1.y + cp.p2.y) * 0.5;
    const dx = cp.p2.x - cp.p1.x;
    const dy = cp.p2.y - cp.p1.y;
    const span = Math.hypot(dx, dy) || 1;
    const ux = dx / span;
    const uy = dy / span;
    const cSpan = Math.max(46, span + 8);
    const pillarOff = cSpan * 0.54;
    tryPushObstacle(mx - ux * pillarOff, my - uy * pillarOff, 1.6, 'pillar');
    tryPushObstacle(mx + ux * pillarOff, my + uy * pillarOff, 1.6, 'pillar');
  }

  // 4. Monaco Louis II Tunnel Concrete Colonade Pillars
  if (track.id === 'monaco') {
    const tunnelIndices = [48, 51, 54, 57, 60, 63];
    for (const tIdx of tunnelIndices) {
      const rIdx = tIdx % len;
      const oRaw = outer[rIdx];
      const iRaw = inner[rIdx];
      const mx = (oRaw.x + iRaw.x) * 0.5;
      const my = (oRaw.y + iRaw.y) * 0.5;
      const dx = iRaw.x - oRaw.x;
      const dy = iRaw.y - oRaw.y;
      const span = Math.hypot(dx, dy) || 1;
      const ux = dx / span;
      const uy = dy / span;
      const tSpan = Math.max(54, span + 12);
      const pillarOff = tSpan * 0.54;
      tryPushObstacle(mx - ux * pillarOff, my - uy * pillarOff, 2.1, 'pillar');
      tryPushObstacle(mx + ux * pillarOff, my + uy * pillarOff, 2.1, 'pillar');
    }
  }

  _trackObstacleCache.set(track.id, colliders);
  return colliders;
}

// Compute the maximum safe cornering speed for a given path curvature & track curvature
export function getMaxSafeCornerSpeed(
  pathCurvatureRadPerPx: number,
  trackCurvatureRadPerPx: number,
  carGrip: number,
  onAsphalt: boolean = true
): number {
  if (!onAsphalt) {
    return 2.4; // Grass/off-track severely limits safe speed
  }
  // Good Out-In-Out racing line widens the corner radius and reduces effective curvature down to 50% of centerline curvature
  const effectiveCurvature = Math.max(pathCurvatureRadPerPx * 0.92, trackCurvatureRadPerPx * 0.50);
  if (effectiveCurvature < 0.0024) {
    return 7.5; // Straightaway — full F1 top speed allowed!
  }
  // Friction circle physical limit: v_max = sqrt(mu / kappa)
  const gripFactor = 0.095 * Math.pow(carGrip / 0.075, 0.55);
  const vMax = Math.sqrt(gripFactor / effectiveCurvature);
  return Math.max(2.35, Math.min(7.5, vMax));
}

// Evaluate a drawn path for overspeed corners and optimal straight segments
export interface SegmentSafetyInfo {
  index: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  speed: number;
  maxSafeSpeed: number;
  overspeedRatio: number; // > 1.12 means too fast for the corner!
  status: 'optimal_straight' | 'safe_corner' | 'slow_straight' | 'warning_drift' | 'danger_overspeed';
}

export function analyzeDrawnPathSafety(
  points: Point[],
  track: Track,
  carGrip: number = 0.075
): {
  segments: SegmentSafetyInfo[];
  dangerZones: { x: number; y: number; speedKmh: number; limitKmh: number }[];
  safetyScore: number;
} {
  const segments: SegmentSafetyInfo[] = [];
  const dangerZones: { x: number; y: number; speedKmh: number; limitKmh: number }[] = [];

  if (points.length < 2) {
    return { segments, dangerZones, safetyScore: 100 };
  }

  let dangerCount = 0;
  let lastDangerPos: TrackPoint | null = null;

  for (let i = 1; i < points.length; i++) {
    const pPrev = points[Math.max(0, i - 3)];
    const pCurr = points[i - 1];
    const pNext = points[Math.min(points.length - 1, i + 2)];

    const d1 = Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y) || 1;
    const d2 = Math.hypot(pNext.x - pCurr.x, pNext.y - pCurr.y) || 1;
    const a1 = Math.atan2(pCurr.y - pPrev.y, pCurr.x - pPrev.x);
    const a2 = Math.atan2(pNext.y - pCurr.y, pNext.x - pCurr.x);
    let dAngle = Math.abs(a2 - a1);
    if (dAngle > Math.PI) dAngle = Math.PI * 2 - dAngle;

    const pathCurvature = dAngle / ((d1 + d2) * 0.5);
    const surf = getTrackSurfaceInfo(points[i], track);
    const maxSafe = getMaxSafeCornerSpeed(pathCurvature, surf.trackCurvature, carGrip, surf.onAsphalt);

    const speed = points[i].speed;
    const overspeedRatio = speed / maxSafe;

    let status: SegmentSafetyInfo['status'] = 'safe_corner';
    if (!surf.onAsphalt && speed > 2.8) {
      status = 'danger_overspeed';
    } else if (overspeedRatio > 1.22) {
      status = 'danger_overspeed';
    } else if (overspeedRatio > 1.05) {
      status = 'warning_drift';
    } else if (maxSafe >= 5.8) {
      status = speed >= 4.3 ? 'optimal_straight' : 'slow_straight';
    } else {
      status = 'safe_corner';
    }

    if (status === 'danger_overspeed') {
      dangerCount++;
      if (!lastDangerPos || Math.hypot(points[i].x - lastDangerPos.x, points[i].y - lastDangerPos.y) > 55) {
        dangerZones.push({
          x: points[i].x,
          y: points[i].y,
          speedKmh: Math.round(speed * F1_KMH_FACTOR),
          limitKmh: Math.round(maxSafe * F1_KMH_FACTOR)
        });
        lastDangerPos = { x: points[i].x, y: points[i].y };
      }
    }

    segments.push({
      index: i,
      x1: points[i - 1].x,
      y1: points[i - 1].y,
      x2: points[i].x,
      y2: points[i].y,
      speed,
      maxSafeSpeed: maxSafe,
      overspeedRatio,
      status
    });
  }

  const safetyScore = Math.max(
    25,
    Math.round(100 - (dangerCount / Math.max(1, points.length)) * 160)
  );

  return { segments, dangerZones, safetyScore };
}

// Resample and smooth any drawn path into uniform arc-length points
export function resampleAndSmoothPath(rawPath: Point[], stepDist: number = 5): Point[] {
  if (rawPath.length < 2) return rawPath;

  const smoothedCoords: Point[] = rawPath.map((pt, idx) => {
    if (idx === 0 || idx === rawPath.length - 1) return { ...pt };
    const prev = rawPath[idx - 1];
    const next = rawPath[idx + 1];
    return {
      x: pt.x * 0.6 + (prev.x + next.x) * 0.2,
      y: pt.y * 0.6 + (prev.y + next.y) * 0.2,
      t: pt.t,
      speed: pt.speed * 0.6 + (prev.speed + next.speed) * 0.2
    };
  });

  const resampled: Point[] = [{ ...smoothedCoords[0] }];
  let accumDist = 0;

  for (let i = 1; i < smoothedCoords.length; i++) {
    let p1 = smoothedCoords[i - 1];
    const p2 = smoothedCoords[i];
    let segDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (segDist < 0.001) continue;

    while (accumDist + segDist >= stepDist) {
      const remain = stepDist - accumDist;
      const ratio = remain / segDist;
      const nx = p1.x + (p2.x - p1.x) * ratio;
      const ny = p1.y + (p2.y - p1.y) * ratio;
      const nt = p1.t + (p2.t - p1.t) * ratio;
      const nSpeed = p1.speed + (p2.speed - p1.speed) * ratio;

      const newPt: Point = { x: nx, y: ny, t: nt, speed: nSpeed };
      resampled.push(newPt);

      p1 = newPt;
      segDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      accumDist = 0;
    }
    accumDist += segDist;
  }

  const lastRaw = smoothedCoords[smoothedCoords.length - 1];
  const lastRes = resampled[resampled.length - 1];
  if (Math.hypot(lastRaw.x - lastRes.x, lastRaw.y - lastRes.y) > 1) {
    resampled.push({ ...lastRaw });
  }

  return resampled;
}

// Generate the baseline or apex-optimized racing line for CPU players
export function generateAIPath(
  track: Track,
  stepsCount: number = 320,
  archetype: AIArchetype = 'apex_master',
  gridIdx: number = 0
): Point[] {
  const outer = track.outerBoundary;
  const inner = track.innerBoundary;
  const len = Math.min(outer.length, inner.length);

  const centerline: TrackPoint[] = [];
  for (let i = 0; i < len; i++) {
    const cx = (outer[i].x + inner[i].x) / 2;
    const cy = (outer[i].y + inner[i].y) / 2;
    centerline.push({ x: cx, y: cy });
  }

  const startGridPt = track.startGrid[gridIdx] || track.startGrid[0];
  const startX = startGridPt.x;
  const startY = startGridPt.y;
  let startIdx = 0;
  let minDist = Infinity;

  for (let i = 0; i < len; i++) {
    const d = Math.hypot(centerline[i].x - startX, centerline[i].y - startY);
    if (d < minDist) {
      minDist = d;
      startIdx = i;
    }
  }

  const forwardGridVec = {
    x: Math.cos(startGridPt.angle),
    y: Math.sin(startGridPt.angle)
  };

  const nextIdx = (startIdx + 1) % len;
  const prevIdx = (startIdx - 1 + len) % len;

  const fwdTangent = {
    x: centerline[nextIdx].x - centerline[startIdx].x,
    y: centerline[nextIdx].y - centerline[startIdx].y
  };
  const bwdTangent = {
    x: centerline[prevIdx].x - centerline[startIdx].x,
    y: centerline[prevIdx].y - centerline[startIdx].y
  };

  const fwdDot = fwdTangent.x * forwardGridVec.x + fwdTangent.y * forwardGridVec.y;
  const bwdDot = bwdTangent.x * forwardGridVec.x + bwdTangent.y * forwardGridVec.y;
  const isForward = fwdDot >= bwdDot;

  const orderedNodes: { pt: TrackPoint; outerPt: TrackPoint; innerPt: TrackPoint }[] = [];
  for (let i = 0; i < len; i++) {
    const index = isForward ? (startIdx + i) % len : (startIdx - i + len * 10) % len;
    orderedNodes.push({
      pt: centerline[index],
      outerPt: outer[index],
      innerPt: inner[index]
    });
  }

  const optimizedNodes: TrackPoint[] = [];
  const nodeCount = orderedNodes.length;

  for (let i = 0; i < nodeCount; i++) {
    const prev = orderedNodes[(i - 2 + nodeCount) % nodeCount].pt;
    const curr = orderedNodes[i].pt;
    const next = orderedNodes[(i + 2) % nodeCount].pt;

    const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    const cross = v1.x * v2.y - v1.y * v2.x;

    let shift = 0;
    if (archetype === 'apex_master') {
      const curvature = Math.abs(cross) / 900;
      const turnBias = cross > 0 ? -0.32 : 0.32;
      shift = Math.max(-0.34, Math.min(0.34, turnBias * Math.min(1.0, curvature * 1.4)));
    } else if (archetype === 'aggressive') {
      const curvature = Math.abs(cross) / 800;
      const turnBias = cross > 0 ? -0.38 : 0.38;
      shift = Math.max(-0.38, Math.min(0.38, turnBias * Math.min(1.1, curvature * 1.5)));
    } else {
      shift = Math.sin(i * 0.2) * 0.1;
    }

    const innerP = orderedNodes[i].innerPt;
    const outerP = orderedNodes[i].outerPt;
    const factor = 0.5 + shift;
    optimizedNodes.push({
      x: innerP.x + (outerP.x - innerP.x) * factor,
      y: innerP.y + (outerP.y - innerP.y) * factor
    });
  }

  const smoothedControl: TrackPoint[] = optimizedNodes.map((pt, i) => {
    const prev = optimizedNodes[(i - 1 + nodeCount) % nodeCount];
    const next = optimizedNodes[(i + 1) % nodeCount];
    return {
      x: pt.x * 0.5 + (prev.x + next.x) * 0.25,
      y: pt.y * 0.5 + (prev.y + next.y) * 0.25
    };
  });

  const fullLoopNodes: TrackPoint[] = [
    { x: startX, y: startY },
    ...smoothedControl.slice(1),
    smoothedControl[0],
    smoothedControl[1],
    smoothedControl[2],
    smoothedControl[3]
  ];

  const finalPath: TrackPoint[] = [];
  for (let s = 0; s < stepsCount; s++) {
    const ratio = s / (stepsCount - 1);
    const floatIdx = ratio * (fullLoopNodes.length - 1);
    const idx = Math.floor(floatIdx);
    const nIdx = Math.min(idx + 1, fullLoopNodes.length - 1);
    const t = floatIdx - idx;
    const tSmooth = (1 - Math.cos(t * Math.PI)) / 2;

    finalPath.push({
      x: fullLoopNodes[idx].x + (fullLoopNodes[nIdx].x - fullLoopNodes[idx].x) * tSmooth,
      y: fullLoopNodes[idx].y + (fullLoopNodes[nIdx].y - fullLoopNodes[idx].y) * tSmooth
    });
  }

  // Assign physical speed profile that respects corner grip limits (braking before corners, full throttle on straights)
  const idealAIPath: Point[] = [];
  let currentTime = 0;

  const maxStraightSpeed =
    archetype === 'aggressive' ? 5.8 : archetype === 'apex_master' ? 5.6 : 5.1;
  const cautionFactor =
    archetype === 'aggressive' ? 1.06 : archetype === 'apex_master' ? 0.96 : 0.88;

  for (let i = 0; i < finalPath.length; i++) {
    const curr = finalPath[i];
    const prev = finalPath[Math.max(0, i - 3)];
    const next = finalPath[Math.min(finalPath.length - 1, i + 3)];
    const nextAhead = finalPath[Math.min(finalPath.length - 1, i + 8)];

    const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y) || 1;
    const d2 = Math.hypot(next.x - curr.x, next.y - curr.y) || 1;
    const a1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    const a2 = Math.atan2(next.y - curr.y, next.x - curr.x);
    let diff = Math.abs(a2 - a1);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    const localCurvature = diff / ((d1 + d2) * 0.5);

    // Look ahead curvature for braking zone
    const d3 = Math.hypot(nextAhead.x - curr.x, nextAhead.y - curr.y) || 1;
    const a3 = Math.atan2(nextAhead.y - curr.y, nextAhead.x - curr.x);
    let diffAhead = Math.abs(a3 - a1);
    if (diffAhead > Math.PI) diffAhead = Math.PI * 2 - diffAhead;
    const aheadCurvature = diffAhead / d3;

    const surf = getTrackSurfaceInfo(curr, track);
    const safeHere = getMaxSafeCornerSpeed(localCurvature, surf.trackCurvature, 0.075, true);
    const safeAhead = getMaxSafeCornerSpeed(aheadCurvature, surf.trackCurvature * 0.8, 0.075, true);

    let targetSpeed = Math.min(maxStraightSpeed, Math.min(safeHere, safeAhead) * cautionFactor);
    targetSpeed += Math.sin(i * 0.25) * 0.06;
    targetSpeed = Math.max(2.1, Math.min(maxStraightSpeed, targetSpeed));

    const dist = i === 0 ? 0 : Math.hypot(curr.x - finalPath[i - 1].x, curr.y - finalPath[i - 1].y);
    const dt = targetSpeed > 0 ? dist / targetSpeed : 16;
    currentTime += dt;

    idealAIPath.push({
      x: curr.x,
      y: curr.y,
      t: currentTime,
      speed: targetSpeed
    });
  }

  return idealAIPath;
}

// Compute academic TFM telemetry metrics for a completed race path
export function computeTelemetryEvaluation(
  drawnPath: Point[],
  track: Track
): {
  apexScore: number;
  smoothnessScore: number;
  avgSpeed: number;
  maxSpeed: number;
  maxLateralG: number;
} {
  if (!drawnPath || drawnPath.length < 5) {
    return {
      apexScore: 70,
      smoothnessScore: 75,
      avgSpeed: 4.0,
      maxSpeed: 5.5,
      maxLateralG: 1.2
    };
  }

  let totalSpeed = 0;
  let maxSpeed = 0;
  let maxLateralG = 0;
  let jerkAccum = 0;

  for (let i = 1; i < drawnPath.length - 1; i++) {
    const pPrev = drawnPath[i - 1];
    const pCurr = drawnPath[i];
    const pNext = drawnPath[i + 1];

    totalSpeed += pCurr.speed;
    if (pCurr.speed > maxSpeed) maxSpeed = pCurr.speed;

    const dx1 = pCurr.x - pPrev.x;
    const dy1 = pCurr.y - pPrev.y;
    const dx2 = pNext.x - pCurr.x;
    const dy2 = pNext.y - pCurr.y;

    const a1 = Math.atan2(dy1, dx1);
    const a2 = Math.atan2(dy2, dx2);
    let deltaA = Math.abs(a2 - a1);
    if (deltaA > Math.PI) deltaA = Math.PI * 2 - deltaA;

    const latG = (pCurr.speed * pCurr.speed * deltaA) / 10;
    if (latG > maxLateralG) maxLateralG = latG;

    const accel1 = pCurr.speed - pPrev.speed;
    const accel2 = pNext.speed - pCurr.speed;
    jerkAccum += Math.abs(accel2 - accel1);
  }

  const count = drawnPath.length - 2;
  const avgSpeed = count > 0 ? totalSpeed / count : 4.0;
  const avgJerk = count > 0 ? jerkAccum / count : 0.5;

  const safetyAnalysis = analyzeDrawnPathSafety(drawnPath, track, 0.075);
  const smoothnessScore = Math.max(40, Math.min(98, Math.round(100 - avgJerk * 180)));
  const speedVariability = maxSpeed - Math.min(...drawnPath.map((p) => p.speed));
  const rawApex = 60 + Math.min(25, speedVariability * 7) + (safetyAnalysis.safetyScore - 70) * 0.4;
  const apexScore = Math.max(45, Math.min(99, Math.round(rawApex)));

  return {
    apexScore,
    smoothnessScore,
    avgSpeed: Number(avgSpeed.toFixed(2)),
    maxSpeed: Number(maxSpeed.toFixed(2)),
    maxLateralG: Number(Math.min(3.5, maxLateralG).toFixed(2))
  };
}

export interface PerfectLapCallout {
  x: number;
  y: number;
  speedKmh: number;
  type: 'straight' | 'corner';
  label: string;
}

export interface PerfectLapEvalResult {
  finished: boolean;
  simSeconds: number;
  offTrackFrames: number;
  barrierHits: number;
  maxSpeed: number;
  badNodes: number[];
  latPeak: Float32Array;
}

export type PerfectLapPhysicsEvaluator = (
  track: Track,
  densePoints: TrackPoint[],
  speeds: number[],
  carGrip: number,
  gridIdx: number
) => PerfectLapEvalResult;

let registeredPerfectLapEvaluator: PerfectLapPhysicsEvaluator | null = null;
const perfectLapCache = new Map<
  string,
  { perfectPath: Point[]; callouts: PerfectLapCallout[]; optimalLapTimeSeconds?: number }
>();

export function registerPerfectLapPhysicsEvaluator(evaluator: PerfectLapPhysicsEvaluator): void {
  registeredPerfectLapEvaluator = evaluator;
  perfectLapCache.clear();
}

export const F1_KMH_FACTOR = 46;

/**
 * Iterative Minimum-Curvature + Shortest-Path (Out-In-Out) Racing Line Solver.
 * Relaxes lateral station coordinates across the full usable asphalt corridor using a
 * combined elastic-string (shortest distance) and biharmonic (minimum curvature) stencil,
 * then upsamples via Catmull-Rom spline for C1-continuous F1 cornering arcs.
 */
export function computeMinimumCurvatureRacingLine(
  track: Track,
  marginPx: number = 8.0,
  curvBlend: number = 0.36,
  gridIdx: number = 0,
  stepsCount: number = 220
): TrackPoint[] {
  const outer = track.outerBoundary;
  const inner = track.innerBoundary;
  const len = Math.min(outer.length, inner.length);

  const startGridPt = track.startGrid[gridIdx] || track.startGrid[0];
  let startIdx = 0;
  let minDist = Infinity;
  for (let i = 0; i < len; i++) {
    const cx = (outer[i].x + inner[i].x) * 0.5;
    const cy = (outer[i].y + inner[i].y) * 0.5;
    const d = Math.hypot(cx - startGridPt.x, cy - startGridPt.y);
    if (d < minDist) {
      minDist = d;
      startIdx = i;
    }
  }

  const fvx = Math.cos(startGridPt.angle);
  const fvy = Math.sin(startGridPt.angle);
  const c0x = (outer[startIdx].x + inner[startIdx].x) * 0.5;
  const c0y = (outer[startIdx].y + inner[startIdx].y) * 0.5;
  const nIdx = (startIdx + 1) % len;
  const pIdx = (startIdx - 1 + len) % len;
  const fwdDot =
    ((outer[nIdx].x + inner[nIdx].x) * 0.5 - c0x) * fvx +
    ((outer[nIdx].y + inner[nIdx].y) * 0.5 - c0y) * fvy;
  const bwdDot =
    ((outer[pIdx].x + inner[pIdx].x) * 0.5 - c0x) * fvx +
    ((outer[pIdx].y + inner[pIdx].y) * 0.5 - c0y) * fvy;
  const isForward = fwdDot >= bwdDot;

  const stations: { inner: TrackPoint; outer: TrackPoint; alpha: number }[] = [];
  for (let i = 0; i < len; i++) {
    const index = isForward ? (startIdx + i) % len : (startIdx - i + len * 10) % len;
    stations.push({ inner: inner[index], outer: outer[index], alpha: 0.5 });
  }

  const getStationPt = (i: number): TrackPoint => {
    const s = stations[(i + len * 10) % len];
    return {
      x: s.inner.x + (s.outer.x - s.inner.x) * s.alpha,
      y: s.inner.y + (s.outer.y - s.inner.y) * s.alpha
    };
  };

  // 65 passes of Gauss-Seidel minimum-curvature + shortest-path relaxation
  for (let iter = 0; iter < 65; iter++) {
    for (let i = 0; i < len; i++) {
      const pM2 = getStationPt(i - 2);
      const pM1 = getStationPt(i - 1);
      const pP1 = getStationPt(i + 1);
      const pP2 = getStationPt(i + 2);

      const midX = (pM1.x + pP1.x) * 0.5;
      const midY = (pM1.y + pP1.y) * 0.5;
      const bihX = (4 * (pM1.x + pP1.x) - (pM2.x + pP2.x)) / 6;
      const bihY = (4 * (pM1.y + pP1.y) - (pM2.y + pP2.y)) / 6;

      const tx = midX * (1 - curvBlend) + bihX * curvBlend;
      const ty = midY * (1 - curvBlend) + bihY * curvBlend;

      const s = stations[i];
      const wx = s.outer.x - s.inner.x;
      const wy = s.outer.y - s.inner.y;
      const wLenSq = Math.max(1, wx * wx + wy * wy);
      const wLen = Math.sqrt(wLenSq);
      const minA = Math.min(0.44, marginPx / wLen);
      const rawA = ((tx - s.inner.x) * wx + (ty - s.inner.y) * wy) / wLenSq;
      const clampedA = Math.max(minA, Math.min(1 - minA, rawA));
      s.alpha = s.alpha * 0.55 + clampedA * 0.45;
    }
  }

  // Smoothly merge start grid position into the optimal closed racing line
  const ctrl: TrackPoint[] = [];
  for (let i = 0; i < len; i++) {
    const p = getStationPt(i);
    if (i === 0) {
      ctrl.push({ x: startGridPt.x, y: startGridPt.y });
    } else if (i <= 3) {
      const b = i / 4;
      ctrl.push({
        x: startGridPt.x * (1 - b) + p.x * b,
        y: startGridPt.y * (1 - b) + p.y * b
      });
    } else {
      ctrl.push(p);
    }
  }
  ctrl.push(getStationPt(0), getStationPt(1), getStationPt(2), getStationPt(3));

  // Catmull-Rom C1 spline upsampling
  const dense: TrackPoint[] = [];
  for (let s = 0; s < stepsCount; s++) {
    const fIdx = (s / (stepsCount - 1)) * (ctrl.length - 1);
    const i1 = Math.min(ctrl.length - 2, Math.floor(fIdx));
    const t = fIdx - i1;
    const p0 = ctrl[Math.max(0, i1 - 1)];
    const p1 = ctrl[i1];
    const p2 = ctrl[Math.min(ctrl.length - 1, i1 + 1)];
    const p3 = ctrl[Math.min(ctrl.length - 1, i1 + 2)];
    const t2 = t * t;
    const t3 = t2 * t;
    dense.push({
      x:
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y:
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    });
  }

  return dense;
}

function applyKinematicBrakingEnvelope(
  dense: TrackPoint[],
  rawSpeeds: number[],
  brakeDecel: number
): number[] {
  const speeds = [...rawSpeeds];
  for (let i = speeds.length - 2; i >= 0; i--) {
    const ds = Math.hypot(dense[i + 1].x - dense[i].x, dense[i + 1].y - dense[i].y);
    const vBrake = Math.sqrt(speeds[i + 1] * speeds[i + 1] + 2 * brakeDecel * ds);
    if (vBrake < speeds[i]) {
      speeds[i] = vBrake;
    }
  }
  return speeds;
}

function computeAnalyticalPacejkaSpeeds(
  track: Track,
  dense: TrackPoint[],
  carGrip: number,
  eta: number,
  maxStraightSpeed: number
): number[] {
  const baseMu = 0.195 * Math.pow(carGrip / 0.075, 0.54);
  const peakLatCoeff = 1.152 * baseMu * eta;
  const speeds = new Array<number>(dense.length).fill(maxStraightSpeed);

  for (let i = 0; i < dense.length; i++) {
    const pPrev = dense[Math.max(0, i - 3)];
    const pCurr = dense[i];
    const pNext = dense[Math.min(dense.length - 1, i + 3)];

    const d1 = Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y) || 1;
    const d2 = Math.hypot(pNext.x - pCurr.x, pNext.y - pCurr.y) || 1;
    const a1 = Math.atan2(pCurr.y - pPrev.y, pCurr.x - pPrev.x);
    const a2 = Math.atan2(pNext.y - pCurr.y, pNext.x - pCurr.x);
    let diff = Math.abs(a2 - a1);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    const kappa = diff / ((d1 + d2) * 0.5);

    const surf = getTrackSurfaceInfo(pCurr, track);
    const bankAssist = Math.abs(Math.sin(surf.bankAngleRad)) * 0.068;
    const effectiveKappa = kappa - 0.0068 * peakLatCoeff;
    if (effectiveKappa > 0.0002) {
      const vCorner = Math.sqrt((0.90 * peakLatCoeff + bankAssist) / effectiveKappa);
      speeds[i] = Math.max(2.0, Math.min(maxStraightSpeed, vCorner));
    }
  }

  return speeds;
}

// Compute the "Perfect Lap" qualifying path (true minimum-curvature Out-In-Out + closed-loop Pacejka physics optimization)
export function getPerfectLapGuide(
  track: Track,
  carGrip: number = 0.08,
  gridIdx: number = 0
): {
  perfectPath: Point[];
  callouts: PerfectLapCallout[];
  optimalLapTimeSeconds?: number;
} {
  const cacheKey = `${track.id}:${carGrip.toFixed(3)}:${gridIdx}:${registeredPerfectLapEvaluator ? 1 : 0}`;
  const cached = perfectLapCache.get(cacheKey);
  if (cached) {
    return {
      perfectPath: cached.perfectPath.map((p) => ({ ...p })),
      callouts: cached.callouts.map((c) => ({ ...c })),
      optimalLapTimeSeconds: cached.optimalLapTimeSeconds
    };
  }

  const maxStraightSpeed = carGrip <= 0.055 ? 7.8 : carGrip >= 0.095 ? 7.45 : 7.8;
  const brakeDecel = (0.24 + carGrip * 0.95) * 0.84;

  let bestDense: TrackPoint[] | null = null;
  let bestSpeeds: number[] | null = null;
  let bestSimTime = Infinity;

  if (registeredPerfectLapEvaluator) {
    const evaluator = registeredPerfectLapEvaluator;
    const geometryCandidates = [
      { marginPx: 8.2, curvBlend: 0.34 },
      { marginPx: 7.2, curvBlend: 0.48 }
    ];

    for (const cfg of geometryCandidates) {
      const dense = computeMinimumCurvatureRacingLine(track, cfg.marginPx, cfg.curvBlend, gridIdx, 220);
      const rawSpeeds = computeAnalyticalPacejkaSpeeds(track, dense, carGrip, 1.02, maxStraightSpeed);

      for (let iter = 0; iter < 16; iter++) {
        const speeds = applyKinematicBrakingEnvelope(dense, rawSpeeds, brakeDecel);
        const evalRes = evaluator(track, dense, speeds, carGrip, gridIdx);

        if (evalRes.finished && evalRes.offTrackFrames === 0 && evalRes.barrierHits === 0) {
          if (evalRes.simSeconds < bestSimTime) {
            bestSimTime = evalRes.simSeconds;
            bestDense = dense;
            bestSpeeds = speeds;
          }

          // Selectively push ONLY corners that still have lateral grip headroom (< 90% of asphalt half-width)
          let boosted = false;
          for (let i = 0; i < rawSpeeds.length; i++) {
            if (rawSpeeds[i] < maxStraightSpeed - 0.02) {
              let localPeakLat = 0;
              const winStart = Math.max(0, i - 4);
              const winEnd = Math.min(dense.length - 1, i + 10);
              for (let k = winStart; k <= winEnd; k++) {
                if (evalRes.latPeak[k] > localPeakLat) {
                  localPeakLat = evalRes.latPeak[k];
                }
              }
              if (localPeakLat < 0.90) {
                rawSpeeds[i] = Math.min(maxStraightSpeed, rawSpeeds[i] * 1.055);
                boosted = true;
              }
            }
          }
          if (!boosted) break;
          continue;
        }

        // Trim ONLY the braking/entry window leading into any off-track or barrier contact
        const trimmed = new Set<number>();
        for (let b = 0; b < evalRes.badNodes.length; b++) {
          const bn = evalRes.badNodes[b];
          const winStart = Math.max(0, bn - 17);
          const winEnd = Math.min(dense.length - 1, bn + 3);
          for (let k = winStart; k <= winEnd; k++) {
            if (!trimmed.has(k)) {
              trimmed.add(k);
              rawSpeeds[k] = Math.max(1.85, rawSpeeds[k] * 0.91);
            }
          }
        }
        if (trimmed.size === 0) break;
      }
    }

    // Final micro-polish: verify whether a tiny uniform +2.5% global speed push beats bestSimTime cleanly
    if (bestDense && bestSpeeds) {
      for (const nudge of [1.025, 1.05]) {
        const nudgedSpeeds = applyKinematicBrakingEnvelope(
          bestDense,
          bestSpeeds.map((v) => Math.min(maxStraightSpeed, v * nudge)),
          brakeDecel
        );
        const res = evaluator(track, bestDense, nudgedSpeeds, carGrip, gridIdx);
        if (res.finished && res.offTrackFrames === 0 && res.barrierHits === 0 && res.simSeconds < bestSimTime) {
          bestSimTime = res.simSeconds;
          bestSpeeds = nudgedSpeeds;
        } else {
          break;
        }
      }
    }
  }

  // Analytical fallback (used when tracks.ts runs standalone without vehiclePhysics registered, or extreme edge cases)
  if (!bestDense || !bestSpeeds) {
    bestDense = computeMinimumCurvatureRacingLine(track, 9.0, 0.42, gridIdx, 220);
    const analyticalEta = carGrip < 0.06 ? 0.72 : 0.80;
    const rawSpeeds = computeAnalyticalPacejkaSpeeds(track, bestDense, carGrip, analyticalEta, maxStraightSpeed);
    bestSpeeds = applyKinematicBrakingEnvelope(bestDense, rawSpeeds, brakeDecel * 0.85);
  }

  const perfectPath: Point[] = [];
  let accumT = 0;

  for (let i = 0; i < bestDense.length; i++) {
    const curr = bestDense[i];
    const idealSpeed = bestSpeeds[i];
    const stepDist =
      i === 0 ? 0 : Math.hypot(curr.x - bestDense[i - 1].x, curr.y - bestDense[i - 1].y);
    // Match exact human drawing speed formula: rawSpeed = (dist / dt) * 15.5 => dt = (dist * 15.5) / idealSpeed
    accumT += (stepDist * 15.5) / Math.max(1.8, idealSpeed);

    perfectPath.push({
      x: curr.x,
      y: curr.y,
      t: accumT,
      speed: idealSpeed
    });
  }

  // Extract 6 well-spaced speed callout anchors around the lap (fastest straights & slowest corner apexes)
  const callouts: PerfectLapCallout[] = [];
  const total = perfectPath.length;
  const numBuckets = 6;
  const bucketSize = Math.floor((total - 16) / numBuckets);

  for (let b = 0; b < numBuckets; b++) {
    const start = 8 + b * bucketSize;
    const end = Math.min(total - 8, start + bucketSize);

    let minPt = perfectPath[start];
    let maxPt = perfectPath[start];
    for (let i = start; i < end; i++) {
      if (perfectPath[i].speed < minPt.speed) minPt = perfectPath[i];
      if (perfectPath[i].speed > maxPt.speed) maxPt = perfectPath[i];
    }

    if (minPt.speed < 5.6) {
      const kmh = Math.round(minPt.speed * F1_KMH_FACTOR);
      callouts.push({
        x: minPt.x,
        y: minPt.y,
        speedKmh: kmh,
        type: 'corner',
        label: `CURVA ${kmh} km/h`
      });
    } else {
      const kmh = Math.round(maxPt.speed * F1_KMH_FACTOR);
      callouts.push({
        x: maxPt.x,
        y: maxPt.y,
        speedKmh: kmh,
        type: 'straight',
        label: `RECTA ${kmh} km/h`
      });
    }
  }

  const result = {
    perfectPath,
    callouts,
    optimalLapTimeSeconds: Number.isFinite(bestSimTime) ? bestSimTime : undefined
  };
  perfectLapCache.set(cacheKey, result);

  return {
    perfectPath: result.perfectPath.map((p) => ({ ...p })),
    callouts: result.callouts.map((c) => ({ ...c })),
    optimalLapTimeSeconds: result.optimalLapTimeSeconds
  };
}


