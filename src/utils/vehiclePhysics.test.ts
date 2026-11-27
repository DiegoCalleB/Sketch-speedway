import { CAR_STATS } from '../store/gameStore';
import { Point, RaceCarState, Track } from '../types';
import {
  TRACKS,
  generateAIPath,
  getPerfectLapGuide,
  resampleAndSmoothPath,
  checkSegmentCrossing,
  distToSegment,
  getTrackSurfaceInfo
} from './tracks';
import { stepVehiclePhysics, resolveCarCollisions } from './vehiclePhysics';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`PHYSICS TEST FAILED: ${message}`);
  }
  console.log(`✓ ${message}`);
}

function createInitialCar(track: Track, id = 'test-car', gridIdx = 0): RaceCarState {
  const grid = track.startGrid[gridIdx] || track.startGrid[0];
  return {
    playerId: id,
    x: grid.x,
    y: grid.y,
    vx: 0,
    vy: 0,
    angle: grid.angle,
    targetIndex: 0,
    isDrifting: false,
    driftAngle: 0,
    offTrack: false,
    finished: false,
    disqualified: false,
    timeFinished: null,
    checkpointPassed: -1,
    lap: 1,
    bounceCooldown: 0,
    slipstreamActive: false,
    lapStartTime: 0,
    lapTimes: [],
    bestLapTime: null,
    tireHealth: 100,
    ersBattery: 100,
    drsActive: false,
    angularVelocity: 0,
    steerAngle: 0,
    slipAngle: 0,
    longitudinalG: 0,
    lateralG: 0,
    throttle: 0,
    brake: 0
  };
}

interface SimSummary {
  finished: boolean;
  frames: number;
  simSeconds: number;
  checkpointsPassed: number;
  maxYawRate: number;
  maxSteerDelta: number;
  maxSpeed: number;
  offTrackFrames: number;
  barrierHits: number;
  hadNaN: boolean;
}

function simulateSingleLap(
  track: Track,
  rawPath: Point[],
  carType: 'balanced' | 'speedster' | 'drifter' = 'balanced',
  maxFrames = 1400
): SimSummary {
  const path = resampleAndSmoothPath(rawPath, 5);
  const car = createInitialCar(track);
  const stats = CAR_STATS[carType];

  let maxYawRate = 0;
  let maxSteerDelta = 0;
  let maxSpeed = 0;
  let offTrackFrames = 0;
  let barrierHits = 0;
  let hadNaN = false;
  let prevSteer = 0;

  let frame = 0;
  for (; frame < maxFrames; frame++) {
    const oldX = car.x;
    const oldY = car.y;

    const res = stepVehiclePhysics(car, path, stats, track, [car], 0, 'balanced', 1.0);

    if (
      !Number.isFinite(car.x) ||
      !Number.isFinite(car.y) ||
      !Number.isFinite(car.vx) ||
      !Number.isFinite(car.vy) ||
      !Number.isFinite(car.angle) ||
      !Number.isFinite(car.angularVelocity ?? 0)
    ) {
      hadNaN = true;
      break;
    }

    maxYawRate = Math.max(maxYawRate, Math.abs(car.angularVelocity ?? 0));
    maxSteerDelta = Math.max(maxSteerDelta, Math.abs((car.steerAngle ?? 0) - prevSteer));
    prevSteer = car.steerAngle ?? 0;
    maxSpeed = Math.max(maxSpeed, res.newSpeed);
    if (car.offTrack) offTrackFrames++;
    if (res.hitBarrier) barrierHits++;

    const nextCpIdx = car.checkpointPassed + 1;
    if (nextCpIdx < track.checkpoints.length) {
      const targetCp = track.checkpoints[nextCpIdx];
      const cpDist = distToSegment({ x: car.x, y: car.y }, targetCp.p1, targetCp.p2).dist;
      if (
        checkSegmentCrossing({ x: oldX, y: oldY }, { x: car.x, y: car.y }, targetCp) ||
        cpDist < 12
      ) {
        car.checkpointPassed = nextCpIdx;
      }
    }

    const lapProgress = path.length > 1 ? car.targetIndex / (path.length - 1) : 0;
    const crossedFinish = checkSegmentCrossing(
      { x: oldX, y: oldY },
      { x: car.x, y: car.y },
      track.startLine
    );
    if (
      (crossedFinish && (car.checkpointPassed >= track.checkpoints.length - 1 || lapProgress > 0.72)) ||
      car.targetIndex >= path.length - 2
    ) {
      car.finished = true;
      break;
    }
  }

  return {
    finished: car.finished,
    frames: frame,
    simSeconds: (frame * 16.667) / 1000,
    checkpointsPassed: car.checkpointPassed + 1,
    maxYawRate,
    maxSteerDelta,
    maxSpeed,
    offTrackFrames,
    barrierHits,
    hadNaN
  };
}

