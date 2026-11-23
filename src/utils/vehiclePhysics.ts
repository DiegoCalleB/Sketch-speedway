import { CarStats, PaceStrategyMode, Point, RaceCarState, Track } from '../types';
import { getMaxSafeCornerSpeed, getTrackSurfaceInfo } from './tracks';

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
}

const WHEELBASE = 8.4; // Physical distance between front and rear F1 axles (world units)
const L_FRONT = WHEELBASE * 0.46; // Center of gravity slightly rear-biased like real F1 (46/54)
const L_REAR = WHEELBASE * 0.54;
const MASS = 1.0; // Normalized F1 car mass
const INERTIA_Z = 3.45; // Physical yaw moment of inertia (m * k^2) preventing impossible instant turns

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
 * Pure-Pursuit + Pacejka Friction-Circle Rigid-Body F1 Vehicle Physics Engine.
 * Enforces real Newtonian inertia, finite Ackermann steering geometry, rate-limited steering rack,
 * kinematic braking envelopes, aerodynamic ground-effect downforce (v^2), longitudinal weight transfer,
 * quadratic drag, realistic understeer/oversteer slip angles, anti-orbiting waypoint projection,
 * and physical barrier containment.
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

  // 3. Surface, Tire Degradation & Hybrid Strategy State
  const surface = getTrackSurfaceInfo({ x: car.x, y: car.y }, track);
  car.offTrack = !surface.onAsphalt;

  const currentErs = car.ersBattery ?? 100;
  const currentTireHealth = car.tireHealth ?? 100;
  const tireGripFactor = 0.84 + 0.16 * (currentTireHealth / 100);
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

  // Off-track grass/gravel heavily penalizes speed (no grass corner-cutting shortcuts!), while allowing smooth ~80-95 km/h recovery back to asphalt!
  const surfaceDragMult = surface.onAsphalt ? 1.0 : surface.onCurbOrGrass ? 2.5 : 8.5;
  // At low speeds (< 2.0), mechanical tire tread bite lets an off-track car steer cleanly back onto asphalt
  // At high speeds (> 2.8), grass/gravel grip drops to 0.34 so overspeeding still causes true understeer!
  const lowSpeedGrassBite = clamp(1 - (currentSpeed0 - 1.3) / 1.8, 0, 1);
  const offTrackMu = 0.34 + lowSpeedGrassBite * 0.44;
  const surfaceMu = surface.onAsphalt ? 1.0 : surface.onCurbOrGrass ? Math.max(0.68, offTrackMu) : offTrackMu;

  // Effective physical top speed given engine power, DRS, slipstream & ERS
  const maxCarSpeed =
    stats.maxSpeed *
    strategySpeedMult *
    apexMult *
    (slipstreamActive ? 1.10 : drsOpen ? 1.05 : 1.0);

  let targetSpeed = Math.min(
    desiredSpeed * strategySpeedMult * (slipstreamActive ? 1.11 : drsOpen ? 1.04 : 1.0),
    maxCarSpeed
  );

  // If currently off-track on deep grass/gravel, cap cruise speed realistically (~95 km/h) while keeping enough throttle to rejoin cleanly
  if (!surface.onAsphalt && !surface.onCurbOrGrass) {
    targetSpeed = clamp(targetSpeed, 1.9, 2.35);
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
      targetPt = path[cursorIdx];
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
    // When making a sharp >75° recovery turn at low speed, modulate speed cleanly so turning radius stays tight
    const effectiveTargetSpeed =
      localX < 0 && !surface.onAsphalt ? Math.min(targetSpeed, 1.9) : targetSpeed;
    const speedErr = effectiveTargetSpeed - vFwd;
    let throttle = 0;
    let brake = 0;
    if (speedErr > 0.06) {
      throttle = clamp(speedErr / 1.15, 0, 1);
    } else if (speedErr < -0.10) {
      brake = clamp(-speedErr / 1.25, 0, 1);
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

    // Aerodynamic Drag (quadratic with velocity) + Surface Rolling Resistance
    const aeroDragCoeff =
      (drsOpen ? 0.0012 : slipstreamActive ? 0.00105 : 0.00155) * (surface.onAsphalt ? 1.0 : 1.5);
    const fDrag = aeroDragCoeff * vFwd * Math.abs(vFwd) + 0.0065 * surfaceDragMult * vFwd;

    // Aerodynamic Ground-Effect Downforce: Normal load increases smoothly with speed^2!
    const downforce = 0.90 + 0.0068 * vFwd * vFwd * (surface.onAsphalt ? 1.0 : 0.35);
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

    // Tire scrub induced drag when violently understeering/sliding (energy dissipation!)
    const scrubDrag =
      slipSat > 0.95 ? 0.018 * Math.min(2.5, slipSat - 0.95) * vFwd : 0;

    // Equations of Motion in Car Local Frame (Newton-Euler Rigid Body!)
    // Includes exact rotating-frame Coriolis/centripetal coupling (+ vLat * omega and - vFwd * omega)
    const fLongTotal = fEngine - fBrake - fDrag - scrubDrag - fLatFront * Math.sin(steer);
    const fLatTotal = fLatRear + fLatFront * Math.cos(steer);

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

    // World canvas perimeter guard (safety walls)
    if (x < 14 || x > track.width - 14) {
      x = clamp(x, 14, track.width - 14);
      vx *= -0.28;
      vy *= 0.80;
      hitBarrier = true;
    }
    if (y < 14 || y > track.height - 14) {
      y = clamp(y, 14, track.height - 14);
      vy *= -0.28;
      vx *= 0.80;
      hitBarrier = true;
    }

    lastLongAccel = fLongTotal / MASS;
    lastLatAccel = fLatTotal / MASS;
    lastThrottle = throttle;
    lastBrake = brake;
  }

  // 6. Runoff Tecpro safety barrier containment (uses inwardNormal so BOTH outer runoff AND inner infield push back TOWARD the track!)
  const postSurf = getTrackSurfaceInfo({ x, y }, track);
  const maxRunoffLimit = postSurf.halfWidth + 26;
  if (postSurf.distFromCenter > maxRunoffLimit) {
    const pushBack = postSurf.distFromCenter - maxRunoffLimit;
    const toTrackX = postSurf.inwardNormal.x;
    const toTrackY = postSurf.inwardNormal.y;
    const awayX = -toTrackX;
    const awayY = -toTrackY;

    // Push cleanly back inside the runoff boundary TOWARD the track centerline
    x += toTrackX * pushBack;
    y += toTrackY * pushBack;

    const vAway = vx * awayX + vy * awayY;
    if (vAway > 0) {
      vx -= awayX * vAway * 1.15;
      vy -= awayY * vAway * 1.15;
      // Only scrub heavy kinetic energy on genuine barrier impacts (>0.45); gentle grazing lets a car steer cleanly back onto asphalt!
      if (vAway > 0.45) {
        vx *= 0.58;
        vy *= 0.58;
        hitBarrier = true;
      } else {
        vx *= 0.90;
        vy *= 0.90;
      }
      // Glancing wall deflection: nose deflects slightly away from barrier normal so car never wedges nose-first
      const noseIntoWall = Math.cos(yaw) * awayX + Math.sin(yaw) * awayY;
      if (noseIntoWall > 0.22) {
        const crossWall = Math.cos(yaw) * awayY - Math.sin(yaw) * awayX;
        const deflectDir = crossWall >= 0 ? -1 : 1;
        yaw = normalizeAngle(yaw + deflectDir * 0.11 * noseIntoWall);
      }
      omega *= 0.42;
    }
  }

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
  car.longitudinalG = clamp(lastLongAccel * 18.0, -5.2, 2.6);
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

  if (hitBarrier && car.bounceCooldown <= 0) {
    car.bounceCooldown = 14;
  } else if (car.bounceCooldown > 0) {
    car.bounceCooldown = Math.max(0, car.bounceCooldown - dtFactor);
  }

  // Update Pirelli Tire Health & Hybrid ERS MGU-K Battery
  const wearRateMult =
    activeStrategy === 'conserve' ? 0.45 : activeStrategy === 'attack' ? 1.35 : 1.0;
  const frameTireWear =
    (car.offTrack ? 0.040 : isOverspeedWide ? 0.028 : isDrifting ? 0.013 : 0.003) *
    wearRateMult *
    dtFactor;
  car.tireHealth = Math.max(45, currentTireHealth - frameTireWear);

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
    hitBarrier
  };
}

