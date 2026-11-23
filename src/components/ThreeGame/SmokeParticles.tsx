import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Particle } from '../../types';

interface SmokeParticlesProps {
  particles?: Particle[];
  particlesRef?: React.MutableRefObject<Particle[]>;
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

export const SmokeParticles: React.FC<SmokeParticlesProps> = ({ particles, particlesRef }) => {
  const smokeRef = useRef<THREE.Points>(null);
  const sparksRef = useRef<THREE.Points>(null);

  const {
    spriteTex,
    smokePos,
    smokeCol,
    sparkPos,
    sparkCol,
    smokePosAttr,
    smokeColAttr,
    sparkPosAttr,
    sparkColAttr
  } = useMemo(() => {
    const sPos = new Float32Array(MAX_PARTICLES * 3);
    const sCol = new Float32Array(MAX_PARTICLES * 3);
    const kPos = new Float32Array(MAX_PARTICLES * 3);
    const kCol = new Float32Array(MAX_PARTICLES * 3);

    const sPosAttr = new THREE.BufferAttribute(sPos, 3);
    sPosAttr.setUsage(THREE.DynamicDrawUsage);
    const sColAttr = new THREE.BufferAttribute(sCol, 3);
    sColAttr.setUsage(THREE.DynamicDrawUsage);

    const kPosAttr = new THREE.BufferAttribute(kPos, 3);
    kPosAttr.setUsage(THREE.DynamicDrawUsage);
    const kColAttr = new THREE.BufferAttribute(kCol, 3);
    kColAttr.setUsage(THREE.DynamicDrawUsage);

    return {
      spriteTex: createSoftParticleTexture(),
      smokePos: sPos,
      smokeCol: sCol,
      sparkPos: kPos,
      sparkCol: kCol,
      smokePosAttr: sPosAttr,
      smokeColAttr: sColAttr,
      sparkPosAttr: kPosAttr,
      sparkColAttr: kColAttr
    };
  }, []);

  useEffect(() => {
    if (smokeRef.current) {
      const geo = smokeRef.current.geometry;
      geo.setAttribute('position', smokePosAttr);
      geo.setAttribute('color', smokeColAttr);
      geo.setDrawRange(0, 0);
    }
    if (sparksRef.current) {
      const geo = sparksRef.current.geometry;
      geo.setAttribute('position', sparkPosAttr);
      geo.setAttribute('color', sparkColAttr);
      geo.setDrawRange(0, 0);
    }
    return () => {
      spriteTex.dispose();
    };
  }, [spriteTex, smokePosAttr, smokeColAttr, sparkPosAttr, sparkColAttr]);

  useFrame(() => {
    const list = particlesRef ? particlesRef.current : particles || [];
    let smokeCount = 0;
    let sparkCount = 0;

    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const alpha = Math.max(0, Math.min(1, p.alpha));
      const isSpark = p.color === '#fbbf24' || p.color === '#fff7ed';

      if (isSpark && sparkCount < MAX_PARTICLES) {
        const idx = sparkCount * 3;
        sparkPos[idx] = p.x;
        sparkPos[idx + 1] = 500 - p.y;
        sparkPos[idx + 2] = 0.65 + p.life * 0.08;
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

        const isGravelDust =
          p.color === '#d6c7a1' || p.color === '#b45309' || p.color === '#34d399';
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
      if (smokeCount > 0) {
        smokePosAttr.needsUpdate = true;
        smokeColAttr.needsUpdate = true;
      }
      geo.setDrawRange(0, smokeCount);
    }

    if (sparksRef.current) {
      const geo = sparksRef.current.geometry;
      if (sparkCount > 0) {
        sparkPosAttr.needsUpdate = true;
        sparkColAttr.needsUpdate = true;
      }
      geo.setDrawRange(0, sparkCount);
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