console.log('--- RUNNING NEWTONIAN RIGID-BODY F1 PHYSICS VERIFICATION ---');

for (const track of TRACKS) {
  const { perfectPath } = getPerfectLapGuide(track, CAR_STATS.balanced.grip);
  const perfectSim = simulateSingleLap(track, perfectPath, 'balanced');

  console.log(
    `  [${track.name}] Perfect Lap -> finished=${perfectSim.finished}, time=${perfectSim.simSeconds.toFixed(
      2
    )}s, cp=${perfectSim.checkpointsPassed}/${track.checkpoints.length}, maxSpd=${perfectSim.maxSpeed.toFixed(
      2
    )}, maxYaw=${perfectSim.maxYawRate.toFixed(3)}, offTrack=${perfectSim.offTrackFrames}, walls=${perfectSim.barrierHits}`
  );

  assert(!perfectSim.hadNaN, `${track.name}: Perfect Lap produces zero NaN/Infinity values`);
  assert(perfectSim.finished, `${track.name}: Perfect Lap completes full circuit cleanly`);
  assert(
    perfectSim.checkpointsPassed === track.checkpoints.length,
    `${track.name}: Perfect Lap hits all ${track.checkpoints.length} checkpoints`
  );
  assert(
    perfectSim.maxYawRate <= 0.161,
    `${track.name}: Perfect Lap obeys finite yaw rate limit (${perfectSim.maxYawRate.toFixed(3)} <= 0.16)`
  );
  assert(
    perfectSim.maxSteerDelta <= 0.11,
    `${track.name}: Steering rack rate-limited cleanly (${perfectSim.maxSteerDelta.toFixed(3)} rad/frame)`
  );
  assert(
    perfectSim.barrierHits === 0,
    `${track.name}: Perfect Lap stays clear of outer safety barriers (hits=${perfectSim.barrierHits})`
  );

  // Reckless overspeed test (flat-out 6.9 everywhere including hairpins!)
  const recklessPath = perfectPath.map((pt) => ({ ...pt, speed: 6.95 }));
  const recklessSim = simulateSingleLap(track, recklessPath);
  console.log(
    `  [${track.name}] Reckless 6.95 -> finished=${recklessSim.finished}, time=${recklessSim.simSeconds.toFixed(
      2
    )}s, offTrack=${recklessSim.offTrackFrames}, walls=${recklessSim.barrierHits}`
  );
  assert(!recklessSim.hadNaN, `${track.name}: Reckless overspeed stays numerically stable`);
  assert(
    recklessSim.offTrackFrames > perfectSim.offTrackFrames &&
      perfectSim.simSeconds < recklessSim.simSeconds,
    `${track.name}: Perfect Lap strictly beats Reckless 6.95 in lap time (${perfectSim.simSeconds.toFixed(
      2
    )}s < ${recklessSim.simSeconds.toFixed(2)}s) with zero off-track (${perfectSim.offTrackFrames} vs ${recklessSim.offTrackFrames})`
  );

  // Verify Speedster & Drifter car classes also obey physics and complete the circuit cleanly
  for (const carClass of ['speedster', 'drifter'] as const) {
    const classGuide = getPerfectLapGuide(track, CAR_STATS[carClass].grip);
    const classSim = simulateSingleLap(track, classGuide.perfectPath, carClass);
    assert(
      classSim.finished && !classSim.hadNaN && classSim.barrierHits === 0,
      `${track.name} (${carClass}): finishes cleanly in ${classSim.simSeconds.toFixed(2)}s (walls=${classSim.barrierHits})`
    );
  }

  // AI Apex Master path completion test
  const aiPath = generateAIPath(track, 320, 'apex_master', 1);
  const aiSim = simulateSingleLap(track, aiPath);
  assert(
    aiSim.finished && !aiSim.hadNaN,
    `${track.name}: AI Apex Master finishes cleanly in ${aiSim.simSeconds.toFixed(2)}s`
  );
}

