import { CarStats, PaceStrategyMode, Point, RaceCarState, Track } from '../types';
import {
  checkSegmentCrossing,
  distToSegment,
  getMaxSafeCornerSpeed,
  getTrackObstacleColliders,
  getTrackSurfaceInfo,
  registerPerfectLapPhysicsEvaluator,
  resampleAndSmoothPath
} from './tracks';

export interface VehiclePhysicsStepResult {
  newSpeed: number;
  isDrifting: boolean;
  isBraking: boolean;
  isOverspeedWide: boolean;
  slipstreamActive: boolean;
  onCurbOrGrass: boolean;
  surfaceElevationZ: number;
  centrifugalForce: number;
  distFromCenter: number;
  hitBarrier: boolean;
  impactSeverity: number;
  impactZone: 'front' | 'rear' | 'left' | 'right' | null;
}

const WHEELBASE = 8.4; // Physical distance between front and rear F1 axles (world units)
const L_FRONT = WHEELBASE * 0.46; // Center of gravity slightly rear-biased like real F1 (46/54)
const L_REAR = WHEELBASE * 0.54;
const MASS = 1.0; // Normalized F1 car mass
const INERTIA_Z = 3.45; // Physical yaw moment of inertia (m * k^2) preventing impossible instant turns
const CAR_HALF_LENGTH = 5.4; // Physical F1 nosecone / rear diffuser half-length for flush barrier contact
const CAR_HALF_WIDTH = 3.0;  // Physical F1 sidepod / wheel-track half-width for flush barrier contact

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Compute which anatomical zone of the F1 car ('front', 'rear', 'left', 'right') absorbs an external impact
 * where (normalIntoCarX, normalIntoCarY) points FROM the barrier/opponent INTO the car's center of mass.
 * Equivalently, the contact point on the car hull is in direction (-normalIntoCarX, -normalIntoCarY).
 */
export function applyLocalizedChassisDent(
  car: RaceCarState,
  normalIntoCarX: number,
  normalIntoCarY: number,
  rawSeverity: number
): 'front' | 'rear' | 'left' | 'right' {
  const severity = clamp(rawSeverity, 0.04, 1.0);
  const cosY = Math.cos(car.angle);
  const sinY = Math.sin(car.angle);

  // Contact vector from car center toward the impact point in car's local frame (+X = Nose, +Y = Right sidepod in 2D)
  const contactWorldX = -normalIntoCarX;
  const contactWorldY = -normalIntoCarY;
  const localContactX = contactWorldX * cosY + contactWorldY * sinY;
  const localContactY = -contactWorldX * sinY + contactWorldY * cosY;

  let primaryZone: 'front' | 'rear' | 'left' | 'right';
  if (Math.abs(localContactX) >= Math.abs(localContactY) * 0.92) {
    primaryZone = localContactX >= 0 ? 'front' : 'rear';
  } else {
    // In 2D screen coords (+Y down), localContactY > 0 is right side of car, < 0 is left side
    primaryZone = localContactY >= 0 ? 'right' : 'left';
  }

  // Accumulate permanent plastic deformation (crumpling/denting) across the impacted zone + adjacent corner bleed
  const dentGain = severity * 0.68;
  if (primaryZone === 'front') {
    car.damageFront = clamp((car.damageFront ?? 0) + dentGain, 0, 1);
    if (localContactY > 0.25) {
      car.damageRight = clamp((car.damageRight ?? 0) + dentGain * 0.45, 0, 1);
    } else if (localContactY < -0.25) {
      car.damageLeft = clamp((car.damageLeft ?? 0) + dentGain * 0.45, 0, 1);
    }
  } else if (primaryZone === 'rear') {
    car.damageRear = clamp((car.damageRear ?? 0) + dentGain, 0, 1);
    if (localContactY > 0.25) {
      car.damageRight = clamp((car.damageRight ?? 0) + dentGain * 0.38, 0, 1);
    } else if (localContactY < -0.25) {
      car.damageLeft = clamp((car.damageLeft ?? 0) + dentGain * 0.38, 0, 1);
    }
  } else if (primaryZone === 'left') {
    car.damageLeft = clamp((car.damageLeft ?? 0) + dentGain, 0, 1);
    if (localContactX > 0.3) {
      car.damageFront = clamp((car.damageFront ?? 0) + dentGain * 0.40, 0, 1);
    }
  } else {
    car.damageRight = clamp((car.damageRight ?? 0) + dentGain, 0, 1);
    if (localContactX > 0.3) {
      car.damageFront = clamp((car.damageFront ?? 0) + dentGain * 0.40, 0, 1);
    }
  }

  const totalDamage =
    (car.damageFront ?? 0) * 0.46 +
    (car.damageRear ?? 0) * 0.18 +
    (car.damageLeft ?? 0) * 0.18 +
    (car.damageRight ?? 0) * 0.18;
  car.chassisHealth = Math.round(clamp(100 - totalDamage * 80, 20, 100));
  car.lastImpactSeverity = Math.max(car.lastImpactSeverity ?? 0, severity);
  car.lastImpactZone = primaryZone;
  car.lastImpactPos = {
    x: car.x + contactWorldX * 5.2,
    y: car.y + contactWorldY * 5.2
  };

  return primaryZone;
}

/**
 * Pure-Pursuit + Pacejka Friction-Circle Rigid-Body F1 Vehicle Physics Engine.
 * Enforces real Newtonian inertia, finite Ackermann steering geometry, rate-limited steering rack,
 * kinematic braking envelopes, aerodynamic ground-effect downforce (v^2), longitudinal weight transfer,
 * quadratic drag, realistic understeer/oversteer slip angles, anti-orbiting waypoint projection,
 * and physical Tecpro barrier crash & crumple-zone containment.
 */