/**
 * Momentum-conserving 2D Elastic Rigid-Body Car-to-Car Collision Resolution.
 * Replaces artificial position teleports with realistic impulse exchange and yaw deflection.
 */
export function resolveCarCollisions(
  cars: RaceCarState[],
  onSpark?: (x: number, y: number) => void
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
          // Equal mass impulse: J = -(1 + e) * vn / 2
          const jImpulse = (-(1 + restitution) * velAlongNormal) * 0.5;
          a.vx += jImpulse * nx;
          a.vy += jImpulse * ny;
          b.vx -= jImpulse * nx;
          b.vy -= jImpulse * ny;

          // Subtle physical yaw bump from side-pod contact
          const crossA = Math.cos(a.angle) * ny - Math.sin(a.angle) * nx;
          const crossB = Math.cos(b.angle) * -ny - Math.sin(b.angle) * -nx;
          a.angularVelocity = clamp((a.angularVelocity ?? 0) + crossA * jImpulse * 0.04, -0.14, 0.14);
          b.angularVelocity = clamp((b.angularVelocity ?? 0) + crossB * jImpulse * 0.04, -0.14, 0.14);

          if (onSpark && Math.abs(velAlongNormal) > 0.4) {
            onSpark((a.x + b.x) * 0.5, (a.y + b.y) * 0.5);
          }
        }
      }
    }
  }
}