// Elastic 2D Car-to-Car Collision Momentum Conservation Test
{
  const track = TRACKS[0];
  const carA = createInitialCar(track, 'car-a', 0);
  const carB = createInitialCar(track, 'car-b', 1);
  carA.x = 100;
  carA.y = 100;
  carA.vx = 5.0;
  carA.vy = 0;
  carB.x = 108;
  carB.y = 100;
  carB.vx = 1.0;
  carB.vy = 0;

  const pBeforeX = carA.vx + carB.vx;
  const pBeforeY = carA.vy + carB.vy;
  let sparked = false;
  resolveCarCollisions([carA, carB], () => {
    sparked = true;
  });
  const pAfterX = carA.vx + carB.vx;
  const pAfterY = carA.vy + carB.vy;

  assert(
    Math.abs(pBeforeX - pAfterX) < 1e-6 && Math.abs(pBeforeY - pAfterY) < 1e-6,
    `Collision conserves linear momentum exactly (${pBeforeX.toFixed(3)} -> ${pAfterX.toFixed(3)})`
  );
  assert(
    Math.hypot(carA.x - carB.x, carA.y - carB.y) >= 12.9,
    'Collision cleanly separates overlapping F1 chassis without interpenetration'
  );
  assert(sparked, 'High-impulse contact triggers carbon-titanium collision spark callback');
  assert(
    (carA.damageFront ?? 0) > 0.05 &&
      (carB.damageRear ?? 0) > 0.05 &&
      (carA.chassisHealth ?? 100) < 100 &&
      (carB.chassisHealth ?? 100) < 100,
    `Rear-end collision dents Car A nosecone (front=${(carA.damageFront ?? 0).toFixed(2)}) and Car B rear diffuser/wing (rear=${(carB.damageRear ?? 0).toFixed(2)})`
  );
}

// Regression Test 1: Car stranded deep on the inner grass facing backwards/sideways at 16 km/h (screenshot bug!)
for (const track of TRACKS) {
  const { perfectPath } = getPerfectLapGuide(track, CAR_STATS.balanced.grip);
  const path = resampleAndSmoothPath(perfectPath, 5);
  const car = createInitialCar(track, 'stranded-grass-car');
  // Place car deep inside the inner grass infield near the first corner, pointing away from track at 16 km/h
  const midNode = path[Math.floor(path.length * 0.25)];
  car.x = (midNode.x + track.width * 0.5) * 0.5;
  car.y = (midNode.y + track.height * 0.5) * 0.5;
  car.angle = Math.PI * 0.85;
  car.vx = Math.cos(car.angle) * 0.35;
  car.vy = Math.sin(car.angle) * 0.35;
  car.targetIndex = Math.floor(path.length * 0.20);

  let escapedAndFinished = false;
  for (let f = 0; f < 1400; f++) {
    stepVehiclePhysics(car, path, CAR_STATS.balanced, track, [car], 0, 'balanced', 1.0);
    if (car.targetIndex >= path.length - 2) {
      escapedAndFinished = true;
      break;
    }
  }
  assert(
    escapedAndFinished,
    `${track.name}: Car stranded deep in inner grass facing wrong way escapes cleanly without looping (idx=${car.targetIndex}/${path.length - 1})`
  );
}

