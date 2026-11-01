import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Point } from '../../types';

interface GlowingSplineProps {
  path: Point[];
  colorOverride?: string;
  isCompleted?: boolean;
}

const getSpeedColor = (speed: number) => {
  if (speed < 2) return '#38bdf8'; // Sky Blue
  if (speed < 4) return '#22c55e'; // Green
  if (speed < 5.5) return '#eab308'; // Yellow
  return '#ef4444'; // Red
};

export const GlowingSpline: React.FC<GlowingSplineProps> = ({ path, colorOverride, isCompleted = false }) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (groupRef.current) {
      // Create a subtle neon pulsing animation
      const pulse = Math.sin(state.clock.getElapsedTime() * 6) * 0.15 + 0.95;
      groupRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mat = child.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = (isCompleted ? 1.4 : 2.2) * pulse;
        }
      });
    }
  });

  if (path.length < 2) return null;

  return (
    <group ref={groupRef}>
      {path.slice(1).map((pt, idx) => {
        const p1 = path[idx];
        const p2 = pt;

        const v1 = new THREE.Vector3(p1.x, 500 - p1.y, 0.6); // Slightly above asphalt
        const v2 = new THREE.Vector3(p2.x, 500 - p2.y, 0.6);
        const distance = v1.distanceTo(v2);
        
        // Prevent division by zero or rendering tiny segments
        if (distance < 0.1) return null;

        const position = v1.clone().add(v2).multiplyScalar(0.5);
        const direction = v2.clone().sub(v1).normalize();
        
        // Cylinder standard orientation is along Y, so we align standard up vector [0,1,0] to our direction vector
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);

        const segmentColor = colorOverride || getSpeedColor(p2.speed);
        const thickness = 1.3 + (p2.speed * 0.08);

        return (
          <mesh 
            key={`spline-seg-${idx}`} 
            position={position} 
            quaternion={quaternion}
          >
            <cylinderGeometry args={[thickness, thickness, distance, 5]} />
            <meshStandardMaterial 
              color={segmentColor} 
              emissive={segmentColor} 
              emissiveIntensity={2.0} 
              roughness={0.2}
              transparent
              opacity={isCompleted ? 0.65 : 0.9}
            />
          </mesh>
        );
      })}
    </group>
  );
};
