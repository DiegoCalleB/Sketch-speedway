import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GamePhase, RaceCarState, Track } from '../../types';

interface CameraDirectorProps {
  phase: GamePhase;
  activeCar?: RaceCarState;
  activePlayerGrid?: { x: number; y: number };
  activeDrawingTip?: { x: number; y: number } | null;
  track: Track;
  cameraMode?: 'chase' | 'tv';
}

export const CameraDirector: React.FC<CameraDirectorProps> = ({
  phase,
  activeCar,
  activePlayerGrid,
  activeDrawingTip,
  track,
  cameraMode = 'chase'
}) => {
  const shakeRef = useRef<number>(0);
  const prevBounceCooldown = useRef<number>(0);


  useFrame((state) => {
    const camera = state.camera;

    if (phase === 'drawing') {
      // In drawing phase, keep the PerspectiveCamera locked statically and perfectly looking straight down at the entire circuit
      // At distance 326, with 75 deg vertical FOV, the visible area is exactly 800x500 on the Z=0 plane.
      camera.position.set(400, 250, 326);
      camera.lookAt(400, 250, 0);
      return;
    }

    const target = new THREE.Vector3(400, 250, 0); // Default track center

    // 1. Determine target lookAt coordinate in 3D
    if (phase === 'racing' && activeCar) {
      target.set(activeCar.x, 500 - activeCar.y, 0);

      // Trigger heavy camera shake on wall collision impact
      if (activeCar.bounceCooldown === 14 && prevBounceCooldown.current < 14) {
        shakeRef.current = 7.5; // Shockwave amplitude
      }
      prevBounceCooldown.current = activeCar.bounceCooldown;

      // Subtle high-frequency vibration during tire drifts
      if (activeCar.isDrifting) {
        shakeRef.current = Math.max(shakeRef.current, 0.95);
      }
    }

    // Decay camera shake over time
    shakeRef.current *= 0.9;
    if (shakeRef.current < 0.05) shakeRef.current = 0;

    // 2. Map dynamic camera height/zoom based on state
    if (cameraMode === 'tv') {
      // Stadium TV grandstand view, elevated at (400, 70, 320) looking down across track
      const tvPos = new THREE.Vector3(400, 50, 330);
      camera.position.lerp(tvPos, 0.04);
      camera.lookAt(target);
      return;
    }

    let desiredDistance = 220;
    const desiredCamPos = new THREE.Vector3();

    // Racing camera: Zoom in/out based on speed and tilt for dynamic 3D feeling
    if (activeCar) {
      const speed = Math.hypot(activeCar.vx, activeCar.vy);
      desiredDistance = 150 + speed * 12; // Dynamic FOV pulls out at speed!
    }
    desiredCamPos.set(
      target.x,
      target.y - desiredDistance * 0.7,
      target.z + desiredDistance * 0.9
    );

    // Smooth lerp camera position to avoid snaps
    camera.position.lerp(desiredCamPos, 0.05);

    // Apply Camera Shake offset
    if (shakeRef.current > 0) {
      const shake = new THREE.Vector3(
        (Math.random() - 0.5) * shakeRef.current,
        (Math.random() - 0.5) * shakeRef.current,
        (Math.random() - 0.5) * shakeRef.current
      );
      camera.position.add(shake);
    }

    // Direct camera to look at the target coordinate
    camera.lookAt(target);
  });

  return null;
};
