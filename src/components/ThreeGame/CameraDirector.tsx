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

export const CameraDirector: React.FC<CameraDirectorProps> = ({
  phase,
  activeCar,
  allCars = [],
  track,
  cameraMode = 'helicopter',
  isPortrait = false,
  countdownValue = null
}) => {
  const shakeRef = useRef<number>(0);
  const prevBounceCooldown = useRef<number>(0);
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

    // 2. RACING PHASE
    let focusCar = activeCar;
    if (!focusCar || focusCar.finished || focusCar.disqualified) {
      const racingCars = allCars.filter((c) => !c.finished && !c.disqualified);
      if (racingCars.length > 0) {
        focusCar = racingCars[0];
      }
    }

    const focusSpeed = focusCar ? Math.hypot(focusCar.vx, focusCar.vy) : 0;

    if (focusCar) {
      if (focusCar.bounceCooldown >= 12 && prevBounceCooldown.current < 12) {
        shakeRef.current = 4.2;
      }
      prevBounceCooldown.current = focusCar.bounceCooldown;

      if (focusCar.offTrack && focusSpeed > 1.2) {
        shakeRef.current = Math.max(shakeRef.current, 1.35);
      } else if (focusCar.isDrifting) {
        shakeRef.current = Math.max(shakeRef.current, 0.55);
      } else if (cameraMode === 'onboard' && focusSpeed > 5.2) {
        shakeRef.current = Math.max(shakeRef.current, 0.14);
      }
    }

    shakeRef.current = THREE.MathUtils.damp(shakeRef.current, 0, 9, dt);
    if (shakeRef.current < 0.02) shakeRef.current = 0;

    // 2A. CINEMATIC STARTING GRID COUNTDOWN SHOT (3... 2... 1...)
    // Frames the F1 cars from a dramatic low-angle 3D grid perspective looking through the glowing FIA Gantry!
    const isPreLaunchCountdown =
      countdownValue !== null && countdownValue !== '¡YA!' && focusCar && focusSpeed < 0.25;

    let targetFov = 50;
    if (isPreLaunchCountdown) {
      targetFov = 46;
    } else if (cameraMode === 'onboard') {
      targetFov = 56 + THREE.MathUtils.clamp((focusSpeed - 2.0) * 2.6, 0, 15);
    } else if (cameraMode === 'chase') {
      targetFov = 50 + THREE.MathUtils.clamp((focusSpeed - 2.2) * 2.1, 0, 12);
    } else if (cameraMode === 'helicopter') {
      targetFov = 46 + THREE.MathUtils.clamp((focusSpeed - 2.8) * 1.1, 0, 6);
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

      // Low-slung cinematic grid camera right behind the rear wing looking up through the 5 red FIA gantry lights
      _desiredPos.set(
        carWorldX - fwdX * 26 + sideX * 6.5,
        carWorldY - fwdY * 26 + sideY * 6.5,
        carWorldZ + 7.2
      );
      _desiredLookAt.set(
        carWorldX + fwdX * 42,
        carWorldY + fwdY * 42,
        carWorldZ + 8.5
      );
      _desiredUp.set(0, 0, 1);
    } else if (cameraMode === 'onboard' && focusCar) {
      const carSurf = getTrackSurfaceInfo({ x: focusCar.x, y: focusCar.y }, track);
      // True T-Cam mounted rigidly on the carbon airbox follows the real chassis heading
      const yaw = -focusCar.angle;
      const fwdX = Math.cos(yaw);
      const fwdY = Math.sin(yaw);
      const carWorldX = focusCar.x;
      const carWorldY = 500 - focusCar.y;
      const carWorldZ = carSurf.elevationZ + 0.15;

      _desiredPos.set(
        carWorldX - fwdX * 1.6,
        carWorldY - fwdY * 1.6,
        carWorldZ + 4.35
      );
      _desiredLookAt.set(
        carWorldX + fwdX * 52,
        carWorldY + fwdY * 52,
        carWorldZ + 1.85
      );
      _desiredUp.set(0, 0, 1);
    } else if (cameraMode === 'chase' && focusCar) {
      const carSurf = getTrackSurfaceInfo({ x: focusCar.x, y: focusCar.y }, track);
      // Chase camera tracks a natural blend of chassis heading and velocity vector so real drifts swing dramatically in view!
      const yaw = -focusCar.angle - (focusCar.slipAngle ?? 0) * 0.45;
      const fwdX = Math.cos(yaw);
      const fwdY = Math.sin(yaw);
      const carWorldX = focusCar.x;
      const carWorldY = 500 - focusCar.y;
      const carWorldZ = carSurf.elevationZ + 0.15;

      // Next-Gen GTA VI / F1 Low-Slung Broadcast Chase Cam right behind the rear wing!
      const trailDist = 20.5 + focusSpeed * 1.35;
      _desiredPos.set(
        carWorldX - fwdX * trailDist,
        carWorldY - fwdY * trailDist,
        carWorldZ + 8.2 + focusSpeed * 0.32
      );
      _desiredLookAt.set(
        carWorldX + fwdX * 34,
        carWorldY + fwdY * 34,
        carWorldZ + 2.4
      );
      _desiredUp.set(0, 0, 1);
    } else if (cameraMode === 'circuit') {
      _desiredUp.set(upX, upY, 0);
      _desiredLookAt.set(400, 250, 0);
      _desiredPos.set(
        400 - upX * (fullCircuitZ * 0.24),
        250 - upY * (fullCircuitZ * 0.24),
        fullCircuitZ * 0.88
      );
    } else {
      // 'helicopter' (Default TV Dinámica): Dramatic low-altitude F1 TV Broadcast Helicopter framing specular road & cars
      _desiredUp.set(upX, upY, 0);
      if (focusCar) {
        const lookAheadX = focusCar.vx * 10.5;
        const lookAheadY = -focusCar.vy * 10.5;

        let packX = focusCar.x + lookAheadX;
        let packY = 500 - focusCar.y + lookAheadY;
        let maxSpread = 0;

        const racingCars = allCars.filter((c) => !c.finished && !c.disqualified);
        if (racingCars.length > 1) {
          let sumX = 0;
          let sumY = 0;
          racingCars.forEach((c) => {
            const cy = 500 - c.y;
            sumX += c.x;
            sumY += cy;
            const d = Math.hypot(c.x - focusCar!.x, cy - (500 - focusCar!.y));
            if (d > maxSpread) maxSpread = d;
          });
          const avgX = sumX / racingCars.length;
          const avgY = racingCars.length > 0 ? sumY / racingCars.length : packY;
          packX = packX * 0.76 + avgX * 0.24;
          packY = packY * 0.76 + avgY * 0.24;
        }

        const clampedX = THREE.MathUtils.clamp(packX, 155, 645);
        const clampedY = THREE.MathUtils.clamp(packY, 105, 395);

        _desiredLookAt.set(clampedX, clampedY, 1.2);

        const spreadZoom = Math.min(85, maxSpread * 0.25);
        const dist = (isPortrait ? 185 : 148) + focusSpeed * 4.8 + spreadZoom;
        // Closer, lower grazing angle (0.72 horizontal offset, 0.66 vertical height) showcases 3D relief & car reflections!
        _desiredPos.set(
          clampedX - upX * (dist * 0.72),
          clampedY - upY * (dist * 0.72),
          dist * 0.66
        );
      } else {
        _desiredLookAt.set(400, 250, 0);
        _desiredPos.set(
          400 - upX * 115,
          250 - upY * 115,
          fullCircuitZ * 0.85
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
            : 5.2;
    const lookLambda =
      cameraMode === 'onboard'
        ? 24.0
        : isPreLaunchCountdown
          ? 9.5
          : cameraMode === 'chase'
            ? 11.5
            : 7.0;

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
      const shakeAmt = cameraMode === 'onboard' ? shakeRef.current * 0.28 : shakeRef.current;
      camera.position.x += (Math.random() - 0.5) * shakeAmt;
      camera.position.y += (Math.random() - 0.5) * shakeAmt;
      camera.position.z += (Math.random() - 0.5) * shakeAmt * 0.5;
    }

    camera.lookAt(currentLookAtRef.current);
  });

  return null;
};
