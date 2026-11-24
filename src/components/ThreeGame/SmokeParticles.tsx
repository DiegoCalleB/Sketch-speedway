import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Particle, WeatherCondition } from '../../types';

interface SmokeParticlesProps {
  particles?: Particle[];
  particlesRef?: React.MutableRefObject<Particle[]>;
  weather?: WeatherCondition;
  qualityScaleRef?: React.MutableRefObject<number>;
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

const MAX_PARTICLES = 620;
const MAX_DEBRIS = 96;
const MAX_RAIN_STREAKS = 480;

const _debrisDummy = new THREE.Object3D();
const _debrisColor = new THREE.Color();
const _rainDummy = new THREE.Object3D();

export const SmokeParticles: React.FC<SmokeParticlesProps> = ({
  particles,
  particlesRef,
  weather = 'dry',
  qualityScaleRef
}) => {
  const smokeRef = useRef<THREE.Points>(null);
  const sparksRef = useRef<THREE.Points>(null);
  const debrisMeshRef = useRef<THREE.InstancedMesh>(null);
  const rainMeshRef = useRef<THREE.InstancedMesh>(null);

  const {
    spriteTex,
    smokePos,
    smokeCol,
    sparkPos,
    sparkCol,
    smokePosAttr,
    smokeColAttr,
    sparkPosAttr,
    sparkColAttr,
    rainDropSeeds
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

    const seeds: { x: number; y: number; zOffset: number; speed: number }[] = [];
    for (let i = 0; i < MAX_RAIN_STREAKS; i++) {
      seeds.push({
        x: -60 + Math.random() * 920,
        y: -40 + Math.random() * 580,
        zOffset: Math.random() * 145,
        speed: 145 + Math.random() * 65
      });
    }

    return {
      spriteTex: createSoftParticleTexture(),
      smokePos: sPos,
      smokeCol: sCol,
      sparkPos: kPos,
      sparkCol: kCol,
      smokePosAttr: sPosAttr,
      smokeColAttr: sColAttr,
      sparkPosAttr: kPosAttr,
      sparkColAttr: kColAttr,
      rainDropSeeds: seeds
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
    if (debrisMeshRef.current) {
      debrisMeshRef.current.count = 0;
    }
    if (rainMeshRef.current) {
      rainMeshRef.current.count = 0;
    }
    return () => {
      spriteTex.dispose();
    };
  }, [spriteTex, smokePosAttr, smokeColAttr, sparkPosAttr, sparkColAttr]);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();
    const list = particlesRef ? particlesRef.current : particles || [];
    let smokeCount = 0;
    let sparkCount = 0;
    let debrisCount = 0;
    const debrisMesh = debrisMeshRef.current;

    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const alpha = Math.max(0, Math.min(1, p.alpha));

      if (p.kind === 'debris') {
        if (debrisMesh && debrisCount < MAX_DEBRIS) {
          const pz = p.z !== undefined ? p.z : 1.0;
          _debrisDummy.position.set(p.x, 500 - p.y, Math.max(0.28, pz));
          _debrisDummy.rotation.set(p.rotX || 0, p.rotY || 0, p.rotZ || 0);
          const s = p.size * (0.45 + 0.55 * alpha);
          _debrisDummy.scale.set(s * 1.4, s * 0.9, s * 0.22);
          _debrisDummy.updateMatrix();
          debrisMesh.setMatrixAt(debrisCount, _debrisDummy.matrix);
          _debrisColor.set(p.color);
          debrisMesh.setColorAt(debrisCount, _debrisColor);
          debrisCount++;
        }
        continue;
      }

      const isSpark = p.kind === 'spark' || p.color === '#fbbf24' || p.color === '#fff7ed';

      if (isSpark && sparkCount < MAX_PARTICLES) {
        const idx = sparkCount * 3;
        sparkPos[idx] = p.x;
        sparkPos[idx + 1] = 500 - p.y;
        sparkPos[idx + 2] = p.z !== undefined ? p.z : 0.65 + p.life * 0.08;
        // Incandescent white-gold titanium skid-block & crash sparks
        sparkCol[idx] = 1.0 * alpha;
        sparkCol[idx + 1] = (0.62 + alpha * 0.35) * alpha;
        sparkCol[idx + 2] = (0.18 + alpha * 0.4) * alpha;
        sparkCount++;
      } else if (!isSpark && smokeCount < MAX_PARTICLES) {
        const idx = smokeCount * 3;
        smokePos[idx] = p.x;
        smokePos[idx + 1] = 500 - p.y;
        const isSpray = p.kind === 'spray';
        smokePos[idx + 2] = isSpray ? 1.15 + p.life * 0.22 : 0.9 + p.life * 0.12;

        const isGravelDust =
          p.color === '#d6c7a1' || p.color === '#b45309' || p.color === '#34d399';
        if (isSpray) {
          // Rooster-tail wet-weather F1 diffuser & tire water spray mist
          const mist = (0.82 + (p.life / Math.max(1, p.maxLife)) * 0.18) * alpha;
          smokeCol[idx] = mist * 0.84;
          smokeCol[idx + 1] = mist * 0.94;
          smokeCol[idx + 2] = mist * 1.0;
        } else if (isGravelDust) {
          // Warm limestone gravel dust cloud
          smokeCol[idx] = 0.78 * alpha;
          smokeCol[idx + 1] = 0.72 * alpha;
          smokeCol[idx + 2] = 0.56 * alpha;
        } else {
          // Volumetric blue-grey tire lockup / drift / crash smoke
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

    if (debrisMesh) {
      debrisMesh.count = debrisCount;
      if (debrisCount > 0) {
        debrisMesh.instanceMatrix.needsUpdate = true;
        if (debrisMesh.instanceColor) debrisMesh.instanceColor.needsUpdate = true;
      }
    }

    // 3D Falling Rain Curtain (1 draw call InstancedMesh scaled by adaptive 60 FPS quality governor)
    const rainMesh = rainMeshRef.current;
    if (rainMesh) {
      if (weather === 'rain') {
        const qScale = Math.max(0.45, Math.min(1.0, qualityScaleRef?.current ?? 1.0));
        const activeRainCount = Math.floor(MAX_RAIN_STREAKS * qScale);
        rainMesh.count = activeRainCount;
        for (let i = 0; i < activeRainCount; i++) {
          const seed = rainDropSeeds[i];
          const fallDist = (elapsed * seed.speed + seed.zOffset) % 140;
          const z = 140 - fallDist;
          const windShift = (140 - z) * 0.14;
          _rainDummy.position.set(seed.x - windShift, seed.y - windShift * 0.5, z);
          _rainDummy.rotation.set(0.07, -0.14, 0);
          _rainDummy.scale.set(0.08, 0.08, 4.8);
          _rainDummy.updateMatrix();
          rainMesh.setMatrixAt(i, _rainDummy.matrix);
        }
        rainMesh.instanceMatrix.needsUpdate = true;
      } else if (rainMesh.count !== 0) {
        rainMesh.count = 0;
      }
    }
  });

  return (
    <group>
      {/* Volumetric Soft Tire Smoke, Wet Water Spray & Gravel Dust Plumes */}
      <points ref={smokeRef} frustumCulled={false}>
        <bufferGeometry />
        <pointsMaterial
          map={spriteTex}
          vertexColors
          size={weather === 'rain' ? 6.8 : 5.8}
          sizeAttenuation
          transparent
          opacity={weather === 'rain' ? 0.62 : 0.55}
          depthWrite={false}
        />
      </points>

      {/* Incandescent Titanium Skid-Block & Barrier Impact Sparks (Additive Glow) */}
      <points ref={sparksRef} frustumCulled={false}>
        <bufferGeometry />
        <pointsMaterial
          map={spriteTex}
          vertexColors
          size={3.5}
          sizeAttenuation
          transparent
          opacity={0.96}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* 3D Solid Carbon-Fiber & Painted Livery Shards Ejected on Collisions */}
      <instancedMesh
        ref={debrisMeshRef}
        args={[undefined, undefined, MAX_DEBRIS]}
        frustumCulled={false}
        castShadow
      >
        <boxGeometry args={[1.0, 1.0, 1.0]} />
        <meshStandardMaterial roughness={0.28} metalness={0.62} />
      </instancedMesh>

      {/* 3D Wet-Weather Falling Rain Streaks */}
      <instancedMesh
        ref={rainMeshRef}
        args={[undefined, undefined, MAX_RAIN_STREAKS]}
        frustumCulled={false}
      >
        <boxGeometry args={[1.0, 1.0, 1.0]} />
        <meshBasicMaterial
          color="#bae6fd"
          transparent
          opacity={0.34}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
};

