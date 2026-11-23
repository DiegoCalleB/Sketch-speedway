import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Particle } from '../../types';

interface SmokeParticlesProps {
  particles: Particle[];
}

// Soft radial Gaussian particle sprite (replaces harsh square WebGL pixels!)
const createSoftParticleTexture = () => {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.72)');
  grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.22)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const MAX_PARTICLES = 450;

export const SmokeParticles: React.FC<SmokeParticlesProps> = ({ particles }) => {
  const smokeRef = useRef<THREE.Points>(null);
  const sparksRef = useRef<THREE.Points>(null);

  const { spriteTex, smokePos, smokeCol, sparkPos, sparkCol } = useMemo(() => {
    return {
      spriteTex: createSoftParticleTexture(),
      smokePos: new Float32Array(MAX_PARTICLES * 3),
      smokeCol: new Float32Array(MAX_PARTICLES * 3),
      sparkPos: new Float32Array(MAX_PARTICLES * 3),
      sparkCol: new Float32Array(MAX_PARTICLES * 3)
    };
  }, []);

  useEffect(() => {
    return () => {
      spriteTex.dispose();
    };
  }, [spriteTex]);

  useFrame(() => {
    let smokeCount = 0;
    let sparkCount = 0;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const alpha = Math.max(0, Math.min(1, p.alpha));
      const isSpark = p.color === '#fbbf24' || p.color === '#fff7ed';

      if (isSpark && sparkCount < MAX_PARTICLES) {
        const idx = sparkCount * 3;
        sparkPos[idx] = p.x;
        sparkPos[idx + 1] = 500 - p.y;
        sparkPos[idx + 2] = 0.65 + (p.life * 0.08);
        // Incandescent white-gold titanium skid-block sparks
        sparkCol[idx] = 1.0 * alpha;
        sparkCol[idx + 1] = (0.62 + alpha * 0.35) * alpha;
        sparkCol[idx + 2] = (0.18 + alpha * 0.4) * alpha;
        sparkCount++;
      } else if (!isSpark && smokeCount < MAX_PARTICLES) {
        const idx = smokeCount * 3;
        smokePos[idx] = p.x;
        smokePos[idx + 1] = 500 - p.y;
        smokePos[idx + 2] = 0.9 + p.life * 0.12;

        const isGravelDust = p.color === '#d6c7a1' || p.color === '#b45309' || p.color === '#34d399';
        if (isGravelDust) {
          // Warm limestone gravel dust cloud
          smokeCol[idx] = 0.78 * alpha;
          smokeCol[idx + 1] = 0.72 * alpha;
          smokeCol[idx + 2] = 0.56 * alpha;
        } else {
          // Volumetric blue-grey tire lockup / drift smoke
          const shade = (0.72 + (p.life / Math.max(1, p.maxLife)) * 0.2) * alpha;
          smokeCol[idx] = shade * 0.94;
          smokeCol[idx + 1] = shade * 0.96;
          smokeCol[idx + 2] = shade;
        }
        smokeCount++;
      }
    }

    if (smokeRef.current) {
      const geo = smokeRef.current.geometry;
      geo.setAttribute('position', new THREE.BufferAttribute(smokePos.subarray(0, smokeCount * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(smokeCol.subarray(0, smokeCount * 3), 3));
      geo.setDrawRange(0, smokeCount);
      if (smokeCount > 0) geo.computeBoundingSphere();
    }

    if (sparksRef.current) {
      const geo = sparksRef.current.geometry;
      geo.setAttribute('position', new THREE.BufferAttribute(sparkPos.subarray(0, sparkCount * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(sparkCol.subarray(0, sparkCount * 3), 3));
      geo.setDrawRange(0, sparkCount);
      if (sparkCount > 0) geo.computeBoundingSphere();
    }
  });

  return (
    <group>
      {/* Volumetric Soft Tire Smoke & Gravel Dust Plumes */}
      <points ref={smokeRef} frustumCulled={false}>
        <bufferGeometry />
        <pointsMaterial
          map={spriteTex}
          vertexColors
          size={5.8}
          sizeAttenuation
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </points>

      {/* Incandescent Titanium Skid-Block Floor Sparks (Additive Glow) */}
      <points ref={sparksRef} frustumCulled={false}>
        <bufferGeometry />
        <pointsMaterial
          map={spriteTex}
          vertexColors
          size={3.4}
          sizeAttenuation
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  );
};
