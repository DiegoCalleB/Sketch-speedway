import {
  isPointInPolygon,
  lineIntersects,
  generateAIPath,
  computeTelemetryEvaluation,
  getTrackCenterline,
  getMaxSafeCornerSpeed,
  analyzeDrawnPathSafety,
  TRACKS
} from './tracks';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${message}`);
  }
  console.log(`✓ ${message}`);
}

console.log('--- RUNNING APEX RACING LAB ACADEMIC TEST SUITE ---');

// 1. Point in polygon test
const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];
assert(isPointInPolygon({ x: 50, y: 50 }, square), 'Point inside square detected correctly');
assert(!isPointInPolygon({ x: 150, y: 50 }, square), 'Point outside square detected correctly');

// 2. Line intersection test
const l1a = { x: 0, y: 0 };
const l1b = { x: 10, y: 10 };
const l2a = { x: 0, y: 10 };
const l2b = { x: 10, y: 0 };
assert(lineIntersects(l1a, l1b, l2a, l2b), 'Intersecting diagonal segments detected');

const l3a = { x: 0, y: 0 };
const l3b = { x: 10, y: 0 };
const l4a = { x: 0, y: 5 };
const l4b = { x: 10, y: 5 };
assert(!lineIntersects(l3a, l3b, l4a, l4b), 'Parallel segments do not intersect');

// 3. Corner speed limit physics test
const straightLimit = getMaxSafeCornerSpeed(0.0005, 0.0005, 0.2, true);
const tightCornerLimit = getMaxSafeCornerSpeed(0.025, 0.025, 0.2, true);
assert(straightLimit > tightCornerLimit * 1.4, `Straight speed limit (${straightLimit.toFixed(2)}) > tight corner limit (${tightCornerLimit.toFixed(2)})`);

// 4. Track validity tests for all 3 circuits
for (const track of TRACKS) {
  assert(track.outerBoundary.length >= 20, `${track.name}: Outer boundary vertices count sufficient (${track.outerBoundary.length})`);
  assert(track.innerBoundary.length >= 20, `${track.name}: Inner boundary vertices count sufficient (${track.innerBoundary.length})`);
  assert(track.checkpoints.length >= 2, `${track.name}: Has at least 2 checkpoint gates (${track.checkpoints.length})`);
  
  // Centerline generation
  const centerline = getTrackCenterline(track);
  assert(centerline.length === Math.min(track.outerBoundary.length, track.innerBoundary.length), `${track.name}: Centerline computed`);

  // AI Path Generation for all 3 archetypes
  const apexPath = generateAIPath(track, 150, 'apex_master', 0);
  assert(apexPath.length === 150, `${track.name}: Apex Master path generated with 150 nodes`);
  assert(apexPath[0].speed > 0, `${track.name}: Apex Master nodes have positive speeds`);

  const aggroPath = generateAIPath(track, 150, 'aggressive', 1);
  assert(aggroPath.length === 150, `${track.name}: Aggressive path generated with 150 nodes`);

  const defPath = generateAIPath(track, 150, 'defensive', 2);
  assert(defPath.length === 150, `${track.name}: Defensive path generated with 150 nodes`);

  // Safety analysis on reckless overspeed path vs controlled AI path
  const recklessPath = apexPath.map((pt) => ({ ...pt, speed: 6.9 }));
  const recklessSafety = analyzeDrawnPathSafety(recklessPath, track, 0.2);
  assert(recklessSafety.dangerZones.length > 0, `${track.name}: Reckless 6.9 speed in corners triggers dangerZones (${recklessSafety.dangerZones.length})`);

  // Telemetry Evaluation
  const evalMetrics = computeTelemetryEvaluation(apexPath, track);
  assert(evalMetrics.apexScore >= 50 && evalMetrics.apexScore <= 100, `${track.name}: Apex score within bounds [50-100] (${evalMetrics.apexScore})`);
  assert(evalMetrics.smoothnessScore >= 40 && evalMetrics.smoothnessScore <= 100, `${track.name}: Smoothness score within bounds [40-100] (${evalMetrics.smoothnessScore})`);
  assert(evalMetrics.avgSpeed > 0, `${track.name}: Average speed computed (${evalMetrics.avgSpeed})`);
}

console.log('--- ALL ACADEMIC TESTS PASSED SUCCESSFULLY ---');