export function stepVehiclePhysics(
  car: RaceCarState,
  path: Point[],
  stats: CarStats,
  track: Track,
  allCars: RaceCarState[],
  carIdx: number,
  activeStrategy: PaceStrategyMode,
  dtFactor: number
): VehiclePhysicsStepResult {
  // Decay transient impact shock pulse smoothly while preserving permanent structural dents
  if ((car.lastImpactSeverity ?? 0) > 0) {
    car.lastImpactSeverity = Math.max(0, (car.lastImpactSeverity ?? 0) - 0.08 * dtFactor);
  }

  // 1. Forward-projecting waypoint progress tracker (never warps car position, never traps car behind a missed node!)
  let idx = clamp(car.targetIndex, 0, path.length - 1);
  const searchWindow = Math.min(path.length - 1, idx + 48);
  let bestIdx = idx;
  let bestDist = Math.hypot(path[idx].x - car.x, path[idx].y - car.y);

  for (let k = idx + 1; k <= searchWindow; k++) {
    const d = Math.hypot(path[k].x - car.x, path[k].y - car.y);
    if (d < bestDist + 1.5 || d < 18) {
      bestDist = d;
      bestIdx = k;
    }
  }

  // Longitudinal projection check: if the car already passed bestIdx along the path tangent
  // (e.g. cut inside on grass or ran wide off-track), advance bestIdx so it NEVER loops backward to chase a missed waypoint!
  let safetyGuard = 0;
  while (bestIdx < path.length - 2 && safetyGuard < 18) {
    const pCurr = path[bestIdx];
    const pNext = path[bestIdx + 1];
    const segX = pNext.x - pCurr.x;
    const segY = pNext.y - pCurr.y;
    const segLenSq = segX * segX + segY * segY;
    if (segLenSq < 0.001) {
      bestIdx++;
      safetyGuard++;
      continue;
    }
    const carToCurrX = car.x - pCurr.x;
    const carToCurrY = car.y - pCurr.y;
    const projT = (carToCurrX * segX + carToCurrY * segY) / segLenSq;
    // Advance if we are longitudinally past the midpoint of this segment OR very close to it
    if (projT > 0.65 || Math.hypot(carToCurrX, carToCurrY) < 22) {
      bestIdx++;
      safetyGuard++;
    } else {
      break;
    }
  }

  car.targetIndex = bestIdx;
  idx = bestIdx;

  // 2. Aerodynamic Slipstream detection (Rebufo)
  let slipstreamActive = false;
  const fwdX0 = Math.cos(car.angle);
  const fwdY0 = Math.sin(car.angle);
  for (let oIdx = 0; oIdx < allCars.length; oIdx++) {
    if (oIdx === carIdx) continue;
    const otherCar = allCars[oIdx];
    if (otherCar.finished || otherCar.disqualified) continue;
    const dX = otherCar.x - car.x;
    const dY = otherCar.y - car.y;
    const dist = Math.hypot(dX, dY);
    if (dist > 13 && dist < 58) {
      const dot = (dX * fwdX0 + dY * fwdY0) / dist;
      if (dot > 0.86) {
        slipstreamActive = true;
        break;
      }
    }
  }
  car.slipstreamActive = slipstreamActive;

  // 3. Surface, Tire Degradation, Structural Aero Damage & Hybrid Strategy State
  const surface = getTrackSurfaceInfo({ x: car.x, y: car.y }, track, car.trackSegmentIdx);
  let segIdx = surface.segmentIdx;
  const trackObstacles = getTrackObstacleColliders(track);
  car.offTrack = !surface.onAsphalt;

  const dmgFront = car.damageFront ?? 0;
  const dmgRear = car.damageRear ?? 0;
  const dmgLeft = car.damageLeft ?? 0;
  const dmgRight = car.damageRight ?? 0;
  const healthRatio = clamp((car.chassisHealth ?? 100) / 100, 0.25, 1.0);
  // Real F1 crash physics: crumpled wings & sidepods meaningfully degrade aero downforce, add drag & hurt alignment
  const aeroDownforceHealth = clamp(1.0 - dmgFront * 0.28 - dmgRear * 0.16, 0.58, 1.0);
  const aeroDragPenalty = 1.0 + (dmgFront + dmgLeft + dmgRight) * 0.42;
  const damageSpeedMult = clamp(0.62 + 0.38 * healthRatio, 0.62, 1.0);

  const currentErs = car.ersBattery ?? 100;
  const currentTireHealth = car.tireHealth ?? 100;
  const currentTireTemp = car.tireTemp ?? 88;
  // Pirelli Thermal Grip Window: warms from cold (~78°C) into optimal 95-108°C window, drops slightly when overheated (>118°C)
  const thermalGripMult =
    currentTireTemp < 95
      ? 0.96 + 0.04 * clamp((currentTireTemp - 74) / 21, 0, 1)
      : currentTireTemp <= 112
        ? 1.015
        : Math.max(0.92, 1.015 - (currentTireTemp - 112) * 0.006);
  const tireGripFactor = (0.84 + 0.16 * (currentTireHealth / 100)) * thermalGripMult;
  const strategyGripMult =
    activeStrategy === 'conserve' ? 1.07 : activeStrategy === 'attack' ? 0.985 : 1.0;

  // 4. Local path curvature & Exact Newtonian Kinematic Braking Envelope along the drawn path
  const prevW = path[Math.max(0, idx - 2)];
  const currW = path[idx];
  const nextW = path[Math.min(path.length - 1, idx + 4)];
  const a1 = Math.atan2(currW.y - prevW.y, currW.x - prevW.x);
  const a2 = Math.atan2(nextW.y - currW.y, nextW.x - currW.x);
  const signedTurn = normalizeAngle(a2 - a1);
  const absCurvature = Math.abs(signedTurn);
  const spanDist = Math.max(12, Math.hypot(nextW.x - prevW.x, nextW.y - prevW.y));
  const pathCurvatureRadPerPx = absCurvature / spanDist;

  // Carbon-ceramic braking capacity used for driver's kinematic braking point calculation
  // Honors the user's drawn speed profile strictly: if they drew flat-out into a hairpin, the car WILL NOT cheat-brake!
  const planBrakeDecel = (0.19 + stats.grip * 0.72) * (surface.onAsphalt ? 1.0 : 0.45);
  let desiredSpeed = path[idx].speed;
  let accumBrakeDist = 0;
  const maxLookIdx = Math.min(path.length - 1, idx + 36);
  for (let b = idx + 1; b <= maxLookIdx; b++) {
    const pPrev = path[b - 1];
    const pCurr = path[b];
    accumBrakeDist += Math.hypot(pCurr.x - pPrev.x, pCurr.y - pPrev.y);
    const futureSpeed = pCurr.speed;
    if (futureSpeed < desiredSpeed) {
      // Exact Newtonian kinematics: v_max_now = sqrt(v_future^2 + 2 * a_brake * dist)
      const vAllowed = Math.sqrt(futureSpeed * futureSpeed + 2 * planBrakeDecel * accumBrakeDist);
      if (vAllowed < desiredSpeed) {
        desiredSpeed = vAllowed;
      }
    }
    if (accumBrakeDist > 160) break;
  }

  const currentSpeed0 = Math.hypot(car.vx, car.vy);
  const maxSafeSpeed =
    getMaxSafeCornerSpeed(pathCurvatureRadPerPx, surface.trackCurvature, stats.grip, true) *
    tireGripFactor *
    strategyGripMult;

  const isCornerZone = absCurvature > 0.04 || surface.trackCurvature > 0.0036;
  const overspeedRatio = desiredSpeed / Math.max(1.2, maxSafeSpeed);

  // Automatic DRS activation on straightaways (Lap 2+ or slipstream)
  const drsOpen =
    surface.onAsphalt &&
    !isCornerZone &&
    currentSpeed0 > 4.6 &&
    (car.lap > 1 || slipstreamActive) &&
    Math.abs(car.slipAngle ?? 0) < 0.14;
  car.drsActive = drsOpen;

  // ERS Attack boost
  const ersBoostActive = activeStrategy === 'attack' && currentErs > 3 && surface.onAsphalt;
  const strategySpeedMult = ersBoostActive
    ? 1.07
    : activeStrategy === 'conserve'
      ? 0.97
      : 1.0;

  // Apex exit momentum reward when driver hits the corner cleanly inside the tire friction circle
  const isApexBoost =
    surface.onAsphalt && isCornerZone && overspeedRatio >= 0.72 && overspeedRatio <= 1.08;
  const apexMult = isApexBoost ? 1.06 : 1.0;

  // Off-track grass/gravel heavily penalizes speed (no grass corner-cutting shortcuts!), while allowing smooth ~75-90 km/h recovery back to asphalt!
  const surfaceDragMult = surface.onAsphalt ? 1.0 : surface.onCurbOrGrass ? 10.5 : 21.0;
  // At low speeds (< 2.0), mechanical tire tread bite lets an off-track car steer cleanly back onto asphalt
  // At high speeds (> 2.8), grass/gravel grip drops to 0.34 so overspeeding still causes true understeer!
  const lowSpeedGrassBite = clamp(1 - (currentSpeed0 - 1.3) / 1.8, 0, 1);
  const offTrackMu = 0.34 + lowSpeedGrassBite * 0.44;
  const surfaceMu = surface.onAsphalt ? 1.0 : surface.onCurbOrGrass ? Math.max(0.58, offTrackMu) : offTrackMu;

  // Effective physical top speed given engine power, DRS, slipstream, ERS & chassis structural health
  const maxCarSpeed =
    stats.maxSpeed *
    strategySpeedMult *
    apexMult *
    damageSpeedMult *
    (slipstreamActive ? 1.10 : drsOpen ? 1.05 : 1.0);

  let targetSpeed = Math.min(
    desiredSpeed * strategySpeedMult * damageSpeedMult * (slipstreamActive ? 1.11 : drsOpen ? 1.04 : 1.0),
    maxCarSpeed
  );

  // If currently off-track on deep grass/gravel, cap throttle cruise speed realistically (~85 km/h) while keeping enough torque to rejoin cleanly
  if (!surface.onAsphalt && !surface.onCurbOrGrass) {
    targetSpeed = clamp(targetSpeed, 1.65, 2.05);
  }
  // Immediately after slamming a guardrail/obstacle, real suspension shock & gear downshift briefly limit engine throttle recovery
  if (car.bounceCooldown > 0) {
    const stunRatio = clamp(car.bounceCooldown / 52, 0, 1);
    const stunSpeedCap = 1.05 + (1 - stunRatio) * 2.4;
    targetSpeed = Math.min(targetSpeed, stunSpeedCap);
  }

  // 5. Sub-stepped Rigid-Body Physics Integration (4 substeps per frame for rock-solid Newtonian stability!)
  const SUBSTEPS = 4;
  const subDt = clamp(dtFactor, 0.05, 3.0) / SUBSTEPS;

  let x = car.x;
  let y = car.y;
  let vx = car.vx;
  let vy = car.vy;
  let yaw = car.angle;
  let omega = car.angularVelocity ?? 0;
  let steer = car.steerAngle ?? 0;

  let lastLongAccel = 0;
  let lastLatAccel = 0;
  let lastThrottle = 0;
  let lastBrake = 0;
  let maxSlipRatio = 0;
  let hitBarrier = false;
  let stepImpactSeverity = 0;
  let stepImpactZone: 'front' | 'rear' | 'left' | 'right' | null = null;

  // Calibrated Newtonian Pacejka tire friction peak matching real F1 centripetal cornering limits:
  // Perfect Lap holds peak Pacejka grip (~3.8-4.5G) with zero off-track; reckless overspeed saturates tires & understeers wide!
  const baseMu =
    0.195 * Math.pow(stats.grip / 0.075, 0.54) * tireGripFactor * strategyGripMult * surfaceMu;

  for (let s = 0; s < SUBSTEPS; s++) {
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    // Transform world velocity into car's local coordinate frame (Forward + Right)
    let vFwd = vx * cosY + vy * sinY;
    let vLat = -vx * sinY + vy * cosY;
    const speed = Math.hypot(vFwd, vLat);

    // Speed-sensitive physical steering lock limit (F1 wheel locks ±31° slow, tightens at 320+ km/h)
    const maxSteerLock = clamp(0.55 - speed * 0.030, 0.22, 0.55);

    // Physical minimum turning radius of the car at current speed (prevents impossible orbiting loops!)
    const rMin = (WHEELBASE / Math.tan(Math.max(0.22, maxSteerLock))) * (surface.onAsphalt ? 1.15 : 1.45);

    // Pure-Pursuit Steering Target along the drawn spline
    // When off-track or far from the racing line, look further ahead like a real F1 driver rejoining the circuit!
    const distToCurrentNode = Math.hypot(path[idx].x - x, path[idx].y - y);
    const rejoinBoost = !surface.onAsphalt || distToCurrentNode > 24 ? Math.min(48, distToCurrentNode * 0.85 + 18) : 0;
    const lookAheadDist = clamp(10.0 + speed * 2.2 + rejoinBoost, 10.0, 68.0);

    let targetPt = path[path.length - 1];
    let accumDist = 0;
    let cursorIdx = idx;
    while (cursorIdx < path.length - 1) {
      const pA = path[cursorIdx];
      const pB = path[cursorIdx + 1];
      const segLen = Math.hypot(pB.x - pA.x, pB.y - pA.y);
      accumDist += segLen;
      if (accumDist >= lookAheadDist) {
        targetPt = pB;
        break;
      }
      cursorIdx++;
    }

    // If a messy finger-drawn waypoint lies behind a solid guardrail (e.g. deep in the infield),
    // aim for the closest drivable inside/outside asphalt apex instead of ramming blindly into the guardrail
    const clampAimToCorridor = (pt: Point): Point => {
      const tSurf = getTrackSurfaceInfo(pt, track);
      if (tSurf.distFromCenter > tSurf.halfWidth + 4.5) {
        const pullIn = tSurf.distFromCenter - Math.max(4, tSurf.halfWidth - 3.0);
        return {
          ...pt,
          x: pt.x + tSurf.inwardNormal.x * pullIn,
          y: pt.y + tSurf.inwardNormal.y * pullIn
        };
      }
      return pt;
    };

    targetPt = clampAimToCorridor(targetPt);

    // Anti-Orbiting Turning-Circle Check:
    // If targetPt lies inside our physical turning circle (or right beside/behind us while waypoints remain ahead),
    // smoothly look further forward along the spline until the target is outside the turning circle!
    let relX = targetPt.x - x;
    let relY = targetPt.y - y;
    let localX = relX * cosY + relY * sinY;
    let localY = -relX * sinY + relY * cosY;

    let advanceChecks = 0;
    while (cursorIdx < path.length - 2 && advanceChecks < 28) {
      const absLocalY = Math.abs(localY);
      const distFromTurnCenterSq = localX * localX + (absLocalY - rMin) * (absLocalY - rMin);
      const insideTurningCircle = distFromTurnCenterSq < rMin * rMin * 0.92;
      const behindOrTooClose = localX < 6 && Math.hypot(localX, localY) < rMin * 1.8;

      if (!insideTurningCircle && !behindOrTooClose) {
        break;
      }

      cursorIdx = Math.min(path.length - 1, cursorIdx + 2);
      targetPt = clampAimToCorridor(path[cursorIdx]);
      relX = targetPt.x - x;
      relY = targetPt.y - y;
      localX = relX * cosY + relY * sinY;
      localY = -relX * sinY + relY * cosY;
      advanceChecks++;
    }

    const ldSq = Math.max(40, localX * localX + localY * localY);

    let desiredSteer: number;
    if (localX < 0) {
      // Target is behind nose (car spun >90°) -> full lock recovery turn toward the racing line
      desiredSteer = (localY >= 0 ? 1 : -1) * maxSteerLock;
    } else {
      // Pure-Pursuit geometric curvature kappa = 2 * localY / L_d^2
      const rawCurvature = (2.0 * localY) / ldSq;
      desiredSteer = Math.atan(WHEELBASE * rawCurvature * 1.25);
    }

    // If off-track and pressed close to a guardrail/tire wall at low recovery speed, steer away from the wall back toward asphalt
    if (!surface.onAsphalt && speed < 2.2) {
      const noseIntoPerimeter =
        cosY * -surface.inwardNormal.x + sinY * -surface.inwardNormal.y;
      if (noseIntoPerimeter > 0.25 && surface.distFromCenter > surface.halfWidth + 4.0) {
        const crossToTrack = cosY * surface.inwardNormal.y - sinY * surface.inwardNormal.x;
        desiredSteer = (crossToTrack >= 0 ? 1 : -1) * maxSteerLock;
      }
    }

    // Natural F1 driver counter-steer assistance when rear steps out (prevents unrealistic 720 spins)
    if (speed > 1.4 && Math.abs(vLat) > 0.28) {
      const currentSlip = Math.atan2(vLat, Math.max(0.8, Math.abs(vFwd)));
      desiredSteer = desiredSteer * 0.86 + currentSlip * 0.30;
    }
    desiredSteer = clamp(desiredSteer, -maxSteerLock, maxSteerLock);

    // Physical steering rack angular rate limit (wheels cannot teleport from -28° to +28° in 1 frame!)
    const maxSteerDelta = 0.092 * subDt;
    const steerErr = desiredSteer - steer;
    steer += clamp(steerErr, -maxSteerDelta, maxSteerDelta);

    // Longitudinal Driver Inputs (Smooth Throttle & Progressive Carbon-Ceramic Braking)
    // Throttle respects physical caps (deep gravel, crash gear-recovery), whereas carbon-ceramic brakes ONLY engage
    // when the driver's drawn speed profile actually calls for braking (never free auto-braking for flat-out reckless drivers!)
    const effectiveTargetSpeed =
      localX < 0 && !surface.onAsphalt ? Math.min(targetSpeed, 1.9) : targetSpeed;
    const driverBrakeTarget =
      localX < 0 && !surface.onAsphalt ? Math.min(desiredSpeed, 1.9) : desiredSpeed;
    const throttleErr = effectiveTargetSpeed - vFwd;
    const brakeErr = driverBrakeTarget - vFwd;
    let throttle = 0;
    let brake = 0;
    if (brakeErr < -0.10) {
      brake = clamp(-brakeErr / 1.25, 0, 1);
    } else if (throttleErr > 0.06) {
      throttle = clamp(throttleErr / 1.15, 0, 1);
    }

    // Physical Engine Power Curve + Braking Force + Quadratic Aerodynamic Drag (F_drag ~ v^2)
    const engineTorque =
      (0.135 + stats.acceleration * 0.62) * strategySpeedMult * (drsOpen ? 1.08 : 1.0);
    const speedHeadroom = clamp(1.22 - (vFwd / Math.max(4.5, maxCarSpeed)) * 0.48, 0.55, 1.22);
    // Low-gear mechanical torque on grass/gravel prevents stalling/beaching while deep grass drag caps top speed
    const gravelTraction = vFwd < 1.6 ? 0.72 : 0.34;
    const fEngine = throttle * engineTorque * speedHeadroom * (surface.onAsphalt ? 1.0 : gravelTraction);

    // Real F1 carbon-ceramic braking force (can pull ~4.5-5G on asphalt, weak on gravel)
    const maxBrakeForce = (0.24 + stats.grip * 0.95) * (surface.onAsphalt ? 1.0 : 0.48);
    const fBrake = brake * maxBrakeForce * (vFwd > 0.05 ? 1 : 0);

    // Aerodynamic Drag (quadratic with velocity) + Surface Rolling Resistance + Structural Damage Drag
    const aeroDragCoeff =
      (drsOpen ? 0.0012 : slipstreamActive ? 0.00105 : 0.00155) *
      (surface.onAsphalt ? 1.0 : 1.5) *
      aeroDragPenalty;
    const fDrag = aeroDragCoeff * vFwd * Math.abs(vFwd) + 0.0065 * surfaceDragMult * vFwd;

    // Aerodynamic Ground-Effect Downforce: Normal load increases smoothly with speed^2 (scaled by wing integrity)!
    const downforce =
      0.90 + 0.0068 * vFwd * vFwd * (surface.onAsphalt ? 1.0 : 0.35) * aeroDownforceHealth;
    const totalNormalLoad = MASS * downforce;

    // Dynamic Longitudinal Weight Transfer (braking loads front tires; acceleration loads rear tires)
    const approxLongA = clamp(fEngine - fBrake - fDrag, -0.35, 0.28);
    const weightShift = clamp(approxLongA * 0.32, -0.12, 0.12);
    const normalFront = totalNormalLoad * (0.47 - weightShift);
    const normalRear = totalNormalLoad * (0.53 + weightShift);

    // Front & Rear Tire Slip Angles (Bicycle Rigid-Body Model)
    const safeVx = Math.max(0.75, Math.abs(vFwd));
    const alphaFront = Math.atan2(vLat + L_FRONT * omega, safeVx) - steer;
    const alphaRear = Math.atan2(vLat - L_REAR * omega, safeVx);

    // Pacejka Simplified Magic Formula: F_y = -mu * N * sin(C * atan(B * alpha))
    // Peak lateral grip occurs near ~9-11° slip angle; pushing harder saturates & loses grip (true understeer/oversteer!)
    const B_front = 6.8;
    const B_rear = 7.4;
    const C_shape = 1.45;

    const maxLatFront = baseMu * normalFront * 1.12;
    const maxLatRear = baseMu * normalRear * 1.18;

    // Friction Circle Coupling: Heavy braking reduces available front lateral grip; heavy throttle reduces rear grip
    const frontLongUsage = clamp(fBrake / Math.max(0.08, maxLatFront * 4.2), 0, 0.68);
    const rearLongUsage = clamp((fEngine * 0.9 + fBrake * 0.3) / Math.max(0.08, maxLatRear * 4.2), 0, 0.70);

    const availLatFront = maxLatFront * Math.sqrt(Math.max(0.24, 1 - frontLongUsage * frontLongUsage));
    const availLatRear = maxLatRear * Math.sqrt(Math.max(0.24, 1 - rearLongUsage * rearLongUsage));

    const fLatFront = -availLatFront * Math.sin(C_shape * Math.atan(B_front * alphaFront));
    const fLatRear = -availLatRear * Math.sin(C_shape * Math.atan(B_rear * alphaRear));

    // Track tire slip saturation for smoke, skidmarks, scrub drag, and HUD warnings
    const slipSat = Math.max(Math.abs(alphaFront), Math.abs(alphaRear)) / 0.20;
    if (slipSat > maxSlipRatio) maxSlipRatio = slipSat;

    // Tire scrub induced drag when violently understeering/sliding (real kinetic energy dissipation into smoke & heat!)
    const scrubDrag =
      slipSat > 0.96 ? 0.036 * Math.min(3.5, slipSat - 0.96) * vFwd : 0;

    // Track Banking Gravity Assist: real banked corners incline the normal vector inward, supporting higher cornering G
    const bankGravityMag = surface.onAsphalt ? Math.sin(surface.bankAngleRad) * 0.068 : 0;
    const bankInwardLat =
      bankGravityMag !== 0
        ? (-surface.inwardNormal.x * sinY + surface.inwardNormal.y * cosY) * Math.abs(bankGravityMag)
        : 0;

    // Equations of Motion in Car Local Frame (Newton-Euler Rigid Body!)
    // Includes exact rotating-frame Coriolis/centripetal coupling (+ vLat * omega and - vFwd * omega)
    const fLongTotal = fEngine - fBrake - fDrag - scrubDrag - fLatFront * Math.sin(steer);
    const fLatTotal = fLatRear + fLatFront * Math.cos(steer) + bankInwardLat * MASS;

    const aFwd = fLongTotal / MASS + vLat * omega;
    const aLat = fLatTotal / MASS - vFwd * omega;

    // Torque around Z-axis (Yaw Moment) + subtle aerodynamic yaw damping
    const yawTorque = L_FRONT * fLatFront * Math.cos(steer) - L_REAR * fLatRear;
    const yawDamping = -omega * (0.34 + speed * 0.055);
    const alphaYaw = (yawTorque + yawDamping) / INERTIA_Z;

    // Semi-Implicit Euler Integration
    vFwd = Math.max(0, vFwd + aFwd * subDt);
    vLat = vLat + aLat * subDt;

    // Static friction stabilization at near-zero speeds (prevents micro-jitter on standing start grid)
    if (vFwd < 0.35) {
      vLat *= Math.pow(0.60, subDt);
      omega *= Math.pow(0.65, subDt);
    }

    omega = clamp(omega + alphaYaw * subDt, -0.15, 0.15);
    yaw = normalizeAngle(yaw + omega * subDt);

    // Transform updated local velocity back to World Space
    const newCos = Math.cos(yaw);
    const newSin = Math.sin(yaw);
    vx = vFwd * newCos - vLat * newSin;
    vy = vFwd * newSin + vLat * newCos;

    // Advance World Position
    x += vx * subDt;
    y += vy * subDt;

    // 5B. Sub-stepped Hard Outer & Inner Guardrail ("Quitamiedos") Containment with Oriented Car Hull!
    // Running inside every substep prevents high-speed tunneling and ensures nosecone/sidepods hit flush at the visible 3D barrier face.
    const subSurf = getTrackSurfaceInfo({ x, y }, track, segIdx);
    segIdx = subSurf.segmentIdx;
    const toTrackX = subSurf.inwardNormal.x;
    const toTrackY = subSurf.inwardNormal.y;
    const awayX = -toTrackX;
    const awayY = -toTrackY;

    // Oriented car footprint projection along the barrier outward normal
    const hullExtentAlongBarrierNormal =
      Math.abs(newCos * awayX + newSin * awayY) * CAR_HALF_LENGTH +
      Math.abs(-newSin * awayX + newCos * awayY) * CAR_HALF_WIDTH;

    const wallDistFromCenter =
      subSurf.signedLateralDist >= 0
        ? subSurf.outerBarrierDistFromCenter
        : subSurf.innerBarrierDistFromCenter;
    const maxAllowedCenterDist = Math.max(
      subSurf.halfWidth + 2.2,
      wallDistFromCenter - hullExtentAlongBarrierNormal
    );

    if (subSurf.distFromCenter > maxAllowedCenterDist) {
      const pushBack = subSurf.distFromCenter - maxAllowedCenterDist;
      x += toTrackX * (pushBack + 0.08);
      y += toTrackY * (pushBack + 0.08);

      const preWallSpeed = Math.hypot(vx, vy);
      const vAway = vx * awayX + vy * awayY;
      const wallTanX = -awayY;
      const wallTanY = awayX;
      const vTan = vx * wallTanX + vy * wallTanY;

      if (vAway > 0) {
        // Real FIA Tecpro foam & galvanized Armco steel barrier: absorbs normal energy with low restitution
        const tecproRestitution = vAway > 0.75 ? 0.16 : 0.10;
        vx -= awayX * vAway * (1.0 + tecproRestitution);
        vy -= awayY * vAway * (1.0 + tecproRestitution);

        const wallSpeed = Math.hypot(vx, vy);
        // Coulomb wall-scraping friction: grinding against Armco steel & Tecpro foam violently scrubs high speed & throws sparks
        const wallFriction = vAway > 0.26 ? 0.68 : wallSpeed > 1.4 ? 0.36 : 0.12;
        const tanScrub = clamp(
          vAway * wallFriction + (wallSpeed > 1.4 ? Math.abs(vTan) * 0.20 : 0),
          0,
          Math.abs(vTan) * 0.72
        );
        vx -= wallTanX * Math.sign(vTan) * tanScrub;
        vy -= wallTanY * Math.sign(vTan) * tanScrub;

        if (vAway > 0.28) {
          const speedLoss = clamp(0.62 - vAway * 0.12, 0.24, 0.56);
          vx *= speedLoss;
          vy *= speedLoss;
          if (preWallSpeed > 0.38) hitBarrier = true;
        } else if (wallSpeed > 1.35) {
          vx *= 0.78;
          vy *= 0.78;
          if (Math.abs(vTan) > 1.0) {
            hitBarrier = true;
          }
        } else {
          vx *= 0.94;
          vy *= 0.94;
        }

        // Rigid-body lever-arm yaw alignment torque: swings the nose parallel to the guardrail so it cannot wedge through
        const noseIntoWall = newCos * awayX + newSin * awayY;
        const crossWall = newCos * awayY - newSin * awayX;
        if (noseIntoWall > 0.10) {
          const deflectDir = crossWall >= 0 ? -1 : 1;
          const yawAlignScale = wallSpeed < 1.8 ? 0.11 : 0.045;
          yaw = normalizeAngle(yaw + deflectDir * yawAlignScale * noseIntoWall);
          omega = clamp(omega + deflectDir * Math.max(0.25, vAway) * 0.028 * noseIntoWall, -0.14, 0.14);
        } else {
          omega *= 0.45;
        }

        const impactEnergy = vAway + Math.abs(vTan) * (vAway > 0.24 ? 0.24 : 0.12);
        if (
          preWallSpeed > 0.38 &&
          (vAway > 0.20 || impactEnergy > 0.50 || (wallSpeed > 1.35 && Math.abs(vTan) > 1.0))
        ) {
          const rawSev = clamp((impactEnergy - 0.14) / 2.2, 0.10, 1.0);
          stepImpactSeverity = Math.max(stepImpactSeverity, rawSev);
          hitBarrier = true;
          car.x = x;
          car.y = y;
          car.angle = yaw;
          stepImpactZone = applyLocalizedChassisDent(car, toTrackX, toTrackY, rawSev);
        }
      } else {
        // Pressed statically into the barrier at low recovery speed: smoothly pivot nose back toward the track centerline
        const noseIntoWall = newCos * awayX + newSin * awayY;
        if (noseIntoWall > 0.15) {
          const crossWall = newCos * awayY - newSin * awayX;
          const deflectDir = crossWall >= 0 ? -1 : 1;
          yaw = normalizeAngle(yaw + deflectDir * 0.09 * noseIntoWall);
        }
      }
    }

    // 5C. Sub-stepped Hard 3D Trackside Physical Obstacles (FIA Tire Stacks, Gantry & Monaco Tunnel Pillars)
    const curCos = Math.cos(yaw);
    const curSin = Math.sin(yaw);
    for (let o = 0; o < trackObstacles.length; o++) {
      const obs = trackObstacles[o];
      const dxObs = x - obs.x;
      if (dxObs > 11.5 || dxObs < -11.5) continue;
      const dyObs = y - obs.y;
      if (dyObs > 11.5 || dyObs < -11.5) continue;

      const distObs = Math.hypot(dxObs, dyObs);
      if (distObs < 0.001) continue;
      const nxObs = dxObs / distObs;
      const nyObs = dyObs / distObs;

      const obsHullExtent =
        Math.abs(curCos * nxObs + curSin * nyObs) * (CAR_HALF_LENGTH * 0.88) +
        Math.abs(-curSin * nxObs + curCos * nyObs) * CAR_HALF_WIDTH;
      const minSep = obs.radius + obsHullExtent;

      if (distObs < minSep) {
        const overlapObs = minSep - distObs + 0.08;
        x += nxObs * overlapObs;
        y += nyObs * overlapObs;

        const preObsSpeed = Math.hypot(vx, vy);
        const vInto = -(vx * nxObs + vy * nyObs);
        if (vInto > 0) {
          const obsRestitution = obs.kind === 'tire_stack' ? 0.14 : 0.26;
          vx += nxObs * vInto * (1.0 + obsRestitution);
          vy += nyObs * vInto * (1.0 + obsRestitution);

          const obsTanX = -nyObs;
          const obsTanY = nxObs;
          const vObsTan = vx * obsTanX + vy * obsTanY;
          const obsFriction = obs.kind === 'tire_stack' ? 0.45 : 0.30;
          const scrubObs = clamp(vInto * obsFriction, 0, Math.abs(vObsTan) * 0.55);
          vx -= obsTanX * Math.sign(vObsTan) * scrubObs;
          vy -= obsTanY * Math.sign(vObsTan) * scrubObs;

          const speedDamp = obs.kind === 'tire_stack' ? 0.58 : 0.70;
          if (vInto > 0.20) {
            vx *= speedDamp;
            vy *= speedDamp;
          }

          const crossObs = curCos * nyObs - curSin * nxObs;
          omega = clamp(omega + crossObs * Math.max(0.25, vInto) * 0.036, -0.14, 0.14);

          if (vInto > 0.16 && preObsSpeed > 0.35) {
            const rawObsSev = clamp(vInto / 2.2, 0.10, 1.0);
            stepImpactSeverity = Math.max(stepImpactSeverity, rawObsSev);
            hitBarrier = true;
            car.x = x;
            car.y = y;
            car.angle = yaw;
            stepImpactZone = applyLocalizedChassisDent(car, nxObs, nyObs, rawObsSev);
          }
        }

        // Prevent front wing from wedging statically head-on against a tire-stack or pillar cylinder
        // Only apply when genuinely stalled after crash shock cooldown so high-speed crashes never get free recovery assist
        const postObsSpeed = Math.hypot(vx, vy);
        const noseIntoObs = -(curCos * nxObs + curSin * nyObs);
        if (postObsSpeed < 0.42 && car.bounceCooldown <= 0 && noseIntoObs > 0.20) {
          const crossToTrack = curCos * toTrackY - curSin * toTrackX;
          const deflectObs = crossToTrack >= 0 ? 1 : -1;
          yaw = normalizeAngle(yaw + deflectObs * 0.14 * noseIntoObs);
        }
      }
    }

    // World canvas perimeter guard (outer stadium retaining walls)
    if (x < 14 || x > track.width - 14) {
      const normalIntoCarX = x < 14 ? 1 : -1;
      const impactV = Math.abs(vx);
      x = clamp(x, 14, track.width - 14);
      vx *= -0.22;
      vy *= 0.76;
      hitBarrier = true;
      stepImpactSeverity = Math.max(stepImpactSeverity, clamp(impactV / 3.0, 0.15, 1.0));
      car.x = x;
      car.y = y;
      car.angle = yaw;
      stepImpactZone = applyLocalizedChassisDent(car, normalIntoCarX, 0, stepImpactSeverity);
    }
    if (y < 14 || y > track.height - 14) {
      const normalIntoCarY = y < 14 ? 1 : -1;
      const impactV = Math.abs(vy);
      y = clamp(y, 14, track.height - 14);
      vy *= -0.22;
      vx *= 0.76;
      hitBarrier = true;
      stepImpactSeverity = Math.max(stepImpactSeverity, clamp(impactV / 3.0, 0.15, 1.0));
      car.x = x;
      car.y = y;
      car.angle = yaw;
      stepImpactZone = applyLocalizedChassisDent(car, 0, normalIntoCarY, stepImpactSeverity);
    }

    lastLongAccel = fLongTotal / MASS;
    lastLatAccel = fLatTotal / MASS;
    lastThrottle = throttle;
    lastBrake = brake;
  }

  // 6. Post-step surface state & progressive segment commit
  const postSurf = getTrackSurfaceInfo({ x, y }, track, segIdx);
  car.trackSegmentIdx = postSurf.segmentIdx;

  // 7. Commit updated physical state back to RaceCarState
  car.x = x;
  car.y = y;
  car.vx = vx;
  car.vy = vy;
  car.angle = yaw;
  car.angularVelocity = omega;
  car.steerAngle = steer;

  const newSpeed = Math.hypot(vx, vy);
  const velAngle = newSpeed > 0.25 ? Math.atan2(vy, vx) : yaw;
  const trueSlipAngle = newSpeed > 0.35 ? normalizeAngle(velAngle - yaw) : 0;

  car.slipAngle = trueSlipAngle;
  car.driftAngle = clamp(-trueSlipAngle * 1.15, -0.52, 0.52);

  // Convert real local accelerations into realistic Formula 1 G-forces for HUD, Telemetry & Suspension Pitch/Roll
  // Spike longitudinal/lateral G transiently on barrier impact for violent suspension compression!
  const impactGSpike = stepImpactSeverity > 0.1 ? -stepImpactSeverity * 3.8 : 0;
  car.longitudinalG = clamp(lastLongAccel * 18.0 + impactGSpike, -5.2, 2.6);
  car.lateralG = clamp(lastLatAccel * 38.0, -4.8, 4.8);
  car.throttle = lastThrottle;
  car.brake = lastBrake;

  const isDrifting =
    (Math.abs(trueSlipAngle) > 0.11 && newSpeed > 1.8) ||
    (maxSlipRatio > 0.92 && newSpeed > 2.2);
  car.isDrifting = isDrifting;

  const isOverspeedWide =
    (maxSlipRatio > 1.18 && isCornerZone && newSpeed > 2.4) ||
    (!postSurf.onAsphalt && newSpeed > 2.2);

  if (isOverspeedWide) {
    car.overspeedTimer = Math.max(car.overspeedTimer || 0, 14);
  } else if ((car.overspeedTimer || 0) > 0) {
    car.overspeedTimer = Math.max(0, (car.overspeedTimer || 0) - dtFactor);
  }

  if (hitBarrier) {
    car.bounceCooldown = Math.max(car.bounceCooldown, 52);
  } else if (car.bounceCooldown > 0) {
    car.bounceCooldown = Math.max(0, car.bounceCooldown - dtFactor);
  }

  // Update Pirelli Tire Health, Thermal Core Temperature, Sequential 8-Speed Gearbox & Hybrid ERS Battery
  const wearRateMult =
    activeStrategy === 'conserve' ? 0.45 : activeStrategy === 'attack' ? 1.35 : 1.0;
  const frameTireWear =
    (car.offTrack ? 0.040 : isOverspeedWide ? 0.028 : isDrifting ? 0.013 : 0.003) *
    wearRateMult *
    dtFactor;
  car.tireHealth = Math.max(45, currentTireHealth - frameTireWear);

  // Thermal tire equilibrium: lateral G + sliding heats compound; clean straights cool toward ambient airflow (~84°C)
  const thermalLoad =
    Math.abs(car.lateralG) * 0.16 +
    (isDrifting ? 0.55 : 0) +
    (isOverspeedWide ? 0.45 : 0) +
    (lastBrake > 0.3 ? 0.18 : 0);
  const ambientCool = (currentTireTemp - 82) * 0.014;
  car.tireTemp = clamp(currentTireTemp + (thermalLoad - ambientCool) * dtFactor, 74, 128);

  // 8-Speed Sequential F1 Gearbox + Upshift Torque Kick Pulse (drives chassis micro-pitch & exhaust overrun pop)
  const prevGear = car.gear ?? 1;
  const speedRatio = clamp(newSpeed / Math.max(4.8, stats.maxSpeed * 1.04), 0, 1);
  const nextGear = clamp(Math.floor(speedRatio * 7.65) + 1, 1, 8);
  car.gear = nextGear;
  const prevKick = car.shiftKick ?? 0;
  if (nextGear > prevGear && lastThrottle > 0.55 && newSpeed > 1.8) {
    car.shiftKick = 1.0;
  } else {
    car.shiftKick = Math.max(0, prevKick - 0.14 * dtFactor);
  }
  car.onCurb = postSurf.onCurbOrGrass;

  const isBraking = lastBrake > 0.18 && newSpeed > 1.4;
  if (ersBoostActive) {
    car.ersBattery = Math.max(0, currentErs - 0.105 * dtFactor);
  } else if (isBraking || activeStrategy === 'conserve') {
    const regenRate = activeStrategy === 'conserve' ? 0.18 : 0.13;
    car.ersBattery = Math.min(100, currentErs + regenRate * dtFactor);
  }

  return {
    newSpeed,
    isDrifting,
    isBraking,
    isOverspeedWide,
    slipstreamActive,
    onCurbOrGrass: postSurf.onCurbOrGrass,
    surfaceElevationZ: postSurf.elevationZ,
    centrifugalForce: Math.abs(car.lateralG) / 2.2,
    distFromCenter: postSurf.distFromCenter,
    hitBarrier,
    impactSeverity: stepImpactSeverity,
    impactZone: stepImpactZone
  };
}

