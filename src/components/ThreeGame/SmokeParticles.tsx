import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Particle } from '../../types';

interface SmokeParticlesProps {
  particles: Particle[];
}

export const SmokeParticles: React.FC<SmokeParticlesProps> = ({ particles }) => {
  const pointsRef = useRef<THREE.Points>(null);

  useFrame(() => {
    const points = pointsRef.current;
    if (!points) return;

    const geometry = points.geometry as THREE.BufferGeometry;
    const count = particles.length;

    // Dynamically rebuild position and color arrays for max performance
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    particles.forEach((p, idx) => {
      positions[idx * 3] = p.x;
      positions[idx * 3 + 1] = 500 - p.y;
      positions[idx * 3 + 2] = 0.8 + (p.life * 0.05); // particles float upwards over time!

      // Extract rgb values for interpolation
      const alpha = Math.max(0, p.alpha);
      const isSpark = p.color === '#fbbf24';
      const isGrass = p.color === '#34d399';

      if (isSpark) {
        // High intensity golden yellow
        colors[idx * 3] = 0.98;
        colors[idx * 3 + 1] = 0.75;
        colors[idx * 3 + 2] = 0.14;
        sizes[idx] = p.size * alpha * 1.5;
      } else if (isGrass) {
        // Vibrant turf green
        colors[idx * 3] = 0.20;
        colors[idx * 3 + 1] = 0.83;
        colors[idx * 3 + 2] = 0.60;
        sizes[idx] = p.size * alpha;
      } else {
        // Tyre smoke (fade to white/light grey)
        const val = 0.7 + (p.life / p.maxLife) * 0.2;
        colors[idx * 3] = val;
        colors[idx * 3 + 1] = val;
        colors[idx * 3 + 2] = val;
        sizes[idx] = p.size * (1.0 + (p.life / p.maxLife) * 1.5) * alpha; // expands as it floats!
      }
    });

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Re-verify updates
    geometry.computeBoundingSphere();
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry />
      <pointsMaterial 
        vertexColors 
        size={3.2} 
        sizeAttenuation={true} 
        transparent 
        opacity={0.65} 
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
};
