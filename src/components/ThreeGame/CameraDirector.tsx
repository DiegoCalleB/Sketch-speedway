import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GamePhase, RaceCarState, Track } from '../../types';

export type RaceCameraMode = 'helicopter' | 'chase' | 'circuit';

interface CameraDirectorProps {
  phase: GamePhase;
  activeCar?: RaceCarState;
  allCars?: RaceCarState[];
  activePlayerGrid?: { x: number; y: number };
  activeDrawingTip?: { x: number; y: number } | null;
  track: Track;
  cameraMode?: RaceCameraMode;
  isPortrait?: boolean;
}

const _desiredPos = new THREE.Vector3(400, 250, 536);
const _desiredLookAt = new THREE.Vector3(400, 250, 0);

export const CameraDirector: React.FC<CameraDirectorProps> = ({
  phase,
  activeCar,
  allCars = [],
  track,
  cameraMode = 'helicopter',
  isPortrait = false
}) => {
  const shakeRef = useRef<number>(0);
  const prevBounceCooldown = useRef<number>(0);
  const currentLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3(400, 250, 0));
  const initializedPhaseRef = useRef<string>('');

  useFrame((state, delta) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const dt = Math.min(delta, 0.05);

    const vFovRad = THREE.MathUtils.degToRad(camera.fov || 50);
    const tanHalfFov = Math.tan(vFovRad * 0.5);
    const aspect = state.size.width / Math.max(1, state.size.height);

    // Up vector in world XY plane: (0, 1, 0) for landscape, (-1, 0, 0) for 90° clockwise portrait
    const upX = isPortrait ? -1 : 0;
    const upY = isPortrait ? 0 : 1;
    camera.up.set(upX, upY, 0);

    // World span along vertical screen axis vs horizontal screen axis
    const worldSpanVertical = isPortrait ? track.width : track.height;
    const worldSpanHorizontal = isPortrait ? track.height : track.width;

    const zForHeight = (worldSpanVertical * 0.5) / tanHalfFov;
    const zForWidth = (worldSpanHorizontal * 0.5) / (tanHalfFov * aspect);
    const fullCircuitZ = Math.max(zForHeight, zForWidth) + 0.3;

    // 1. DRAWING PHASE: Exact overhead framing of the entire circuit
    if (phase === 'drawing') {
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

    if (focusCar) {
      if (focusCar.bounceCooldown >= 12 && prevBounceCooldown.current < 12) {
        shakeRef.current = 4.5;
      }
      prevBounceCooldown.current = focusCar.bounceCooldown;

      if (focusCar.isDrifting) {
        shakeRef.current = Math.max(shakeRef.current, 0.45);
      }
    }

    shakeRef.current = THREE.MathUtils.damp(shakeRef.current, 0, 8, dt);
    if (shakeRef.current < 0.03) shakeRef.current = 0;

    if (cameraMode === 'circuit') {
      // Full circuit 3D overview: whole track visible with slight stadium tilt along -up
      _desiredLookAt.set(400, 250, 0);
      _desiredPos.set(
        400 - upX * (fullCircuitZ * 0.16),
        250 - upY * (fullCircuitZ * 0.16),
        fullCircuitZ * 0.96
      );
    } else if (cameraMode === 'chase' && focusCar) {
      // Close 3D Pursuit Camera with velocity look-ahead
      const speed = Math.hypot(focusCar.vx, focusCar.vy);
      const lookAheadX = focusCar.vx * 11;
      const lookAheadY = -focusCar.vy * 11;

      const targetX = THREE.MathUtils.clamp(focusCar.x + lookAheadX, 110, 690);
      const targetY = THREE.MathUtils.clamp(500 - focusCar.y + lookAheadY, 85, 415);

      _desiredLookAt.set(targetX, targetY, 0.5);

      const dist = 125 + speed * 8.5;
      _desiredPos.set(
        targetX - upX * (dist * 0.58),
        targetY - upY * (dist * 0.58),
        dist * 0.84
      );
    } else {
      // 'helicopter' (Default): Smart Broadcast TV Camera that frames the player + pack battle
      if (focusCar) {
        const speed = Math.hypot(focusCar.vx, focusCar.vy);
        const lookAheadX = focusCar.vx * 9;
        const lookAheadY = -focusCar.vy * 9;

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
          const avgY = sumY / racingCars.length;
          packX = packX * 0.72 + avgX * 0.28;
          packY = packY * 0.72 + avgY * 0.28;
        }

        const clampedX = THREE.MathUtils.clamp(packX, 165, 635);
        const clampedY = THREE.MathUtils.clamp(packY, 115, 385);

        _desiredLookAt.set(clampedX, clampedY, 0);

        const spreadZoom = Math.min(115, maxSpread * 0.32);
        const dist = (isPortrait ? 235 : 195) + speed * 6 + spreadZoom;
        _desiredPos.set(
          clampedX - upX * (dist * 0.5),
          clampedY - upY * (dist * 0.5),
          dist * 0.88
        );
      } else {
        _desiredLookAt.set(400, 250, 0);
        _desiredPos.set(
          400 - upX * 90,
          250 - upY * 90,
          fullCircuitZ * 0.95
        );
      }
    }

    const phaseKey = `racing-${isPortrait ? 'p' : 'l'}`;
    if (initializedPhaseRef.current !== phaseKey) {
      camera.position.set(
        400 - upX * 85,
        250 - upY * 85,
        fullCircuitZ * 0.92
      );
      currentLookAtRef.current.set(400, 250, 0);
      initializedPhaseRef.current = phaseKey;
    }

    const posLambda = cameraMode === 'chase' ? 6.5 : 4.8;
    const lookLambda = cameraMode === 'chase' ? 9.0 : 6.5;

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

    if (shakeRef.current > 0) {
      camera.position.x += (Math.random() - 0.5) * shakeRef.current;
      camera.position.y += (Math.random() - 0.5) * shakeRef.current;
    }

    camera.lookAt(currentLookAtRef.current);
  });

  return null;
};