/**
 * Momentum-conserving 2D Elastic Rigid-Body Car-to-Car Collision Resolution with Localized 3D Chassis Denting.
 * Replaces artificial position teleports with realistic impulse exchange, yaw deflection, and carbon panel deformation.
 */
export function resolveCarCollisions(
  cars: RaceCarState[],
  onSpark?: (x: number, y: number, severity?: number) => void,
  track?: Track
): void {
  const minDist = 13.0;
  const restitution = 0.28; // F1 carbon chassis/tires absorb most energy without ping-ponging

  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (a.finished || a.disqualified) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (b.finished || b.disqualified) continue;

      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);

      if (dist < minDist && dist > 0.001) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = (minDist - dist) * 0.52;

        // 1. Positional separation so meshes never interpenetrate
        a.x += nx * overlap;
        a.y += ny * overlap;
        b.x -= nx * overlap;
        b.y -= ny * overlap;

        // 2. Relative velocity along collision normal
        const rvx = a.vx - b.vx;
        const rvy = a.vy - b.vy;
        const velAlongNormal = rvx * nx + rvy * ny;

        if (velAlongNormal < 0) {
          // Equal mass normal impulse: J = -(1 + e) * vn / 2
          const jImpulse = (-(1 + restitution) * velAlongNormal) * 0.5;
          a.vx += jImpulse * nx;
          a.vy += jImpulse * ny;
          b.vx -= jImpulse * nx;
          b.vy -= jImpulse * ny;

          // Coulomb tangential rubbing friction impulse (wheel-to-wheel scrub slows relative slide realistically)
          const tx = -ny;
          const ty = nx;
          const velAlongTangent = rvx * tx + rvy * ty;
          const frictionCoeff = 0.24;
          const jtRaw = -velAlongTangent * 0.5;
          const maxJt = jImpulse * frictionCoeff;
          const jt = clamp(jtRaw, -maxJt, maxJt);
          a.vx += jt * tx;
          a.vy += jt * ty;
          b.vx -= jt * tx;
          b.vy -= jt * ty;

          // Physical yaw torque exchange from normal impact + sidepod rubbing friction
          const crossA = Math.cos(a.angle) * ny - Math.sin(a.angle) * nx;
          const crossB = Math.cos(b.angle) * -ny - Math.sin(b.angle) * -nx;
          const rubYaw = clamp(jt * 0.045, -0.04, 0.04);
          a.angularVelocity = clamp((a.angularVelocity ?? 0) + crossA * jImpulse * 0.045 + rubYaw, -0.14, 0.14);
          b.angularVelocity = clamp((b.angularVelocity ?? 0) + crossB * jImpulse * 0.045 - rubYaw, -0.14, 0.14);

          // 3. Apply localized 3D bodywork denting to BOTH colliding cars based on impact vector & impulse!
          const impactSev = clamp((Math.abs(velAlongNormal) + Math.abs(velAlongTangent) * 0.35) / 2.8, 0.08, 1.0);
          // For car A, normal pointing FROM car B INTO car A is (nx, ny)
          applyLocalizedChassisDent(a, nx, ny, impactSev);
          // For car B, normal pointing FROM car A INTO car B is (-nx, -ny)
          applyLocalizedChassisDent(b, -nx, -ny, impactSev);

          if (onSpark && (Math.abs(velAlongNormal) > 0.28 || Math.abs(velAlongTangent) > 0.75)) {
            onSpark((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, impactSev);
          }
        }

        // 4. Keep both separated cars strictly inside the track guardrails so a car-to-car shove never pushes a car through a wall
        if (track) {
          for (const c of [a, b]) {
            const cSurf = getTrackSurfaceInfo({ x: c.x, y: c.y }, track, c.trackSegmentIdx);
            const cAwayX = -cSurf.inwardNormal.x;
            const cAwayY = -cSurf.inwardNormal.y;
            const cHull =
              Math.abs(Math.cos(c.angle) * cAwayX + Math.sin(c.angle) * cAwayY) * CAR_HALF_LENGTH +
              Math.abs(-Math.sin(c.angle) * cAwayX + Math.cos(c.angle) * cAwayY) * CAR_HALF_WIDTH;
            const cWall =
              cSurf.signedLateralDist >= 0
                ? cSurf.outerBarrierDistFromCenter
                : cSurf.innerBarrierDistFromCenter;
            const cMax = Math.max(cSurf.halfWidth + 2.2, cWall - cHull);
            if (cSurf.distFromCenter > cMax) {
              const back = cSurf.distFromCenter - cMax + 0.08;
              c.x += cSurf.inwardNormal.x * back;
              c.y += cSurf.inwardNormal.y * back;
            }
          }
        }
      }
    }
  }
}