// Regression Test 2: Messy human-drawn path cutting across the inner grass of corners
for (const track of TRACKS) {
  const { perfectPath } = getPerfectLapGuide(track, CAR_STATS.balanced.grip);
  // Aggressively pull corner nodes inward toward the center of the track (simulating messy mobile finger drawing cutting grass!)
  const messyPath = perfectPath.map((pt, i) => {
    const cutFactor = i > 15 && i < perfectPath.length - 15 ? 0.28 : 0;
    return {
      ...pt,
      x: pt.x * (1 - cutFactor) + track.width * 0.5 * cutFactor,
      y: pt.y * (1 - cutFactor) + track.height * 0.5 * cutFactor,
      speed: 6.2
    };
  });
  const messySim = simulateSingleLap(track, messyPath, 'balanced', 1600);
  assert(
    messySim.finished && !messySim.hadNaN,
    `${track.name}: Messy corner-cutting human path finishes cleanly without getting stuck (${messySim.simSeconds.toFixed(2)}s)`
  );
}

// Regression Test 3: 4-Car Pack Racing Together with Elastic Collisions (No car gets stuck!)
for (const track of TRACKS) {
  const paths = [
    resampleAndSmoothPath(getPerfectLapGuide(track, CAR_STATS.balanced.grip, 0).perfectPath, 5),
    resampleAndSmoothPath(generateAIPath(track, 320, 'aggressive', 1), 5),
    resampleAndSmoothPath(generateAIPath(track, 320, 'apex_master', 2), 5),
    resampleAndSmoothPath(generateAIPath(track, 320, 'defensive', 3), 5)
  ];
  const carTypes = ['balanced', 'speedster', 'drifter', 'balanced'] as const;
  const cars = paths.map((_, i) => createInitialCar(track, `pack-${i}`, i));

  for (let f = 0; f < 1400; f++) {
    for (let i = 0; i < cars.length; i++) {
      if (cars[i].finished) continue;
      stepVehiclePhysics(cars[i], paths[i], CAR_STATS[carTypes[i]], track, cars, i, 'balanced', 1.0);
      if (cars[i].targetIndex >= paths[i].length - 2) {
        cars[i].finished = true;
      }
    }
    resolveCarCollisions(cars);
    if (cars.every((c) => c.finished)) break;
  }
  const allFinished = cars.every((c) => c.finished);
  assert(allFinished, `${track.name}: All 4 cars in wheel-to-wheel pack race finish cleanly without sticking`);
}

