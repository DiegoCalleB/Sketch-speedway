import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GamePhase, RaceCarState, Track } from '../../types';
import { getTrackSurfaceInfo } from '../../utils/tracks';

export type RaceCameraMode = 'helicopter' | 'chase' | 'onboard' | 'circuit';

interface CameraDirectorProps {
  phase: GamePhase;
  activeCar?: RaceCarState;
  allCars?: RaceCarState[];
  carsStateRef?: React.MutableRefObject<RaceCarState[]>;
  focusedPlayerId?: string | null;
  activePlayerGrid?: { x: number; y: number };
  activeDrawingTip?: { x: number; y: number } | null;
  track: Track;
  cameraMode?: RaceCameraMode;
  isPortrait?: boolean;
  countdownValue?: string | null;
}

const _desiredPos = new THREE.Vector3(400, 250, 536);
const _desiredLookAt = new THREE.Vector3(400, 250, 0);
const _desiredUp = new THREE.Vector3(0, 1, 0);
const _testForward = new THREE.Vector3();
const _testRight = new THREE.Vector3();
const _testUp = new THREE.Vector3();
const _testToCar = new THREE.Vector3();

export const CameraDirector: React.FC<CameraDirectorProps> = ({
  phase,
  activeCar,
  allCars = [],
  carsStateRef,
  focusedPlayerId = null,
  track,
  cameraMode = 'helicopter',
  isPortrait = false,
  countdownValue = null
}) => {
  const shakeRef = useRef<number>(0);
  const prevBounceCooldown = useRef<number>(0);
  const smoothLongGRef = useRef<number>(0);
  const smoothLatGRef = useRef<number>(0);
  const currentLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3(400, 250, 0));
  const currentUpRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1, 0));
  const initializedPhaseRef = useRef<string>('');

  useFrame((state, delta) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const dt = Math.min(delta, 0.05);

    const upX = isPortrait ? -1 : 0;
    const upY = isPortrait ? 0 : 1;

    const baseFov = 50;
    const vFovRad = THREE.MathUtils.degToRad(baseFov);
    const tanHalfFov = Math.tan(vFovRad * 0.5);
    const aspect = state.size.width / Math.max(1, state.size.height);

    const worldSpanVertical = isPortrait ? track.width : track.height;
    const worldSpanHorizontal = isPortrait ? track.height : track.width;

    const zForHeight = (worldSpanVertical * 0.5) / tanHalfFov;
    const zForWidth = (worldSpanHorizontal * 0.5) / (tanHalfFov * aspect);
    const fullCircuitZ = Math.max(zForHeight, zForWidth) + 0.3;

    // 1. DRAWING PHASE: Exact overhead framing so SVG coordinates map 1:1 with 3D circuit
    if (phase === 'drawing') {
      if (Math.abs(camera.fov - 50) > 0.1) {
        camera.fov = 50;
        camera.updateProjectionMatrix();
      }
      camera.up.set(upX, upY, 0);
      currentUpRef.current.set(upX, upY, 0);
      camera.position.set(400, 250, fullCircuitZ);
      camera.lookAt(400, 250, 0.3);
      currentLookAtRef.current.set(400, 250, 0.3);
      initializedPhaseRef.current = `drawing-${isPortrait ? 'p' : 'l'}`;
      return;
    }

    // 2. RACING PHASE — Read live carsStateRef directly so Camera & Car3D are 100% phase-locked on the exact same frame
    const liveCars =
      carsStateRef?.current && carsStateRef.current.length > 0 ? carsStateRef.current : allCars;
    const focusTargetId = focusedPlayerId || activeCar?.playerId || null;
    let focusCar = focusTargetId
      ? liveCars.find((c) => c.playerId === focusTargetId)
      : activeCar;
    if (!focusCar || focusCar.finished || focusCar.disqualified) {
      const racingCars = liveCars.filter((c) => !c.finished && !c.disqualified);
      if (racingCars.length > 0) {
        focusCar = racingCars[0];
      }
    }

    const focusSpeed = focusCar ? Math.hypot(focusCar.vx, focusCar.vy) : 0;

    if (focusCar) {
      if (focusCar.bounceCooldown >= 8 && prevBounceCooldown.current < 8) {
        const impactSev = Math.max(0.28, focusCar.lastImpactSeverity ?? 0.55);
        shakeRef.current = Math.max(shakeRef.current, 1.8 + impactSev * 3.8);
      }
      prevBounceCooldown.current = focusCar.bounceCooldown;

      if (focusCar.offTrack && focusSpeed > 1.2) {
        shakeRef.current = Math.max(shakeRef.current, 0.9);
      } else if (focusCar.onCurb && focusSpeed > 1.4) {
        shakeRef.current = Math.max(shakeRef.current, Math.min(0.62, 0.24 + focusSpeed * 0.06));
      } else if (focusCar.isDrifting) {
        shakeRef.current = Math.max(shakeRef.current, 0.35);
      } else if (cameraMode === 'onboard' && focusSpeed > 5.2) {
        shakeRef.current = Math.max(shakeRef.current, 0.12);
      }
      smoothLongGRef.current = THREE.MathUtils.damp(
        smoothLongGRef.current,
        focusCar.longitudinalG ?? 0,
        8.0,
        dt
      );
      smoothLatGRef.current = THREE.MathUtils.damp(
        smoothLatGRef.current,
        focusCar.lateralG ?? 0,
        7.5,
        dt
      );
    }

    shakeRef.current = THREE.MathUtils.damp(shakeRef.current, 0, 10, dt);
    if (shakeRef.current < 0.02) shakeRef.current = 0;

    // 2A. CINEMATIC STARTING GRID COUNTDOWN SHOT (3... 2... 1...)
    const isPreLaunchCountdown =
      countdownValue !== null && countdownValue !== '¡YA!' && focusCar && focusSpeed < 0.25;

    let targetFov = 50;
    if (isPreLaunchCountdown) {
      targetFov = 46;
    } else if (cameraMode === 'onboard') {
      targetFov = 56 + THREE.MathUtils.clamp((focusSpeed - 2.0) * 2.2, 0, 12);
    } else if (cameraMode === 'chase') {
      targetFov = 50 + THREE.MathUtils.clamp((focusSpeed - 2.2) * 1.8, 0, 10);
    } else if (cameraMode === 'helicopter') {
      targetFov = 48;
    }

    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 6, dt);
      camera.updateProjectionMatrix();
    }

    if (isPreLaunchCountdown && focusCar) {
      const carSurf = getTrackSurfaceInfo({ x: focusCar.x, y: focusCar.y }, track);
      const yaw = -focusCar.angle;
      const fwdX = Math.cos(yaw);
      const fwdY = Math.sin(yaw);
      const sideX = -fwdY;
      const sideY = fwdX;
      const carWorldX = focusCar.x;
      const carWorldY = 500 - focusCar.y;
      const carWorldZ = carSurf.elevationZ + 0.15;

      // Frame ALL starting grid cars cleanly behind the pack looking toward the 5 red FIA gantry lights
      _desiredPos.set(
        carWorldX - fwdX * 34 + sideX * 10,
        carWorldY - fwdY * 34 + sideY * 10,
        carWorldZ + 11.5
      );
      _desiredLookAt.set(
        carWorldX + fwdX * 36,
        carWorldY + fwdY * 36,
        carWorldZ + 6.5
      );
      _desiredUp.set(0, 0, 1);
    } else if (cameraMode === 'onboard' && focusCar) {
      const carSurf = getTrackSurfaceInfo({ x: focusCar.x, y: focusCar.y }, track);
      const yaw = -focusCar.angle;
      const fwdX = Math.cos(yaw);
      const fwdY = Math.sin(yaw);
      const sideX = -fwdY;
      const sideY = fwdX;
      const carWorldX = focusCar.x;
      const carWorldY = 500 - focusCar.y;
      const carWorldZ = carSurf.elevationZ + 0.15;

      // Subtle G-force helmet inertia & apex look-ahead in T-Cam Onboard
      const longOffset = THREE.MathUtils.clamp(-smoothLongGRef.current * 0.16, -0.35, 0.45);
      const apexLook = THREE.MathUtils.clamp(-smoothLatGRef.current * 1.4, -4.5, 4.5);
      const pitchDip = THREE.MathUtils.clamp(smoothLongGRef.current * 0.08, -0.32, 0.18);

      _desiredPos.set(
        carWorldX - fwdX * (1.6 - longOffset),
        carWorldY - fwdY * (1.6 - longOffset),
        carWorldZ + 4.35 + pitchDip * 0.4
      );
      _desiredLookAt.set(
        carWorldX + fwdX * 52 + sideX * apexLook,
        carWorldY + fwdY * 52 + sideY * apexLook,
        carWorldZ + 1.85 + pitchDip
      );
      _desiredUp.set(sideX * THREE.MathUtils.clamp(smoothLatGRef.current * 0.012, -0.045, 0.045), sideY * THREE.MathUtils.clamp(smoothLatGRef.current * 0.012, -0.045, 0.045), 1).normalize();
    } else if (cameraMode === 'chase' && focusCar) {
      const carSurf = getTrackSurfaceInfo({ x: focusCar.x, y: focusCar.y }, track);
      const yaw = -focusCar.angle - (focusCar.slipAngle ?? 0) * 0.45;
      const fwdX = Math.cos(yaw);
      const fwdY = Math.sin(yaw);
      const sideX = -fwdY;
      const sideY = fwdX;
      const carWorldX = focusCar.x;
      const carWorldY = 500 - focusCar.y;
      const carWorldZ = carSurf.elevationZ + 0.15;

      // Dynamic G-force spring-back: pulls back slightly under hard acceleration/DRS, leans closer under 5G braking
      const gTrailLag = THREE.MathUtils.clamp(smoothLongGRef.current * 1.15, -2.4, 2.8);
      const latSwing = THREE.MathUtils.clamp(-smoothLatGRef.current * 0.72, -3.2, 3.2);
      const trailDist = 21.8 + focusSpeed * 1.32 + gTrailLag;
      _desiredPos.set(
        carWorldX - fwdX * trailDist + sideX * latSwing,
        carWorldY - fwdY * trailDist + sideY * latSwing,
        carWorldZ + 8.7 + focusSpeed * 0.28
      );
      _desiredLookAt.set(
        carWorldX + fwdX * 34 - sideX * latSwing * 0.65,
        carWorldY + fwdY * 34 - sideY * latSwing * 0.65,
        carWorldZ + 2.35
      );
      _desiredUp.set(0, 0, 1);
    } else if (cameraMode === 'circuit') {
      _desiredUp.set(upX, upY, 0);
      _desiredLookAt.set(400, 250, 0);
      _desiredPos.set(
        400 - upX * (fullCircuitZ * 0.16),
        250 - upY * (fullCircuitZ * 0.16),
        fullCircuitZ * 0.94
      );
    } else {
      // 'helicopter' (Default TV Dinámica):
      // Exact Multi-Car Bounding-Box + Frustum-Verified Framing!
      // Dynamically zooms IN for close wheel-to-wheel battles and smoothly zooms OUT so ALL racing cars ALWAYS stay visible inside safe HUD bounds!
      _desiredUp.set(upX, upY, 0);
      const activeRacers = liveCars.filter((c) => !c.disqualified);
      const carsToFrame =
        activeRacers.length > 0 ? activeRacers : focusCar ? [focusCar] : [];

      if (carsToFrame.length > 0) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        for (let i = 0; i < carsToFrame.length; i++) {
          const c = carsToFrame[i];
          const cx = c.x;
          const cy = 500 - c.y;
          // Include subtle velocity lead so cars never touch the leading screen edge
          const leadX = cx + c.vx * 5.0;
          const leadY = cy - c.vy * 5.0;

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (leadX < minX) minX = leadX;
          if (leadX > maxX) maxX = leadX;

          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          if (leadY < minY) minY = leadY;
          if (leadY > maxY) maxY = leadY;
        }

        const midX = (minX + maxX) * 0.5;
        const midY = (minY + maxY) * 0.5;
        const boxSpanX = Math.max(0, maxX - minX);
        const boxSpanY = Math.max(0, maxY - minY);

        // Generous world-space margin around the pack so cars + track curbs + HUD never clip cars off-screen
        const padAlongUp = isPortrait ? 135 : 95;
        const padAcross = isPortrait ? 95 : 120;

        const spanVertical = (isPortrait ? boxSpanX : boxSpanY) + padAlongUp * 2;
        const spanHorizontal = (isPortrait ? boxSpanY : boxSpanX) + padAcross * 2;

        const activeTanHalfFov = Math.tan(THREE.MathUtils.degToRad(targetFov) * 0.5);
        const safeAspect = Math.max(0.42, aspect);
        const reqDistV = (spanVertical * 0.5) / activeTanHalfFov;
        const reqDistH = (spanHorizontal * 0.5) / (activeTanHalfFov * safeAspect);

        const minCloseDist = isPortrait ? 195 : 165;
        const maxOverviewDist = fullCircuitZ * 1.14;
        let requiredDist = THREE.MathUtils.clamp(
          Math.max(minCloseDist, reqDistV, reqDistH),
          minCloseDist,
          maxOverviewDist
        );

        // Frustum-Verification Refinement (0 heap allocations): verifies EVERY active car stays inside safe HUD-free NDC bounds!
        for (let iter = 0; iter < 6; iter++) {
          const zoomOutRatio = THREE.MathUtils.clamp(
            (requiredDist - minCloseDist) / Math.max(1, maxOverviewDist - minCloseDist),
            0,
            1
          );
          const lookX = THREE.MathUtils.lerp(
            THREE.MathUtils.clamp(midX, 110, 690),
            400,
            zoomOutRatio * 0.65
          );
          const lookY = THREE.MathUtils.lerp(
            THREE.MathUtils.clamp(midY, 85, 415),
            250,
            zoomOutRatio * 0.65
          );
          _desiredLookAt.set(lookX, lookY, 1.0);

          const tiltRatio = THREE.MathUtils.lerp(0.46, 0.18, zoomOutRatio);
          const heightRatio = Math.sqrt(Math.max(0.55, 1 - tiltRatio * tiltRatio));
          _desiredPos.set(
            lookX - upX * (requiredDist * tiltRatio),
            lookY - upY * (requiredDist * tiltRatio),
            requiredDist * heightRatio
          );

          // Construct orthonormal candidate camera basis
          _testForward.subVectors(_desiredLookAt, _desiredPos).normalize();
          _testRight.crossVectors(_testForward, _desiredUp).normalize();
          _testUp.crossVectors(_testRight, _testForward).normalize();

          let allInside = true;
          for (let i = 0; i < carsToFrame.length; i++) {
            const c = carsToFrame[i];
            _testToCar.set(c.x - _desiredPos.x, 500 - c.y - _desiredPos.y, 1.8 - _desiredPos.z);
            const depth = _testToCar.dot(_testForward);
            if (depth <= 12) {
              allInside = false;
              break;
            }
            const ndcX = _testToCar.dot(_testRight) / (depth * activeTanHalfFov * safeAspect);
            const ndcY = _testToCar.dot(_testUp) / (depth * activeTanHalfFov);
            // Leave extra top margin (ndcY <= 0.68) for HUD pills & leaderboard
            if (Math.abs(ndcX) > 0.78 || ndcY < -0.74 || ndcY > 0.68) {
              allInside = false;
              break;
            }
          }

          if (allInside || requiredDist >= maxOverviewDist - 1) break;
          requiredDist = Math.min(maxOverviewDist, requiredDist * 1.12);
        }
      } else {
        _desiredLookAt.set(400, 250, 0);
        _desiredPos.set(
          400 - upX * 90,
          250 - upY * 90,
          fullCircuitZ * 0.92
        );
      }
    }

    const phaseKey = `racing-${isPortrait ? 'p' : 'l'}-${cameraMode}-${isPreLaunchCountdown ? 'grid' : 'live'}`;
    if (!initializedPhaseRef.current.startsWith('racing-')) {
      camera.position.copy(_desiredPos);
      currentLookAtRef.current.copy(_desiredLookAt);
      currentUpRef.current.copy(_desiredUp);
      initializedPhaseRef.current = phaseKey;
    } else if (initializedPhaseRef.current !== phaseKey && cameraMode === 'onboard') {
      camera.position.copy(_desiredPos);
      currentLookAtRef.current.copy(_desiredLookAt);
      currentUpRef.current.copy(_desiredUp);
      initializedPhaseRef.current = phaseKey;
    } else {
      initializedPhaseRef.current = phaseKey;
    }

    const posLambda =
      cameraMode === 'onboard'
        ? 28.0
        : isPreLaunchCountdown
          ? 7.5
          : cameraMode === 'chase'
            ? 9.5
            : 5.8;
    const lookLambda =
      cameraMode === 'onboard'
        ? 24.0
        : isPreLaunchCountdown
          ? 9.5
          : cameraMode === 'chase'
            ? 11.5
            : 7.5;

    camera.position.x = THREE.MathUtils.damp(camera.position.x, _desiredPos.x, posLambda, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, _desiredPos.y, posLambda, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, _desiredPos.z, posLambda, dt);

    currentLookAtRef.current.x = THREE.MathUtils.damp(
      currentLookAtRef.current.x,
      _desiredLookAt.x,
      lookLambda,
      dt
    );
    currentLookAtRef.current.y = THREE.MathUtils.damp(
      currentLookAtRef.current.y,
      _desiredLookAt.y,
      lookLambda,
      dt
    );
    currentLookAtRef.current.z = THREE.MathUtils.damp(
      currentLookAtRef.current.z,
      _desiredLookAt.z,
      lookLambda,
      dt
    );

    currentUpRef.current.x = THREE.MathUtils.damp(currentUpRef.current.x, _desiredUp.x, 8, dt);
    currentUpRef.current.y = THREE.MathUtils.damp(currentUpRef.current.y, _desiredUp.y, 8, dt);
    currentUpRef.current.z = THREE.MathUtils.damp(currentUpRef.current.z, _desiredUp.z, 8, dt);
    if (currentUpRef.current.lengthSq() > 0.001) {
      currentUpRef.current.normalize();
      camera.up.copy(currentUpRef.current);
    }

    if (shakeRef.current > 0) {
      const shakeAmt = cameraMode === 'onboard' ? shakeRef.current * 0.25 : shakeRef.current * 0.65;
      camera.position.x += (Math.random() - 0.5) * shakeAmt;
      camera.position.y += (Math.random() - 0.5) * shakeAmt;
      camera.position.z += (Math.random() - 0.5) * shakeAmt * 0.4;
    }

    camera.lookAt(currentLookAtRef.current);
  });

  return null;
};