function inferStatsFromGrip(carGrip: number): CarStats {
  if (carGrip <= 0.055) {
    return {
      name: 'Rayo Veloz',
      color: '#ef4444',
      maxSpeed: 8.6,
      acceleration: 0.16,
      grip: carGrip,
      driftRecovery: 0.15,
      description: ''
    };
  }
  if (carGrip >= 0.095) {
    return {
      name: 'Derrape Pro',
      color: '#10b981',
      maxSpeed: 7.4,
      acceleration: 0.25,
      grip: carGrip,
      driftRecovery: 0.75,
      description: ''
    };
  }
  return {
    name: 'Grip F1',
    color: '#0ea5e9',
    maxSpeed: 8.1,
    acceleration: 0.2,
    grip: carGrip,
    driftRecovery: 0.45,
    description: ''
  };
}

// Register exact Newtonian rigid-body evaluator so getPerfectLapGuide proves & optimizes every corner in closed loop
registerPerfectLapPhysicsEvaluator((track, densePoints, speeds, carGrip, gridIdx) => {
  const rawPath: Point[] = densePoints.map((pt, i) => ({
    x: pt.x,
    y: pt.y,
    t: i * 16,
    speed: speeds[i]
  }));
  const path = resampleAndSmoothPath(rawPath, 5);
  const grid = track.startGrid[gridIdx] || track.startGrid[0];
  const stats = inferStatsFromGrip(carGrip);

  const car: RaceCarState = {
    playerId: 'perfect-lap-eval',
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

  let offTrackFrames = 0;
  let barrierHits = 0;
  let maxSpeed = 0;
  const badNodes: number[] = [];
  const latPeak = new Float32Array(densePoints.length);
  const maxFrames = 760;

  for (let frame = 0; frame < maxFrames; frame++) {
    const oldX = car.x;
    const oldY = car.y;
    const res = stepVehiclePhysics(car, path, stats, track, [car], 0, 'balanced', 1.0);
    const dNode = Math.min(
      densePoints.length - 1,
      Math.round((car.targetIndex / Math.max(1, path.length - 1)) * (densePoints.length - 1))
    );
    const surf = getTrackSurfaceInfo({ x: car.x, y: car.y }, track, car.trackSegmentIdx);
    const latRatio = surf.distFromCenter / Math.max(1, surf.halfWidth);
    if (latRatio > latPeak[dNode]) latPeak[dNode] = latRatio;

    if (car.offTrack || res.hitBarrier) {
      if (car.offTrack) offTrackFrames++;
      if (res.hitBarrier) barrierHits++;
      badNodes.push(dNode);
    }
    if (res.newSpeed > maxSpeed) maxSpeed = res.newSpeed;

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

    if (
      car.checkpointPassed >= track.checkpoints.length - 1 &&
      (checkSegmentCrossing({ x: oldX, y: oldY }, { x: car.x, y: car.y }, track.startLine) ||
        car.targetIndex >= path.length - 2)
    ) {
      return {
        finished: true,
        simSeconds: (frame * 16.667) / 1000,
        offTrackFrames,
        barrierHits,
        maxSpeed,
        badNodes,
        latPeak
      };
    }
  }

  return {
    finished: false,
    simSeconds: (maxFrames * 16.667) / 1000,
    offTrackFrames,
    barrierHits,
    maxSpeed,
    badNodes,
    latPeak
  };
});