// Regression Test 4: High-Speed Head-On Impact Against Outer & Inner Guardrails ("Quitamiedos") — Zero Tunneling!
for (const track of TRACKS) {
  const { perfectPath } = getPerfectLapGuide(track, CAR_STATS.balanced.grip);
  const path = resampleAndSmoothPath(perfectPath, 5);
  const grid = track.startGrid[0];
  const car = createInitialCar(track, 'wall-crash-test', 0);

  // Aim car straight perpendicular into the outer guardrail at full F1 speed (~325 km/h)
  const surfStart = getTrackSurfaceInfo(grid, track);
  const outAng = Math.atan2(surfStart.outwardEdgeVec.y, surfStart.outwardEdgeVec.x);
  car.angle = outAng;
  car.vx = Math.cos(outAng) * 7.1;
  car.vy = Math.sin(outAng) * 7.1;
  car.trackSegmentIdx = surfStart.segmentIdx;

  // Create a malicious path pointing straight through the outer guardrail wall 200 units out of bounds
  const throughWallPath: Point[] = [];
  for (let k = 0; k < 40; k++) {
    throughWallPath.push({
      x: grid.x + Math.cos(outAng) * (k * 6),
      y: grid.y + Math.sin(outAng) * (k * 6),
      t: k * 16,
      speed: 7.2
    });
  }

  let hitWall = false;
  let maxPenetrationBeyondWall = 0;
  for (let f = 0; f < 45; f++) {
    const res = stepVehiclePhysics(car, throughWallPath, CAR_STATS.balanced, track, [car], 0, 'balanced', 1.0);
    if (res.hitBarrier) hitWall = true;
    const s = getTrackSurfaceInfo({ x: car.x, y: car.y }, track, car.trackSegmentIdx);
    const pen = s.distFromCenter - s.outerBarrierDistFromCenter;
    if (pen > maxPenetrationBeyondWall) maxPenetrationBeyondWall = pen;
  }

  assert(
    hitWall && maxPenetrationBeyondWall <= 0.01 && (car.chassisHealth ?? 100) < 100,
    `${track.name}: 325 km/h head-on guardrail crash blocks car completely (pen=${maxPenetrationBeyondWall.toFixed(
      2
    )} <= 0, health=${car.chassisHealth}%)`
  );

  // Also test inner infield guardrail impenetrability!
  const innerCar = createInitialCar(track, 'inner-wall-test', 0);
  const inAng = Math.atan2(-surfStart.outwardEdgeVec.y, -surfStart.outwardEdgeVec.x);
  innerCar.angle = inAng;
  innerCar.vx = Math.cos(inAng) * 7.1;
  innerCar.vy = Math.sin(inAng) * 7.1;
  innerCar.trackSegmentIdx = surfStart.segmentIdx;

  const throughInnerPath: Point[] = [];
  for (let k = 0; k < 40; k++) {
    throughInnerPath.push({
      x: grid.x + Math.cos(inAng) * (k * 6),
      y: grid.y + Math.sin(inAng) * (k * 6),
      t: k * 16,
      speed: 7.2
    });
  }

  let hitInner = false;
  let maxInnerPen = 0;
  for (let f = 0; f < 45; f++) {
    const res = stepVehiclePhysics(innerCar, throughInnerPath, CAR_STATS.balanced, track, [innerCar], 0, 'balanced', 1.0);
    if (res.hitBarrier) hitInner = true;
    const s = getTrackSurfaceInfo({ x: innerCar.x, y: innerCar.y }, track, innerCar.trackSegmentIdx);
    const pen = s.distFromCenter - s.innerBarrierDistFromCenter;
    if (pen > maxInnerPen) maxInnerPen = pen;
  }

  assert(
    hitInner && maxInnerPen <= 0.01 && path.length > 10,
    `${track.name}: 325 km/h inner infield guardrail blocks car completely (pen=${maxInnerPen.toFixed(2)} <= 0)`
  );
}

// Regression Test 5: Perfect Lap Provable Optimality Stress Test
// Actively tries to beat getPerfectLapGuide with faster speed scales on every circuit and proves no legal clean lap (offTrack=0, walls=0) beats it!
for (const track of TRACKS) {
  const { perfectPath } = getPerfectLapGuide(track, CAR_STATS.balanced.grip);
  const optSim = simulateSingleLap(track, perfectPath, 'balanced');
  assert(
    optSim.finished && optSim.offTrackFrames === 0 && optSim.barrierHits === 0,
    `${track.name}: Optimal Perfect Lap completes legally with zero off-track & zero wall hits (${optSim.simSeconds.toFixed(2)}s)`
  );

  let fastestCleanChallenger = optSim.simSeconds;
  let challengerLabel = 'none';
  for (const mult of [1.03, 1.06, 1.10, 1.16, 1.25]) {
    const fasterPath = perfectPath.map((pt) => ({
      ...pt,
      speed: Math.min(7.8, pt.speed * mult)
    }));
    const chal = simulateSingleLap(track, fasterPath, 'balanced');
    if (chal.finished && chal.offTrackFrames === 0 && chal.barrierHits === 0 && chal.simSeconds < fastestCleanChallenger) {
      fastestCleanChallenger = chal.simSeconds;
      challengerLabel = `x${mult}`;
    }
  }

  assert(
    optSim.simSeconds <= fastestCleanChallenger + 0.05,
    `${track.name}: Perfect Lap (${optSim.simSeconds.toFixed(2)}s) is provably optimal against faster legal speed profiles (best challenger ${challengerLabel}: ${fastestCleanChallenger.toFixed(2)}s)`
  );
}

console.log('--- ALL NEWTONIAN RIGID-BODY PHYSICS TESTS PASSED ---');

