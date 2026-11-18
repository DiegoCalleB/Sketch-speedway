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
): { dist: number; closest: TrackPoint } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { dist: Math.hypot(p.x - a.x, p.y - a.y), closest: { x: a.x, y: a.y } };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closest = { x: a.x + t * dx, y: a.y + t * dy };
  return { dist: Math.hypot(p.x - closest.x, p.y - closest.y), closest };
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

// Track 3: Grand Prix Technical Circuit (Hard) — fits cleanly within [65..735] x [55..445]
function generateTrack3Points(): { outer: TrackPoint[]; inner: TrackPoint[] } {
  const centerlineKeypoints: TrackPoint[] = [
    { x: 155, y: 155 },
    { x: 380, y: 135 },
    { x: 485, y: 195 },
    { x: 655, y: 145 },
    { x: 675, y: 345 },
    { x: 535, y: 315 },
    { x: 440, y: 385 },
    { x: 330, y: 290 },
    { x: 225, y: 375 },
    { x: 125, y: 335 }
  ];

  const smoothCenterline: TrackPoint[] = [];
  const len = centerlineKeypoints.length;
  const subSteps = 10;

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

      smoothCenterline.push({ x, y });
    }
  }

  const outer: TrackPoint[] = [];
  const inner: TrackPoint[] = [];
  const total = smoothCenterline.length;
  const halfWidth = 44;

  for (let i = 0; i < total; i++) {
    const prev = smoothCenterline[(i - 1 + total) % total];
    const curr = smoothCenterline[i];
    const next = smoothCenterline[(i + 1) % total];

    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tLen = Math.hypot(tx, ty) || 1;
    const nx = ty / tLen;
    const ny = -tx / tLen;

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

const track3Points = generateTrack3Points();

export const TRACKS: Track[] = [
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
      'Horquillas de gran frenada, rectas de alta velocidad y chicanes técnicas donde entrar pasado penaliza gravemente.',
    width: 800,
    height: 500,
    outerBoundary: track3Points.outer,
    innerBoundary: track3Points.inner,
    startGrid: [
      { x: 255, y: 138, angle: 0 },
      { x: 225, y: 156, angle: 0 },
      { x: 195, y: 144, angle: 0 },
      { x: 168, y: 164, angle: 0 }
    ],
    startLine: createGateAt(track3Points.outer, track3Points.inner, 7, 14),
    checkpoints: [
      createGateAt(track3Points.outer, track3Points.inner, 32, 14),
      createGateAt(track3Points.outer, track3Points.inner, 55, 14),
      createGateAt(track3Points.outer, track3Points.inner, 80, 14)
    ],
    trees: [
      { x: 55, y: 55, size: 20, type: 'pine' },
      { x: 745, y: 60, size: 20, type: 'pine' },
      { x: 745, y: 440, size: 18, type: 'leaf' },
      { x: 55, y: 440, size: 18, type: 'pine' },
      { x: 260, y: 235, size: 16, type: 'leaf' },
      { x: 565, y: 235, size: 16, type: 'pine' }
    ],
    grandstands: [
      { x: 450, y: 32, width: 190, height: 15, angle: 0, title: 'TRIBUNA PRINCIPAL MONZA' },
      { x: 380, y: 476, width: 120, height: 14, angle: 0, title: 'ZONA DE SOCIOS' }
    ],
    decorations: [
      { x: 270, y: 78, type: 'flag', color: '#ef4444' },
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

// Analyze where a point is relative to the track centerline, boundaries, and local track curvature
export function getTrackSurfaceInfo(
  pt: TrackPoint,
  track: Track
): {
  onAsphalt: boolean;
  onCurbOrGrass: boolean;
  hitBarrier: boolean;
  closestCenterPt: TrackPoint;
  inwardNormal: TrackPoint;
  outwardEdgeVec: TrackPoint;
  distFromCenter: number;
  halfWidth: number;
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

  for (let i = 0; i < len; i++) {
    const nIdx = (i + 1) % len;
    const c1 = { x: (outer[i].x + inner[i].x) * 0.5, y: (outer[i].y + inner[i].y) * 0.5 };
    const c2 = { x: (outer[nIdx].x + inner[nIdx].x) * 0.5, y: (outer[nIdx].y + inner[nIdx].y) * 0.5 };
    const res = distToSegment(pt, c1, c2);
    if (res.dist < minDist) {
      minDist = res.dist;
      bestIdx = i;
      bestClosest = res.closest;
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

  const outerPt = outer[bestIdx];
  const innerPt = inner[bestIdx];
  const halfWidth = Math.hypot(outerPt.x - innerPt.x, outerPt.y - innerPt.y) * 0.5;

  const dx = bestClosest.x - pt.x;
  const dy = bestClosest.y - pt.y;
  const dLen = Math.hypot(dx, dy) || 1;
  const inwardNormal = { x: dx / dLen, y: dy / dLen };

  // Vector pointing from inner apex toward outer curb of the track at bestIdx
  const oDx = outerPt.x - innerPt.x;
  const oDy = outerPt.y - innerPt.y;
  const oLen = Math.hypot(oDx, oDy) || 1;
  const outwardEdgeVec = { x: oDx / oLen, y: oDy / oLen };

  const inPoly = isPointInPolygon(pt, outer) && !isPointInPolygon(pt, inner);
  const onAsphalt = inPoly || minDist <= halfWidth + 2;
  const onCurbOrGrass = !onAsphalt && minDist <= halfWidth + 14;
  const hitBarrier = false; // No artificial invisible wall bounce — realistic gravel/grass runoff slows the car down!

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
    halfWidth,
    trackCurvature,
    trackTurnSign,
    elevationZ,
    bankAngleRad
  };
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
  // Good racing line (wide entry, clipping apex) can reduce effective curvature down to 62% of raw centerline curvature
  const effectiveCurvature = Math.max(pathCurvatureRadPerPx, trackCurvatureRadPerPx * 0.62);
  if (effectiveCurvature < 0.0022) {
    return 7.5; // Straightaway — full speed allowed!
  }
  // Friction circle physical limit: v_max = sqrt(mu / kappa)
  const gripFactor = 0.088 * Math.pow(carGrip / 0.075, 0.55);
  const vMax = Math.sqrt(gripFactor / effectiveCurvature);
  return Math.max(2.1, Math.min(7.5, vMax));
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

export const F1_KMH_FACTOR = 46;

// Compute the "Perfect Lap" ideal path and key corner/straight speed callout badges for any track
export function getPerfectLapGuide(
  track: Track,
  carGrip: number = 0.08,
  gridIdx: number = 0
): {
  perfectPath: Point[];
  callouts: PerfectLapCallout[];
} {
  const basePath = generateAIPath(track, 220, 'apex_master', gridIdx);
  const perfectPath: Point[] = [];
  let accumT = 0;

  for (let i = 0; i < basePath.length; i++) {
    const curr = basePath[i];
    const prev = basePath[Math.max(0, i - 3)];
    const next = basePath[Math.min(basePath.length - 1, i + 3)];
    const ahead = basePath[Math.min(basePath.length - 1, i + 7)];

    const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y) || 1;
    const d2 = Math.hypot(next.x - curr.x, next.y - curr.y) || 1;
    const a1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    const a2 = Math.atan2(next.y - curr.y, next.x - curr.x);
    let diff = Math.abs(a2 - a1);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    const localCurv = diff / ((d1 + d2) * 0.5);

    const d3 = Math.hypot(ahead.x - curr.x, ahead.y - curr.y) || 1;
    const a3 = Math.atan2(ahead.y - curr.y, ahead.x - curr.x);
    let diffAhead = Math.abs(a3 - a1);
    if (diffAhead > Math.PI) diffAhead = Math.PI * 2 - diffAhead;
    const aheadCurv = diffAhead / d3;

    const surf = getTrackSurfaceInfo(curr, track);
    const safeHere = getMaxSafeCornerSpeed(localCurv, surf.trackCurvature, carGrip, true);
    const safeAhead = getMaxSafeCornerSpeed(aheadCurv, surf.trackCurvature * 0.85, carGrip, true);

    const idealSpeed = Math.max(2.4, Math.min(7.35, Math.min(safeHere, safeAhead) * 0.98));
    const stepDist = i === 0 ? 0 : Math.hypot(curr.x - basePath[i - 1].x, curr.y - basePath[i - 1].y);
    accumT += (stepDist / idealSpeed) * 14;

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

    // Decide whether this sector is best represented by a braking corner apex or a high-speed F1 straight
    if (minPt.speed < 4.5) {
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

  return { perfectPath, callouts };
}

