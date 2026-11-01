import { Track, TrackPoint, Point } from '../types';

// Ray-casting algorithm for point-in-polygon check
export function isPointInPolygon(p: TrackPoint, polygon: TrackPoint[]): boolean {
  let isInside = false;
  const len = polygon.length;
  for (let i = 0, j = len - 1; i < len; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    
    const intersect = ((yi > p.y) !== (yj > p.y))
        && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }
  return isInside;
}

// Distance between two points
export function getDistance(p1: TrackPoint, p2: TrackPoint): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

// Check if a line segment intersects another line segment
export function lineIntersects(
  a1: TrackPoint, a2: TrackPoint,
  b1: TrackPoint, b2: TrackPoint
): boolean {
  const det = (a2.x - a1.x) * (b2.y - b1.y) - (b2.x - b1.x) * (a2.y - a1.y);
  if (det === 0) return false; // Parallel

  const lambda = ((b2.y - b1.y) * (b2.x - a1.x) + (b1.x - b2.x) * (b2.y - a1.y)) / det;
  const gamma = ((a1.y - a2.y) * (b2.x - a1.x) + (a2.x - a1.x) * (b2.y - a1.y)) / det;

  return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
}

// Generate smooth ellipse points
function generateEllipse(cx: number, cy: number, rx: number, ry: number, count: number): TrackPoint[] {
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

// Track 1: Oval (Easy)
const outer1 = generateEllipse(400, 250, 350, 200, 60);
const inner1 = generateEllipse(400, 250, 220, 100, 60);

// Track 2: S-Curve / Technical (Medium)
// We will generate this using customized mathematical control loops
function generateTrack2Points(): { outer: TrackPoint[]; inner: TrackPoint[] } {
  const outer: TrackPoint[] = [];
  const inner: TrackPoint[] = [];
  const count = 80;
  
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    // Base radius with variations to create curves
    let rOuter = 260;
    let rInner = 140;

    // Add a couple of beautiful custom bends
    if (angle > 0 && angle < Math.PI) {
      // Curve inwards on the upper half
      const s = Math.sin(angle * 2);
      rOuter += s * 60;
      rInner += s * 60;
    } else {
      // Wave on lower half
      const s = Math.sin(angle * 3);
      rOuter += s * 30;
      rInner += s * 30;
    }

    // Centered at 400, 250 with slight stretch
    const cx = 400;
    const cy = 250;
    
    // Stretch x more than y
    const scaleX = 1.35;
    const scaleY = 0.95;

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

// Track 3: Red Bull Ring style/Complex (Hard)
// We'll create custom track vertexes for a truly exciting race track with straights and tight hairpins
function generateTrack3Points(): { outer: TrackPoint[]; inner: TrackPoint[] } {
  // Classic Grand Prix style track vertices (outer)
  // Let's create a beautiful technical circuit with 12 key keypoints, then interpolate them to make them smooth.
  const outerKeypoints: TrackPoint[] = [
    { x: 100, y: 120 },
    { x: 380, y: 100 },
    { x: 500, y: 180 },
    { x: 720, y: 120 },
    { x: 740, y: 380 },
    { x: 550, y: 350 },
    { x: 450, y: 440 },
    { x: 320, y: 320 },
    { x: 220, y: 430 },
    { x: 80,  y: 380 },
  ];

  const innerKeypoints: TrackPoint[] = [
    { x: 200, y: 220 },
    { x: 370, y: 200 },
    { x: 440, y: 250 },
    { x: 620, y: 210 },
    { x: 640, y: 290 },
    { x: 530, y: 270 },
    { x: 440, y: 320 },
    { x: 340, y: 240 },
    { x: 240, y: 310 },
    { x: 180, y: 290 },
  ];

  // Helper to interpolate points
  const interpolatePoints = (keypoints: TrackPoint[], countPerSegment: number): TrackPoint[] => {
    const result: TrackPoint[] = [];
    const len = keypoints.length;
    for (let i = 0; i < len; i++) {
      const p1 = keypoints[i];
      const p2 = keypoints[(i + 1) % len];
      for (let j = 0; j < countPerSegment; j++) {
        const t = j / countPerSegment;
        // Simple cubic bezier interpolation or linear with light cosine smoothing
        const tSmooth = (1 - Math.cos(t * Math.PI)) / 2;
        result.push({
          x: p1.x + (p2.x - p1.x) * tSmooth,
          y: p1.y + (p2.y - p1.y) * tSmooth,
        });
      }
    }
    return result;
  };

  return {
    outer: interpolatePoints(outerKeypoints, 8),
    inner: interpolatePoints(innerKeypoints, 8)
  };
}

const track3Points = generateTrack3Points();

export const TRACKS: Track[] = [
  {
    id: 'oval',
    name: 'Circuito Óvalo de Iniciación',
    difficulty: 'Fácil',
    description: 'Un circuito de entrenamiento simple ideal para entender la física de derrape, aceleración y curvas fluidas.',
    width: 800,
    height: 500,
    outerBoundary: outer1,
    innerBoundary: inner1,
    startGrid: [
      { x: 400, y: 400, angle: 0 },
      { x: 370, y: 420, angle: 0 },
      { x: 340, y: 400, angle: 0 },
      { x: 310, y: 420, angle: 0 }
    ],
    startLine: {
      p1: { x: 400, y: 350 },
      p2: { x: 400, y: 450 }
    },
    checkpoints: [
      { p1: { x: 750, y: 250 }, p2: { x: 620, y: 250 } }, // East
      { p1: { x: 400, y: 50 },  p2: { x: 400, y: 150 } }, // North
      { p1: { x: 50,  y: 250 }, p2: { x: 180, y: 250 } }  // West
    ],
    trees: [
      // Infield trees
      { x: 250, y: 210, size: 22, type: 'leaf' },
      { x: 280, y: 260, size: 16, type: 'pine' },
      { x: 550, y: 210, size: 22, type: 'leaf' },
      { x: 520, y: 260, size: 16, type: 'pine' },
      { x: 320, y: 230, size: 14, type: 'leaf' },
      { x: 480, y: 230, size: 15, type: 'pine' },
      // Outfield trees
      { x: 80, y: 60, size: 24, type: 'pine' },
      { x: 110, y: 80, size: 20, type: 'leaf' },
      { x: 720, y: 60, size: 24, type: 'pine' },
      { x: 690, y: 80, size: 20, type: 'leaf' },
      { x: 80, y: 440, size: 22, type: 'leaf' },
      { x: 720, y: 440, size: 22, type: 'leaf' },
      { x: 50, y: 250, size: 18, type: 'pine' },
      { x: 750, y: 250, size: 18, type: 'pine' }
    ],
    grandstands: [
      { x: 400, y: 25, width: 260, height: 18, angle: 0, title: 'TRIBUNA DE HONOR OVAL' },
      { x: 220, y: 475, width: 130, height: 16, angle: 0, title: 'PADDOCK GENERAL' }
    ],
    decorations: [
      // Parked service vehicles and flags
      { x: 400, y: 250, type: 'box', color: '#ffffff' }, // Heli-pad marker center
      { x: 400, y: 210, type: 'flag', color: '#3b82f6' },
      { x: 360, y: 475, type: 'car', color: '#ef4444', angle: 0 },
      { x: 380, y: 475, type: 'car', color: '#eab308', angle: -0.1 },
      { x: 130, y: 470, type: 'tent', color: '#8b5cf6' },
      { x: 670, y: 470, type: 'tent', color: '#10b981' }
    ]
  },
  {
    id: 'forest',
    name: 'Circuito S-Bucle Forestal',
    difficulty: 'Medio',
    description: 'Bends cerrados y curvas invertidas de tipo S que exigen frenar a tiempo y acelerar fuerte en las rectas.',
    width: 800,
    height: 500,
    outerBoundary: track2Points.outer,
    innerBoundary: track2Points.inner,
    startGrid: [
      { x: 400, y: 420, angle: 0 },
      { x: 370, y: 440, angle: 0 },
      { x: 340, y: 420, angle: 0 },
      { x: 310, y: 440, angle: 0 }
    ],
    startLine: {
      p1: { x: 400, y: 360 },
      p2: { x: 400, y: 480 }
    },
    checkpoints: [
      { p1: { x: 740, y: 250 }, p2: { x: 610, y: 250 } },
      { p1: { x: 400, y: 50 },  p2: { x: 400, y: 160 } },
      { p1: { x: 70,  y: 250 }, p2: { x: 190, y: 250 } }
    ],
    trees: [
      // Very dense forest feeling
      // Infield clusters
      { x: 400, y: 250, size: 26, type: 'leaf' },
      { x: 430, y: 270, size: 20, type: 'pine' },
      { x: 370, y: 240, size: 18, type: 'pine' },
      { x: 410, y: 290, size: 15, type: 'leaf' },
      { x: 260, y: 180, size: 24, type: 'pine' },
      { x: 280, y: 150, size: 18, type: 'leaf' },
      { x: 540, y: 320, size: 22, type: 'pine' },
      { x: 520, y: 350, size: 16, type: 'leaf' },
      // Outer boundaries dense forest
      { x: 100, y: 60, size: 25, type: 'pine' },
      { x: 130, y: 70, size: 21, type: 'pine' },
      { x: 160, y: 50, size: 24, type: 'leaf' },
      { x: 320, y: 50, size: 22, type: 'pine' },
      { x: 480, y: 45, size: 23, type: 'leaf' },
      { x: 640, y: 60, size: 25, type: 'pine' },
      { x: 670, y: 80, size: 19, type: 'leaf' },
      { x: 700, y: 110, size: 22, type: 'pine' },
      { x: 750, y: 160, size: 24, type: 'pine' },
      { x: 760, y: 350, size: 22, type: 'leaf' },
      { x: 720, y: 430, size: 25, type: 'pine' },
      { x: 680, y: 460, size: 20, type: 'pine' },
      { x: 120, y: 450, size: 26, type: 'pine' },
      { x: 90, y: 420, size: 21, type: 'leaf' },
      { x: 60, y: 340, size: 23, type: 'pine' },
      { x: 50, y: 150, size: 25, type: 'leaf' }
    ],
    grandstands: [
      { x: 400, y: 22, width: 140, height: 15, angle: 0, title: 'TRIBUNA FOREST' }
    ],
    decorations: [
      // Fan tents and flags in the forest clearing
      { x: 330, y: 220, type: 'tent', color: '#eab308' },
      { x: 350, y: 200, type: 'tent', color: '#f97316' },
      { x: 470, y: 220, type: 'tent', color: '#06b6d4' },
      { x: 220, y: 470, type: 'flag', color: '#ffffff' },
      { x: 580, y: 470, type: 'flag', color: '#ffffff' },
      { x: 500, y: 465, type: 'car', color: '#10b981', angle: -0.2 }
    ]
  },
  {
    id: 'grandprix',
    name: 'Templo de la Velocidad',
    difficulty: 'Difícil',
    description: 'Horquillas de gran frenada, curvas enlazadas con poco margen de error y pianos traicioneros.',
    width: 800,
    height: 500,
    outerBoundary: track3Points.outer,
    innerBoundary: track3Points.inner,
    startGrid: [
      { x: 220, y: 110, angle: 0 },
      { x: 190, y: 110, angle: 0 },
      { x: 160, y: 110, angle: 0 },
      { x: 130, y: 110, angle: 0 }
    ],
    startLine: {
      p1: { x: 240, y: 100 },
      p2: { x: 240, y: 220 }
    },
    checkpoints: [
      { p1: { x: 610, y: 150 }, p2: { x: 530, y: 220 } },
      { p1: { x: 640, y: 340 }, p2: { x: 530, y: 310 } },
      { p1: { x: 280, y: 370 }, p2: { x: 290, y: 270 } },
      { p1: { x: 90,  y: 250 }, p2: { x: 180, y: 250 } }
    ],
    trees: [
      // Elegant pine rows representing European circuits like Monza
      { x: 40, y: 40, size: 22, type: 'pine' },
      { x: 70, y: 40, size: 22, type: 'pine' },
      { x: 100, y: 40, size: 22, type: 'pine' },
      { x: 740, y: 60, size: 24, type: 'pine' },
      { x: 770, y: 80, size: 22, type: 'pine' },
      { x: 750, y: 440, size: 20, type: 'leaf' },
      { x: 500, y: 480, size: 18, type: 'pine' },
      { x: 420, y: 480, size: 18, type: 'pine' },
      // Infield trees
      { x: 140, y: 180, size: 18, type: 'leaf' },
      { x: 300, y: 170, size: 16, type: 'pine' },
      { x: 580, y: 240, size: 20, type: 'pine' },
      { x: 200, y: 330, size: 15, type: 'leaf' }
    ],
    grandstands: [
      { x: 450, y: 40, width: 200, height: 18, angle: 0, title: 'TRIBUNA PRINCIPAL MONZA' },
      { x: 680, y: 260, width: 90, height: 15, angle: 1.5, title: 'TRIBUNA CURVA ESTE' },
      { x: 380, y: 475, width: 120, height: 16, angle: 0, title: 'ZONA DE SOCIOS' }
    ],
    decorations: [
      // Cones, sponsors and paddock items
      { x: 450, y: 240, type: 'box', color: '#ff4d4d' }, // Red-white barriers
      { x: 470, y: 250, type: 'box', color: '#ff4d4d' },
      { x: 250, y: 70, type: 'flag', color: '#ef4444' }, // Start line flags
      { x: 250, y: 240, type: 'flag', color: '#ffffff' },
      { x: 350, y: 160, type: 'car', color: '#f43f5e', angle: 3.14 }, // Parked supercar
      { x: 380, y: 160, type: 'car', color: '#10b981', angle: 3.14 },
      { x: 100, y: 460, type: 'tent', color: '#f43f5e' }
    ]
  }
];

// Helper to check if a car has crossed a line segment
// Used for checkpoint crossing & start/finish line checks
export function checkSegmentCrossing(
  oldPos: TrackPoint,
  newPos: TrackPoint,
  line: { p1: TrackPoint; p2: TrackPoint }
): boolean {
  return lineIntersects(oldPos, newPos, line.p1, line.p2);
}

// Helper to calculate the mathematical centerline of any track
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

// Generate the baseline or apex-optimized racing line for CPU players
// Supports AI archetypes ('apex_master' | 'aggressive' | 'defensive') and grid placement
export function generateAIPath(
  track: Track,
  stepsCount: number = 320,
  archetype: import('../types').AIArchetype = 'apex_master',
  gridIdx: number = 0
): Point[] {
  const outer = track.outerBoundary;
  const inner = track.innerBoundary;
  const len = Math.min(outer.length, inner.length);
  
  // 1. Calculate centerline points and track width normals
  const centerline: TrackPoint[] = [];
  const trackVectors: { nx: number; ny: number; width: number }[] = [];

  for (let i = 0; i < len; i++) {
    const cx = (outer[i].x + inner[i].x) / 2;
    const cy = (outer[i].y + inner[i].y) / 2;
    centerline.push({ x: cx, y: cy });

    const dx = outer[i].x - inner[i].x;
    const dy = outer[i].y - inner[i].y;
    const width = Math.hypot(dx, dy);
    trackVectors.push({
      nx: width > 0 ? dx / width : 0,
      ny: width > 0 ? dy / width : 0,
      width
    });
  }

  // 2. Find closest point on centerline to start grid
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

  // 3. Determine forward direction along the track relative to startGrid angle
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

  // 4. Reorder track nodes and compute geometric racing line (late apex shift)
  const orderedNodes: { pt: TrackPoint; outerPt: TrackPoint; innerPt: TrackPoint }[] = [];
  for (let i = 0; i < len; i++) {
    const index = isForward ? (startIdx + i) % len : (startIdx - i + len * 10) % len;
    orderedNodes.push({
      pt: centerline[index],
      outerPt: outer[index],
      innerPt: inner[index]
    });
  }

  // Curvature-based spline relaxation for optimal racing line:
  // "Out-In-Out" trajectory calculation
  const optimizedNodes: TrackPoint[] = [];
  const nodeCount = orderedNodes.length;

  for (let i = 0; i < nodeCount; i++) {
    const prev = orderedNodes[(i - 1 + nodeCount) % nodeCount].pt;
    const curr = orderedNodes[i].pt;
    const next = orderedNodes[(i + 1) % nodeCount].pt;

    // Estimate curvature using discrete turn angle
    const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    const cross = v1.x * v2.y - v1.y * v2.x; // positive = turns right/inner, negative = turns left/outer

    let shift = 0; // -0.5 is inner boundary, +0.5 is outer boundary
    if (archetype === 'apex_master') {
      // Classic late-apex racing line: clips inside apex, uses outside on entry and exit
      const curvature = Math.abs(cross) / 500;
      const turnBias = cross > 0 ? -0.38 : 0.38;
      shift = Math.max(-0.42, Math.min(0.42, turnBias * Math.min(1.0, curvature * 1.5)));
    } else if (archetype === 'aggressive') {
      // Aggressive cuts early and deeper, carrying maximum velocity
      const curvature = Math.abs(cross) / 450;
      const turnBias = cross > 0 ? -0.45 : 0.45;
      shift = Math.max(-0.46, Math.min(0.46, turnBias * Math.min(1.1, curvature * 1.6)));
    } else {
      // Defensive stays conservative within 15% of track center
      shift = Math.sin(i * 0.2) * 0.12;
    }

    const innerP = orderedNodes[i].innerPt;
    const outerP = orderedNodes[i].outerPt;
    // 0.5 is centerline; 0.0 is inner; 1.0 is outer
    const factor = 0.5 + shift;
    optimizedNodes.push({
      x: innerP.x + (outerP.x - innerP.x) * factor,
      y: innerP.y + (outerP.y - innerP.y) * factor
    });
  }

  // Anchor to exact start grid and loop through finish line
  optimizedNodes.unshift({ x: startX, y: startY });
  const finishHeading = isForward ? (startIdx + 3) % len : (startIdx - 3 + len * 10) % len;
  optimizedNodes.push({ x: startX, y: startY });
  optimizedNodes.push(centerline[finishHeading]);

  // 5. Interpolate points for super smooth spline tracking
  const finalPath: TrackPoint[] = [];
  for (let s = 0; s < stepsCount; s++) {
    const ratio = s / (stepsCount - 1);
    const floatIdx = ratio * (optimizedNodes.length - 1);
    const idx = Math.floor(floatIdx);
    const nIdx = Math.min(idx + 1, optimizedNodes.length - 1);
    const t = floatIdx - idx;
    // Cosine smoothing
    const tSmooth = (1 - Math.cos(t * Math.PI)) / 2;

    finalPath.push({
      x: optimizedNodes[idx].x + (optimizedNodes[nIdx].x - optimizedNodes[idx].x) * tSmooth,
      y: optimizedNodes[idx].y + (optimizedNodes[nIdx].y - optimizedNodes[idx].y) * tSmooth,
    });
  }

  // 6. Assign speed profile tailored by archetype
  const idealAIPath: Point[] = [];
  let currentTime = 0;

  // Base parameters per archetype
  const maxStraightSpeed = archetype === 'aggressive' ? 6.2 : archetype === 'apex_master' ? 5.9 : 5.4;
  const minCornerSpeed = archetype === 'aggressive' ? 2.5 : archetype === 'apex_master' ? 2.3 : 2.0;

  for (let i = 0; i < finalPath.length; i++) {
    const curr = finalPath[i];
    const prev = finalPath[Math.max(0, i - 1)];
    const next = finalPath[Math.min(finalPath.length - 1, i + 1)];
    const nextAhead = finalPath[Math.min(finalPath.length - 1, i + 7)];

    // Curvature calculation
    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;

    const angle1 = Math.atan2(d1y, d1x);
    const angle2 = Math.atan2(d2y, d2x);
    let diff = Math.abs(angle2 - angle1);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;

    // Look ahead to brake in advance before entering corners
    const d3x = nextAhead.x - curr.x;
    const d3y = nextAhead.y - curr.y;
    const angle3 = Math.atan2(d3y, d3x);
    let diffAhead = Math.abs(angle3 - angle1);
    if (diffAhead > Math.PI) diffAhead = Math.PI * 2 - diffAhead;

    const maxCurvature = Math.max(diff * 3.5, diffAhead);

    let targetSpeed = maxStraightSpeed;
    if (maxCurvature > 0.14) {
      targetSpeed = Math.max(minCornerSpeed, maxStraightSpeed - maxCurvature * 6.2);
    }

    // Add subtle human-like variance
    targetSpeed += Math.sin(i * 0.35) * 0.12;
    targetSpeed = Math.max(1.8, Math.min(6.3, targetSpeed));

    const dist = i === 0 ? 0 : Math.hypot(curr.x - prev.x, curr.y - prev.y);
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
  let lateralGAccum = 0;
  let maxLateralG = 0;
  let jerkAccum = 0;

  for (let i = 1; i < drawnPath.length - 1; i++) {
    const pPrev = drawnPath[i - 1];
    const pCurr = drawnPath[i];
    const pNext = drawnPath[i + 1];

    totalSpeed += pCurr.speed;
    if (pCurr.speed > maxSpeed) maxSpeed = pCurr.speed;

    // Angular acceleration / Lateral G
    const dx1 = pCurr.x - pPrev.x;
    const dy1 = pCurr.y - pPrev.y;
    const dx2 = pNext.x - pCurr.x;
    const dy2 = pNext.y - pCurr.y;

    const a1 = Math.atan2(dy1, dx1);
    const a2 = Math.atan2(dy2, dx2);
    let deltaA = Math.abs(a2 - a1);
    if (deltaA > Math.PI) deltaA = Math.PI * 2 - deltaA;

    const latG = (pCurr.speed * pCurr.speed * deltaA) / 10;
    lateralGAccum += latG;
    if (latG > maxLateralG) maxLateralG = latG;

    // Jerk (derivative of acceleration)
    const accel1 = pCurr.speed - pPrev.speed;
    const accel2 = pNext.speed - pCurr.speed;
    jerkAccum += Math.abs(accel2 - accel1);
  }

  const count = drawnPath.length - 2;
  const avgSpeed = count > 0 ? totalSpeed / count : 4.0;
  const avgJerk = count > 0 ? jerkAccum / count : 0.5;

  // Smoothness: penalizes erratic hand jerks
  const smoothnessScore = Math.max(40, Math.min(98, Math.round(100 - avgJerk * 180)));

  // Apex accuracy: reward proper speed modulation (braking into corners and accelerating out)
  const speedVariability = maxSpeed - Math.min(...drawnPath.map(p => p.speed));
  const apexScore = Math.max(50, Math.min(99, Math.round(65 + Math.min(30, speedVariability * 8))));

  return {
    apexScore,
    smoothnessScore,
    avgSpeed: Number(avgSpeed.toFixed(2)),
    maxSpeed: Number(maxSpeed.toFixed(2)),
    maxLateralG: Number(Math.min(3.5, maxLateralG).toFixed(2))
  };
}

