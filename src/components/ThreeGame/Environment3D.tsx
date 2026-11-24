import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Track, Player, RaceCarState, WeatherCondition } from '../../types';
import { getTrackBankingProfile, getTrackSurfaceInfo } from '../../utils/tracks';
import { LightingPreset } from './SceneAtmosphere';

interface Environment3DProps {
  track: Track;
  lightingPreset?: LightingPreset;
  weather?: WeatherCondition;
  carsStateRef?: React.MutableRefObject<RaceCarState[]>;
  players?: Player[];
}

const _grassNormalScale = new THREE.Vector2(1.35, 1.35);

// Next-Gen 1024x1024 PBR Countryside Grass Albedo + Tangent Normal Map + Sunlit Dew Roughness Map
const createNaturalTerrainMaps = (maxAnisotropy: number, preset: LightingPreset) => {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const normCanvas = document.createElement('canvas');
  normCanvas.width = size;
  normCanvas.height = size;
  const nCtx = normCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d');

  if (!ctx || !nCtx || !rCtx) {
    return {
      map: new THREE.Texture(),
      normalMap: new THREE.Texture(),
      roughnessMap: new THREE.Texture()
    };
  }

  ctx.fillStyle = preset === 'night' ? '#0e1a11' : preset === 'sunset' ? '#293f21' : '#2e4b27';
  ctx.fillRect(0, 0, size, size);

  nCtx.fillStyle = 'rgb(128, 128, 255)';
  nCtx.fillRect(0, 0, size, size);

  rCtx.fillStyle = preset === 'night' ? '#d4d4d4' : '#e2e2e2';
  rCtx.fillRect(0, 0, size, size);

  // Macro soil, clover, dry straw & lush emerald turf patches
  for (let i = 0; i < 190; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 34 + Math.random() * 115;
    const grad = ctx.createRadialGradient(x, y, 4, x, y, r);
    const palette =
      i % 4 === 0
        ? ['rgba(78, 112, 48, 0.30)', 'rgba(78, 112, 48, 0)']
        : i % 4 === 1
          ? ['rgba(28, 48, 22, 0.36)', 'rgba(28, 48, 22, 0)']
          : i % 4 === 2
            ? ['rgba(116, 100, 62, 0.22)', 'rgba(116, 100, 62, 0)']
            : ['rgba(54, 88, 38, 0.26)', 'rgba(54, 88, 38, 0)'];
    grad.addColorStop(0, palette[0]);
    grad.addColorStop(1, palette[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    // Dewy grass patches have slightly lower roughness for soft grazing sunlight sheen
    if (i % 3 === 0) {
      const rGrad = rCtx.createRadialGradient(x, y, 6, x, y, r);
      rGrad.addColorStop(0, 'rgba(150, 150, 150, 0.52)');
      rGrad.addColorStop(1, 'rgba(225, 225, 225, 0)');
      rCtx.fillStyle = rGrad;
      rCtx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  // Subtle stadium mowed turf bands (gives crisp scale & speed perception when racing!)
  for (let x = 0; x < size; x += 64) {
    const even = (x / 64) % 2 === 0;
    ctx.fillStyle = even ? 'rgba(255,255,255,0.032)' : 'rgba(0,0,0,0.042)';
    ctx.fillRect(x, 0, 64, size);
    rCtx.fillStyle = even ? 'rgba(195,195,195,0.22)' : 'rgba(245,245,245,0.22)';
    rCtx.fillRect(x, 0, 64, size);
  }

  // High-frequency organic grass blade micro-strokes + tangent normal ridges
  for (let i = 0; i < 68000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 1.0 + Math.random() * 1.6;
    const h = 2.2 + Math.random() * 4.4;
    const pick = Math.random();
    if (pick > 0.66) {
      ctx.fillStyle = 'rgba(122, 152, 76, 0.22)';
      nCtx.fillStyle = 'rgb(164, 150, 240)';
    } else if (pick > 0.28) {
      ctx.fillStyle = 'rgba(18, 34, 14, 0.28)';
      nCtx.fillStyle = 'rgb(92, 108, 240)';
    } else {
      ctx.fillStyle = 'rgba(146, 130, 84, 0.16)';
      nCtx.fillStyle = 'rgb(142, 106, 244)';
    }
    ctx.fillRect(x, y, w, h);
    nCtx.fillRect(x, y, w, h);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(28, 20);
  map.anisotropy = maxAnisotropy;

  const normalMap = new THREE.CanvasTexture(normCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(28, 20);
  normalMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(28, 20);
  roughnessMap.anisotropy = maxAnisotropy;

  return { map, normalMap, roughnessMap };
};

// Build a single sculpted 3D grass-clump BufferGeometry (3 intersecting tapered blades, 1 draw call via InstancedMesh)
const createGrassTuftGeometry = () => {
  const positions: number[] = [];
  const normals: number[] = [];
  const bladeAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3, Math.PI / 3];

  bladeAngles.forEach((ang, idx) => {
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const halfW = idx === 3 ? 0.55 : 0.72;
    const h = idx === 3 ? 2.4 : 1.75 + (idx % 2) * 0.55;
    const lean = idx === 3 ? 0.22 : 0.48;

    const p0x = -sin * halfW;
    const p0y = cos * halfW;
    const p1x = sin * halfW;
    const p1y = -cos * halfW;
    const tipX = cos * lean;
    const tipY = sin * lean;

    // Front face
    positions.push(p0x, p0y, 0, p1x, p1y, 0, tipX, tipY, h);
    normals.push(cos * 0.2, sin * 0.2, 0.96, cos * 0.2, sin * 0.2, 0.96, 0, 0, 1);
    // Back face for clean double-sided lighting
    positions.push(p1x, p1y, 0, p0x, p0y, 0, tipX, tipY, h);
    normals.push(-cos * 0.2, -sin * 0.2, 0.96, -cos * 0.2, -sin * 0.2, 0.96, 0, 0, 1);
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geo;
};

// Procedural illuminated glass skyscraper facade texture for the Vice Coast skyline
const createSkylineFacadeTexture = (preset: LightingPreset) => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = preset === 'night' ? '#080e1a' : '#1e293b';
  ctx.fillRect(0, 0, 128, 256);

  const isLit = preset === 'night' || preset === 'sunset';
  for (let row = 4; row < 250; row += 10) {
    for (let col = 4; col < 122; col += 12) {
      const litChance = ((row * 31 + col * 17) % 100) / 100;
      if (isLit && litChance > 0.45) {
        ctx.fillStyle =
          litChance > 0.82 ? '#38bdf8' : litChance > 0.62 ? '#fef08a' : '#e2e8f0';
      } else {
        ctx.fillStyle = preset === 'day' ? '#64748b' : '#111827';
      }
      ctx.fillRect(col, row, 8, 6);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
};

// Procedural stadium grandstand spectator crowd & seat rows texture
const createCrowdSeatsTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 256, 128);

  const crowdColors = ['#dc2626', '#f8fafc', '#f59e0b', '#0284c7', '#475569', '#e2e8f0', '#0f172a'];
  for (let row = 0; row < 12; row++) {
    const y = row * 10.5;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, y, 256, 2.5);
    for (let col = 0; col < 52; col++) {
      ctx.fillStyle = crowdColors[(row * 13 + col * 7) % crowdColors.length];
      ctx.fillRect(col * 5 + 0.6, y + 3, 3.6, 6.2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

// Procedural 100m / 50m FIA Braking Distance Board texture
const createBrakeBoardTexture = (label: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 120, 56);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 36px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 34);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

// Procedural Giant Trackside LED Broadcast Jumbotron Screen texture + live updater
const paintJumbotronScreen = (
  ctx: CanvasRenderingContext2D,
  leaderName: string,
  speedKmh: number,
  lap: number,
  drsOrWetLabel: string,
  accentColor: string
) => {
  const grad = ctx.createLinearGradient(0, 0, 256, 128);
  grad.addColorStop(0, '#090d16');
  grad.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);

  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, 0, 256, 18);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`  FIA F1 LIVE  ·  VUELTA ${lap}`, 8, 13);

  ctx.fillStyle = accentColor;
  ctx.font = '900 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(leaderName.slice(0, 14).toUpperCase(), 128, 52);

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 17px monospace';
  ctx.fillText(`${speedKmh} KM/H · ${drsOrWetLabel}`, 128, 86);

  ctx.fillStyle = accentColor;
  ctx.fillRect(22, 104, 212, 8);
};

const createJumbotronSurface = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (ctx) {
    paintJumbotronScreen(ctx, 'DRAW RACE GP', 343, 1, 'DRS LIVE', '#38bdf8');
    texture.needsUpdate = true;
  }
  return { canvas, ctx, texture };
};

// Real-Time Animated GLSL Coastal Marina Ocean Shader (Vice / Monaco GP water with Fresnel sky reflection & sun shimmer)
const CoastalWaterShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorldPos;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uPreset;
    varying vec2 vUv;
    varying vec3 vWorldPos;

    void main() {
      vec2 p = vWorldPos.xy * 0.032;
      float w1 = sin(p.x * 1.9 + uTime * 1.35 + cos(p.y * 1.4 - uTime * 0.9));
      float w2 = sin(p.y * 2.6 - uTime * 1.7 + sin(p.x * 2.1 + uTime * 1.1));
      float w3 = sin((p.x + p.y) * 3.8 + uTime * 2.4);
      float ripple = (w1 + w2 * 0.7 + w3 * 0.4) * 0.35;

      vec3 normal = normalize(vec3(ripple * 0.24, (w2 - w1) * 0.18, 1.0));
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.2);

      vec3 deepCol;
      vec3 shallowCol;
      vec3 skyRefl;
      vec3 sunSpecCol;

      if (uPreset < 0.5) {
        deepCol = vec3(0.03, 0.22, 0.38);
        shallowCol = vec3(0.05, 0.44, 0.56);
        skyRefl = vec3(0.62, 0.82, 0.96);
        sunSpecCol = vec3(1.0, 0.98, 0.90);
      } else if (uPreset < 1.5) {
        deepCol = vec3(0.04, 0.16, 0.28);
        shallowCol = vec3(0.08, 0.30, 0.42);
        skyRefl = vec3(0.88, 0.78, 0.62);
        sunSpecCol = vec3(1.0, 0.90, 0.65);
      } else {
        deepCol = vec3(0.01, 0.04, 0.10);
        shallowCol = vec3(0.02, 0.10, 0.20);
        skyRefl = vec3(0.12, 0.26, 0.44);
        sunSpecCol = vec3(0.45, 0.80, 1.0);
      }

      vec3 col = mix(shallowCol, deepCol, smoothstep(0.0, 0.45, vUv.y));
      col = mix(col, skyRefl, clamp(fresnel * 0.78 + 0.12, 0.0, 0.9));

      // Crisp dancing sun/moonlight specular glints on wave crests
      vec3 sunDir = normalize(vec3(0.65, 0.45, 0.52));
      vec3 halfVec = normalize(sunDir + viewDir);
      float spec = pow(max(dot(normal, halfVec), 0.0), 84.0);
      col += sunSpecCol * spec * (uPreset > 1.5 ? 0.95 : 1.5);

      // Soft shoreline foam line along seawall edge (vUv.y near 0)
      float foamNoise = 0.5 + 0.5 * sin(vWorldPos.x * 0.14 + uTime * 2.2);
      float foam = (1.0 - smoothstep(0.0, 0.038 + foamNoise * 0.015, vUv.y));
      col = mix(col, vec3(0.88, 0.95, 0.98), foam * (uPreset > 1.5 ? 0.25 : 0.65));

      gl_FragColor = vec4(col, 1.0);
    }
  `
};

export const Environment3D: React.FC<Environment3DProps> = ({
  track,
  lightingPreset = 'day',
  weather = 'dry',
  carsStateRef,
  players = []
}) => {
  const { gl } = useThree();
  const maxAnisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  const treesGroupRef = useRef<THREE.Group>(null);
  const flagsGroupRef = useRef<THREE.Group>(null);
  const heliGroupRef = useRef<THREE.Group>(null);
  const heliRotorRef = useRef<THREE.Mesh>(null);
  const heliTailRotorRef = useRef<THREE.Mesh>(null);
  const ferrisWheelRef = useRef<THREE.Group>(null);
  const grassTuftsRef = useRef<THREE.InstancedMesh>(null);
  const crowdFlashesRef = useRef<THREE.InstancedMesh>(null);
  const lastJumbotronUpdateRef = useRef(0);
  const flashDummy = useMemo(() => new THREE.Object3D(), []);

  const waterMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPreset: { value: lightingPreset === 'day' ? 0.0 : lightingPreset === 'sunset' ? 1.0 : 2.0 }
      },
      vertexShader: CoastalWaterShader.vertexShader,
      fragmentShader: CoastalWaterShader.fragmentShader
    });
  }, []);

  useEffect(() => {
    waterMaterial.uniforms.uPreset.value =
      lightingPreset === 'day' ? 0.0 : lightingPreset === 'sunset' ? 1.0 : 2.0;
  }, [lightingPreset, waterMaterial]);

  useEffect(() => {
    return () => {
      waterMaterial.dispose();
    };
  }, [waterMaterial]);

  const {
    grassMaps,
    grassTuftGeo,
    grassTuftInstances,
    crowdFlashAnchors,
    skylineTexture,
    crowdTexture,
    board100Tex,
    board50Tex,
    jumbotronSurface,
    staticTrees,
    staticGrandstands,
    staticDecorations,
    brakeBoards,
    floodlightTowers,
    jumbotrons,
    mountainPeaks,
    skylineTowers,
    marinaYachts
  } = useMemo(() => {
    const terrainMaps = createNaturalTerrainMaps(maxAnisotropy, lightingPreset);
    const tuftGeo = createGrassTuftGeometry();
    const skylineTex = createSkylineFacadeTexture(lightingPreset);
    const crowd = createCrowdSeatsTexture();
    const b100 = createBrakeBoardTexture('100');
    const b50 = createBrakeBoardTexture('50');
    const jumboSurface = createJumbotronSurface();
    const jumbo = jumboSurface.texture;

    // Deterministically scatter ~560 3D organic grass & wildflower tufts across infield & outer countryside
    // Strictly filtered outside asphalt, kerbs & gravel traps via getTrackSurfaceInfo!
    const tuftList: { x: number; y: number; rot: number; sx: number; sz: number; color: string }[] = [];
    const tuftPalette =
      lightingPreset === 'night'
        ? ['#15291a', '#1b3520', '#122216', '#213d24']
        : lightingPreset === 'sunset'
          ? ['#345427', '#426630', '#4f7033', '#616e34', '#2a4620']
          : ['#3b632d', '#4b7836', '#5a8a3e', '#6f8f42', '#2f5224'];
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let attempt = 0; attempt < 2200 && tuftList.length < 560; attempt++) {
      const gx = -120 + rand() * 1040;
      const gy = -40 + rand() * 580;
      const surf = getTrackSurfaceInfo({ x: gx, y: gy }, track);
      // Keep well clear of asphalt, kerbs & gravel runoff
      if (surf.onAsphalt || surf.onCurbOrGrass || surf.distFromCenter < surf.halfWidth + 24) {
        continue;
      }
      // Stay north of coastal seawall (worldY = 500 - gy > -92 => gy < 592)
      if (500 - gy < -88) continue;
      tuftList.push({
        x: gx,
        y: 500 - gy,
        rot: rand() * Math.PI * 2,
        sx: 0.78 + rand() * 0.72,
        sz: 0.72 + rand() * 0.85,
        color: tuftPalette[Math.floor(rand() * tuftPalette.length)]
      });
    }

    const isNightOrSunset = lightingPreset === 'night' || lightingPreset === 'sunset';

    // 1. Multi-Cluster Realistic Organic Trees (Pines, Mediterranean Oaks & Arched Vice Palm Trees)
    const trees = (track.trees || []).map((tree, idx) => {
      const isPine = tree.type === 'pine';
      const isPalm = idx % 3 === 0;
      const scaleVar = 0.88 + ((idx * 17) % 30) / 100;
      const rotZ = ((idx * 53) % 360) * (Math.PI / 180);
      const sz = tree.size * scaleVar;

      return (
        <group key={`tree-${idx}`} position={[tree.x, 500 - tree.y, 0]} rotation={[0, 0, rotZ]}>
          <mesh position={[0, 0, 0.08]}>
            <circleGeometry args={[sz * 0.5, 12]} />
            <meshBasicMaterial color="#0a1409" transparent opacity={0.42} depthWrite={false} />
          </mesh>
          <mesh
            position={[0, 0, sz * (isPalm ? 0.4 : 0.24)]}
            rotation={[Math.PI / 2, isPalm ? 0.08 : 0, 0]}
            castShadow
            receiveShadow
          >
            <cylinderGeometry
              args={[sz * (isPalm ? 0.042 : 0.06), sz * (isPalm ? 0.09 : 0.11), sz * (isPalm ? 0.8 : 0.48), 7]}
            />
            <meshStandardMaterial color={isPalm ? '#634832' : '#4a3322'} roughness={0.94} />
          </mesh>

          {isPalm ? (
            /* GTA VI Vice Coast Arched 3-Segment Palm Frond Crown + Coconuts */
            <group position={[sz * 0.04, 0, sz * 0.8]}>
              {[0, 1, 2].map((cIdx) => {
                const cAng = (cIdx / 3) * Math.PI * 2;
                return (
                  <mesh
                    key={`coco-${cIdx}`}
                    position={[Math.cos(cAng) * sz * 0.06, Math.sin(cAng) * sz * 0.06, -sz * 0.05]}
                  >
                    <sphereGeometry args={[sz * 0.048, 6, 6]} />
                    <meshStandardMaterial color="#5c3d1e" roughness={0.86} />
                  </mesh>
                );
              })}
              {[0, 1, 2, 3, 4, 5, 6, 7].map((fIdx) => {
                const fAng = (fIdx / 8) * Math.PI * 2;
                const upper = fIdx % 2 === 0;
                return (
                  <group key={`frond-${fIdx}`} rotation={[0, 0, fAng]}>
                    <mesh
                      position={[sz * 0.18, 0, upper ? sz * 0.04 : -sz * 0.02]}
                      rotation={[0, upper ? 0.18 : 0.34, 0]}
                      castShadow
                    >
                      <boxGeometry args={[sz * 0.38, sz * 0.13, 0.12]} />
                      <meshStandardMaterial color={upper ? '#3d833a' : '#2d682d'} roughness={0.74} />
                    </mesh>
                    <mesh
                      position={[sz * 0.42, 0, upper ? -sz * 0.08 : -sz * 0.16]}
                      rotation={[0, upper ? 0.62 : 0.78, 0]}
                      castShadow
                    >
                      <boxGeometry args={[sz * 0.28, sz * 0.095, 0.09]} />
                      <meshStandardMaterial color={upper ? '#4a9442' : '#357433'} roughness={0.76} />
                    </mesh>
                    <mesh
                      position={[sz * 0.56, 0, upper ? -sz * 0.24 : -sz * 0.32]}
                      rotation={[0, 1.08, 0]}
                    >
                      <boxGeometry args={[sz * 0.18, sz * 0.055, 0.07]} />
                      <meshStandardMaterial color="#539e48" roughness={0.78} />
                    </mesh>
                  </group>
                );
              })}
            </group>
          ) : isPine ? (
            <group position={[0, 0, sz * 0.44]}>
              <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
                <coneGeometry args={[sz * 0.44, sz * 0.62, 8]} />
                <meshStandardMaterial color="#1b3a22" roughness={0.88} />
              </mesh>
              <mesh position={[0, 0, sz * 0.28]} rotation={[Math.PI / 2, 0, 0.4]} castShadow receiveShadow>
                <coneGeometry args={[sz * 0.35, sz * 0.52, 8]} />
                <meshStandardMaterial color="#244b2a" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0, sz * 0.52]} rotation={[Math.PI / 2, 0, 0.8]} castShadow>
                <coneGeometry args={[sz * 0.24, sz * 0.42, 8]} />
                <meshStandardMaterial color="#316136" roughness={0.82} />
              </mesh>
              <mesh position={[0, 0, sz * 0.70]} rotation={[Math.PI / 2, 0, 1.2]} castShadow>
                <coneGeometry args={[sz * 0.13, sz * 0.28, 7]} />
                <meshStandardMaterial color="#3d733f" roughness={0.80} />
              </mesh>
            </group>
          ) : (
            /* Sculpted Multi-Lobe Mediterranean Oak Canopy with Sunlit Crown & Shaded Understory */
            <group position={[0, 0, sz * 0.46]}>
              {/* Deep Shaded Lower Understory Boughs */}
              <mesh position={[-sz * 0.14, -sz * 0.12, -sz * 0.04]} scale={[1.15, 1.05, 0.78]} castShadow receiveShadow>
                <dodecahedronGeometry args={[sz * 0.26, 1]} />
                <meshStandardMaterial color="#1f3b1d" roughness={0.92} flatShading />
              </mesh>
              <mesh position={[sz * 0.15, sz * 0.11, -sz * 0.02]} scale={[1.1, 1.0, 0.80]} castShadow receiveShadow>
                <dodecahedronGeometry args={[sz * 0.25, 1]} />
                <meshStandardMaterial color="#254422" roughness={0.90} flatShading />
              </mesh>
              {/* Mid-Tier Asymmetric Foliage Lobes */}
              <mesh position={[-sz * 0.18, sz * 0.14, sz * 0.12]} scale={[1.05, 1.12, 0.88]} castShadow receiveShadow>
                <dodecahedronGeometry args={[sz * 0.23, 1]} />
                <meshStandardMaterial color="#31582a" roughness={0.86} flatShading />
              </mesh>
              <mesh position={[sz * 0.18, -sz * 0.12, sz * 0.14]} scale={[1.12, 0.96, 0.86]} castShadow receiveShadow>
                <dodecahedronGeometry args={[sz * 0.24, 1]} />
                <meshStandardMaterial color="#3b6730" roughness={0.84} flatShading />
              </mesh>
              <mesh position={[0, -sz * 0.16, sz * 0.16]} scale={[1.0, 1.08, 0.84]} castShadow>
                <dodecahedronGeometry args={[sz * 0.21, 1]} />
                <meshStandardMaterial color="#457435" roughness={0.83} flatShading />
              </mesh>
              {/* Sunlit Warm-Olive Upper Crown */}
              <mesh position={[sz * 0.05, sz * 0.06, sz * 0.28]} scale={[1.06, 0.98, 0.82]} castShadow>
                <dodecahedronGeometry args={[sz * 0.20, 1]} />
                <meshStandardMaterial color="#55843c" roughness={0.80} flatShading />
              </mesh>
            </group>
          )}
        </group>
      );
    });

    // 2. Architectural F1 Terraced Grandstands & Pit Complex with Cantilever Canopies & Illuminated VIP Lounges
    const grandstands = (track.grandstands || []).map((gs, idx) => {
      const isPitBuilding = idx === 0;
      return (
        <group key={`gs-${idx}`} position={[gs.x, 500 - gs.y, 0]} rotation={[0, 0, -gs.angle]}>
          <mesh position={[0, 0, 0.4]} receiveShadow>
            <boxGeometry args={[gs.width + 8, gs.height + 6, 0.8]} />
            <meshStandardMaterial color="#475569" roughness={0.88} />
          </mesh>

          {isPitBuilding ? (
            <group>
              <mesh position={[0, 0, 4.2]} castShadow receiveShadow>
                <boxGeometry args={[gs.width, gs.height * 0.85, 7.6]} />
                <meshStandardMaterial color="#e2e8f0" roughness={0.48} metalness={0.18} />
              </mesh>
              {[-0.36, -0.18, 0, 0.18, 0.36].map((frac, bayIdx) => (
                <mesh
                  key={`bay-${bayIdx}`}
                  position={[gs.width * frac, -gs.height * 0.43, 2.2]}
                >
                  <boxGeometry args={[gs.width * 0.13, 0.5, 3.6]} />
                  <meshStandardMaterial
                    color="#0f172a"
                    emissive={isNightOrSunset ? '#fbbf24' : '#000000'}
                    emissiveIntensity={isNightOrSunset ? 1.5 : 0}
                    roughness={0.6}
                  />
                </mesh>
              ))}
              {/* Upper Paddock Club Panoramic Tinted Glass Ribbon */}
              <mesh position={[0, -gs.height * 0.43, 6.0]}>
                <boxGeometry args={[gs.width * 0.94, 0.4, 2.2]} />
                <meshPhysicalMaterial
                  color="#0f2942"
                  emissive={isNightOrSunset ? '#38bdf8' : '#000000'}
                  emissiveIntensity={isNightOrSunset ? 1.05 : 0}
                  roughness={0.05}
                  metalness={0.90}
                  clearcoat={1.0}
                />
              </mesh>
              <mesh position={[0, 0, 8.25]} castShadow>
                <boxGeometry args={[gs.width + 1.5, gs.height * 0.92, 0.65]} />
                <meshStandardMaterial color="#334155" roughness={0.32} metalness={0.48} />
              </mesh>
              {/* Race Control Glass Tower */}
              <mesh position={[gs.width * 0.42, 0, 12.2]} castShadow>
                <boxGeometry args={[12, 10, 7.5]} />
                <meshPhysicalMaterial
                  color="#1e293b"
                  roughness={0.08}
                  metalness={0.85}
                  clearcoat={1.0}
                />
              </mesh>
            </group>
          ) : (
            <group>
              <mesh position={[0, gs.height * 0.38, 4.5]} castShadow receiveShadow>
                <boxGeometry args={[gs.width, 2.0, 9.0]} />
                <meshStandardMaterial color="#64748b" roughness={0.78} />
              </mesh>
              <mesh position={[0, 0, 3.8]} rotation={[0.42, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[gs.width - 1, gs.height * 0.95, 1.4]} />
                <meshStandardMaterial map={crowd} roughness={0.85} />
              </mesh>
              {[-0.45, -0.15, 0.15, 0.45].map((frac, pIdx) => (
                <mesh key={`pillar-${pIdx}`} position={[gs.width * frac, gs.height * 0.36, 10.5]} castShadow>
                  <boxGeometry args={[1.0, 1.0, 6.2]} />
                  <meshStandardMaterial color="#94a3b8" roughness={0.30} metalness={0.80} />
                </mesh>
              ))}
              <mesh position={[0, -0.6, 13.4]} rotation={[0.14, 0, 0]} castShadow receiveShadow>
                <boxGeometry args={[gs.width + 3, gs.height + 3.5, 0.65]} />
                <meshStandardMaterial color="#f1f5f9" roughness={0.30} metalness={0.40} />
              </mesh>
              <mesh position={[0, -gs.height * 0.45, 12.8]}>
                <boxGeometry args={[gs.width, 0.45, 0.3]} />
                <meshStandardMaterial
                  color="#fffbeb"
                  emissive="#fffbeb"
                  emissiveIntensity={isNightOrSunset ? 4.8 : 0.6}
                />
              </mesh>
              <mesh position={[0, -gs.height * 0.56, 12.6]}>
                <boxGeometry args={[gs.width + 3, 0.4, 1.1]} />
                <meshStandardMaterial color="#0284c7" roughness={0.35} />
              </mesh>
            </group>
          )}
        </group>
      );
    });

    // 3. FIA Braking Boards, Stadium Floodlight Towers (+ Volumetric Light Cones!) & Giant LED Jumbotrons
    const banking = getTrackBankingProfile(track);
    const outer = track.outerBoundary;
    const inner = track.innerBoundary;
    const len = Math.min(outer.length, inner.length);
    const boards: React.ReactNode[] = [];
    const towers: React.ReactNode[] = [];
    const screens: React.ReactNode[] = [];
    let lastBoardIdx = -99;

    for (let i = 0; i < len; i++) {
      const prevCurv = banking[(i - 2 + len) % len].curvature;
      const currCurv = banking[i].curvature;
      if (currCurv > 0.0068 && prevCurv <= 0.0052 && i - lastBoardIdx > 12) {
        lastBoardIdx = i;
        const placeBoard = (offsetSteps: number, label: '100' | '50') => {
          const bIdx = (i - offsetSteps + len) % len;
          const nIdx = (bIdx + 1) % len;
          const oPt = outer[bIdx];
          const iPt = inner[bIdx];
          const dx = oPt.x - iPt.x;
          const dy = oPt.y - iPt.y;
          const dLen = Math.hypot(dx, dy) || 1;
          const bx = oPt.x + (dx / dLen) * 7.5;
          const by = oPt.y + (dy / dLen) * 7.5;
          const heading = Math.atan2(outer[nIdx].y - oPt.y, outer[nIdx].x - oPt.x);

          boards.push(
            <group
              key={`brake-board-${i}-${label}`}
              position={[bx, 500 - by, 2.1]}
              rotation={[0, 0, -heading + Math.PI / 2]}
            >
              <mesh castShadow>
                <boxGeometry args={[4.2, 0.35, 2.4]} />
                <meshStandardMaterial map={label === '100' ? b100 : b50} roughness={0.45} />
              </mesh>
            </group>
          );
        };
        placeBoard(3, '100');
        placeBoard(1, '50');
      }

      if (i % 14 === 0) {
        const oPt = outer[i];
        const iPt = inner[i];
        const dx = oPt.x - iPt.x;
        const dy = oPt.y - iPt.y;
        const dLen = Math.hypot(dx, dy) || 1;
        const tx = oPt.x + (dx / dLen) * 34;
        const ty = oPt.y + (dy / dLen) * 34;
        const aimAngle = Math.atan2(iPt.y - oPt.y, iPt.x - oPt.x);

        towers.push(
          <group
            key={`floodlight-tower-${i}`}
            position={[tx, 500 - ty, 0]}
            rotation={[0, 0, -aimAngle]}
          >
            <mesh position={[0, 0, 16]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.45, 0.9, 32, 6]} />
              <meshStandardMaterial color="#475569" roughness={0.38} metalness={0.82} />
            </mesh>
            <group position={[1.8, 0, 31.5]} rotation={[0, 0.45, 0]}>
              <mesh castShadow>
                <boxGeometry args={[1.4, 7.8, 3.2]} />
                <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.7} />
              </mesh>
              <mesh position={[0.76, 0, 0]}>
                <boxGeometry args={[0.15, 7.2, 2.6]} />
                <meshStandardMaterial
                  color="#fffbeb"
                  emissive={lightingPreset === 'night' ? '#e0f2fe' : '#fef3c7'}
                  emissiveIntensity={
                    lightingPreset === 'night' ? 9.5 : lightingPreset === 'sunset' ? 5.8 : 1.0
                  }
                />
              </mesh>
              {/* Volumetric Atmospheric Light Beam Cone in Night & Sunset GP */}
              {isNightOrSunset && (
                <mesh position={[20, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <coneGeometry args={[14.5, 42, 16, 1, true]} />
                  <meshBasicMaterial
                    color={lightingPreset === 'night' ? '#bae6fd' : '#fef3c7'}
                    transparent
                    opacity={lightingPreset === 'night' ? 0.085 : 0.04}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              )}
            </group>
          </group>
        );
      }

      // Giant Trackside LED Broadcast Jumbotron Screens
      if (i === 10 || i === Math.floor(len * 0.42) || i === Math.floor(len * 0.76)) {
        const oPt = outer[i];
        const iPt = inner[i];
        const dx = oPt.x - iPt.x;
        const dy = oPt.y - iPt.y;
        const dLen = Math.hypot(dx, dy) || 1;
        const sx = oPt.x + (dx / dLen) * 28;
        const sy = oPt.y + (dy / dLen) * 28;
        const aimAngle = Math.atan2(iPt.y - oPt.y, iPt.x - oPt.x);

        screens.push(
          <group
            key={`jumbotron-${i}`}
            position={[sx, 500 - sy, 0]}
            rotation={[0, 0, -aimAngle]}
          >
            <mesh position={[0, -5.5, 5.5]} castShadow>
              <boxGeometry args={[1.2, 1.2, 11]} />
              <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.75} />
            </mesh>
            <mesh position={[0, 5.5, 5.5]} castShadow>
              <boxGeometry args={[1.2, 1.2, 11]} />
              <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.75} />
            </mesh>
            <mesh position={[0, 0, 12.8]} castShadow>
              <boxGeometry args={[1.5, 19.5, 9.6]} />
              <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.6} />
            </mesh>
            <mesh position={[0.8, 0, 12.8]}>
              <boxGeometry args={[0.1, 18.2, 8.6]} />
              <meshStandardMaterial
                map={jumbo}
                emissiveMap={jumbo}
                emissive="#ffffff"
                emissiveIntensity={isNightOrSunset ? 1.95 : 0.8}
                roughness={0.2}
              />
            </mesh>
          </group>
        );
      }
    }

    // 4. Multi-Layered Sculpted Alpine Horizon Mountain Range (Granite Ridges + Snow Caps + Forested Foothills)
    const peaks: React.ReactNode[] = [];
    const mountainRingCount = 30;
    for (let m = 0; m < mountainRingCount; m++) {
      const ang = (m / mountainRingCount) * Math.PI * 2;
      // Leave coastal ocean opening along the south-east arc for the shimmering marina bay!
      if (ang > 4.15 && ang < 5.65) continue;
      const dist = 920 + ((m * 137) % 280);
      const mx = 400 + Math.cos(ang) * dist;
      const my = 250 + Math.sin(ang) * (dist * 0.85);
      const radius = 155 + ((m * 73) % 135);
      const height = 150 + ((m * 89) % 185);
      const hasSnowCap = height > 235;
      const foothillDist = dist - 220;
      const fx = 400 + Math.cos(ang + 0.05) * foothillDist;
      const fy = 250 + Math.sin(ang + 0.05) * (foothillDist * 0.85);

      peaks.push(
        <group key={`mountain-peak-${m}`}>
          {/* Main Alpine Massif */}
          <mesh
            position={[mx, my, height * 0.42 - 12]}
            rotation={[Math.PI / 2, (m * 0.7) % Math.PI, 0]}
          >
            <coneGeometry args={[radius, height, 7]} />
            <meshStandardMaterial
              color={
                lightingPreset === 'sunset'
                  ? '#334155'
                  : lightingPreset === 'night'
                    ? '#0f172a'
                    : '#364938'
              }
              roughness={0.93}
              metalness={0.05}
              flatShading
            />
          </mesh>
          {/* Upper Granite / Snow Summit Cap */}
          {hasSnowCap && (
            <mesh
              position={[mx, my, height * 0.74 - 10]}
              rotation={[Math.PI / 2, (m * 0.7) % Math.PI, 0]}
            >
              <coneGeometry args={[radius * 0.36, height * 0.36, 7]} />
              <meshStandardMaterial
                color={
                  lightingPreset === 'sunset'
                    ? '#fed7aa'
                    : lightingPreset === 'night'
                      ? '#475569'
                      : '#e2e8f0'
                }
                roughness={0.78}
                flatShading
              />
            </mesh>
          )}
          {/* Forested Mid-Distance Foothill Ridge */}
          <mesh
            position={[fx, fy, height * 0.18 - 10]}
            rotation={[Math.PI / 2, (m * 1.1) % Math.PI, 0]}
          >
            <dodecahedronGeometry args={[radius * 0.56, 1]} />
            <meshStandardMaterial
              color={
                lightingPreset === 'sunset'
                  ? '#293b2b'
                  : lightingPreset === 'night'
                    ? '#0b1710'
                    : '#2b4728'
              }
              roughness={0.95}
              flatShading
            />
          </mesh>
        </group>
      );
    }

    // 5. Distant Vice / Miami / Monte-Carlo Glass High-Rise Skyline along the North-East Coastal Ridge
    const skyline: React.ReactNode[] = [];
    for (let s = 0; s < 18; s++) {
      const bx = 520 + s * 44 + ((s * 29) % 24);
      const by = 690 + ((s * 53) % 90);
      const bw = 20 + ((s * 19) % 22);
      const bd = 18 + ((s * 13) % 16);
      const bh = 68 + ((s * 47) % 140);
      skyline.push(
        <group key={`skyline-bldg-${s}`} position={[bx, by, bh * 0.5]}>
          <mesh>
            <boxGeometry args={[bw, bd, bh]} />
            <meshPhysicalMaterial
              map={skylineTex}
              emissiveMap={isNightOrSunset ? skylineTex : undefined}
              emissive={isNightOrSunset ? '#ffffff' : '#000000'}
              emissiveIntensity={lightingPreset === 'night' ? 1.15 : lightingPreset === 'sunset' ? 0.55 : 0}
              roughness={0.18}
              metalness={0.78}
              clearcoat={0.8}
            />
          </mesh>
          {/* Rooftop Aviation Beacon LED */}
          <mesh position={[0, 0, bh * 0.5 + 1.2]}>
            <sphereGeometry args={[1.1, 6, 6]} />
            <meshStandardMaterial
              color="#f43f5e"
              emissive="#ff1e42"
              emissiveIntensity={isNightOrSunset ? 8.0 : 1.0}
            />
          </mesh>
        </group>
      );
    }

    // 6. Luxury Monaco / Port Hercule Marina Superyachts moored in the Southern Coastal Bay
    const yachts: React.ReactNode[] = [
      { x: 110, y: -150, rot: 0.16, scale: 1.1 },
      { x: 225, y: -162, rot: 0.22, scale: 1.2 },
      { x: 355, y: -178, rot: -0.14, scale: 1.38 },
      { x: 495, y: -162, rot: 0.28, scale: 1.15 },
      { x: 625, y: -182, rot: -0.22, scale: 1.28 },
      { x: 745, y: -168, rot: 0.12, scale: 1.18 }
    ].map((y, idx) => (
      <group
        key={`yacht-${idx}`}
        position={[y.x, y.y, 1.2]}
        rotation={[0, 0, y.rot]}
        scale={y.scale}
      >
        {/* Sleek White Hull */}
        <mesh castShadow>
          <boxGeometry args={[28, 7.2, 3.0]} />
          <meshPhysicalMaterial color="#f8fafc" roughness={0.15} metalness={0.2} clearcoat={1.0} />
        </mesh>
        {/* Underwater Turquoise Accent & Teak Foredeck */}
        <mesh position={[5, 0, 1.6]}>
          <boxGeometry args={[16, 6.2, 0.3]} />
          <meshStandardMaterial color="#a16207" roughness={0.7} />
        </mesh>
        {/* Tinted Glass Superstructure Cabin */}
        <mesh position={[-3.5, 0, 3.3]} castShadow>
          <boxGeometry args={[13, 5.4, 2.8]} />
          <meshPhysicalMaterial
            color="#0f172a"
            emissive={isNightOrSunset ? '#38bdf8' : '#000000'}
            emissiveIntensity={isNightOrSunset ? 0.95 : 0}
            roughness={0.08}
            metalness={0.85}
            clearcoat={1.0}
          />
        </mesh>
        {/* Upper Sun Deck & Radar Mast */}
        <mesh position={[-4.5, 0, 5.0]}>
          <boxGeometry args={[9.5, 4.4, 0.5]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.25} />
        </mesh>
        <mesh position={[-5.2, 0, 6.6]}>
          <boxGeometry args={[1.4, 2.8, 2.6]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.3} />
        </mesh>
      </group>
    ));

    // 7. Hospitality Tents & FIA Trackside Flags
    const decorations = (track.decorations || []).map((dec, idx) => {
      if (dec.type === 'tent') {
        return (
          <group key={`dec-tent-${idx}`} position={[dec.x, 500 - dec.y, 0]}>
            <mesh position={[0, 0, 1.5]} castShadow receiveShadow>
              <boxGeometry args={[7.2, 7.2, 3.0]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.75} />
            </mesh>
            <mesh position={[0, 0, 4.2]} rotation={[Math.PI / 2, Math.PI / 4, 0]} castShadow>
              <coneGeometry args={[5.6, 3.0, 4]} />
              <meshStandardMaterial color={dec.color} roughness={0.68} />
            </mesh>
          </group>
        );
      } else if (dec.type === 'flag') {
        return (
          <group key={`dec-flag-${idx}`} position={[dec.x, 500 - dec.y, 0]}>
            <mesh position={[0, 0, 5.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.16, 0.22, 11, 6]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.22} />
            </mesh>
            <mesh name="banner" position={[2.2, 0, 9.8]} rotation={[Math.PI / 2, 0, 0]}>
              <boxGeometry args={[4.2, 2.0, 0.08]} />
              <meshStandardMaterial color={dec.color} roughness={0.75} />
            </mesh>
          </group>
        );
      }
      return null;
    });

    // 8. Spectator Camera Flash Anchors across all Terraced Grandstands
    const flashAnchors: { x: number; y: number; z: number; phase: number }[] = [];
    (track.grandstands || []).forEach((gs, gIdx) => {
      if (gIdx === 0) return; // skip pit building
      const cosA = Math.cos(-gs.angle);
      const sinA = Math.sin(-gs.angle);
      for (let f = 0; f < 14; f++) {
        const lx = ((f / 13) - 0.5) * (gs.width - 4);
        const ly = (((f * 7) % 11) / 10 - 0.5) * (gs.height * 0.7);
        const wx = gs.x + lx * cosA - ly * sinA;
        const wy = (500 - gs.y) + lx * sinA + ly * cosA;
        flashAnchors.push({
          x: wx,
          y: wy,
          z: 5.2 + ((f * 3) % 5) * 0.75,
          phase: gIdx * 17.3 + f * 11.7
        });
      }
    });

    return {
      grassMaps: terrainMaps,
      grassTuftGeo: tuftGeo,
      grassTuftInstances: tuftList,
      crowdFlashAnchors: flashAnchors,
      skylineTexture: skylineTex,
      crowdTexture: crowd,
      board100Tex: b100,
      board50Tex: b50,
      jumbotronSurface: jumboSurface,
      staticTrees: trees,
      staticGrandstands: grandstands,
      staticDecorations: decorations,
      brakeBoards: boards,
      floodlightTowers: towers,
      jumbotrons: screens,
      mountainPeaks: peaks,
      skylineTowers: skyline,
      marinaYachts: yachts
    };
  }, [track, maxAnisotropy, lightingPreset]);

  // Populate single-draw-call 3D InstancedMesh grass tufts across countryside & infield
  useEffect(() => {
    const mesh = grassTuftsRef.current;
    if (!mesh || grassTuftInstances.length === 0) return;

    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    mesh.count = grassTuftInstances.length;

    grassTuftInstances.forEach((t, idx) => {
      dummy.position.set(t.x, t.y, -0.2);
      dummy.rotation.set(0, 0, t.rot);
      dummy.scale.set(t.sx, t.sx, t.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      col.set(t.color);
      mesh.setColorAt(idx, col);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [grassTuftInstances]);

  useEffect(() => {
    return () => {
      grassMaps.map.dispose();
      grassMaps.normalMap.dispose();
      grassMaps.roughnessMap.dispose();
      grassTuftGeo.dispose();
      skylineTexture.dispose();
      crowdTexture.dispose();
      board100Tex.dispose();
      board50Tex.dispose();
      jumbotronSurface.texture.dispose();
    };
  }, [
    grassMaps,
    grassTuftGeo,
    skylineTexture,
    crowdTexture,
    board100Tex,
    board50Tex,
    jumbotronSurface
  ]);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();
    waterMaterial.uniforms.uTime.value = elapsed;

    // Live Telemetry Jumbotron update (~3Hz) showing P1 race leader, speed in km/h, lap, and DRS / WET status
    if (elapsed - lastJumbotronUpdateRef.current > 0.35 && jumbotronSurface.ctx) {
      lastJumbotronUpdateRef.current = elapsed;
      const cars = carsStateRef?.current;
      if (cars && cars.length > 0) {
        let leader = cars[0];
        for (let i = 1; i < cars.length; i++) {
          const c = cars[i];
          if (!c.disqualified && (c.lap > leader.lap || (c.lap === leader.lap && c.targetIndex > leader.targetIndex))) {
            leader = c;
          }
        }
        const leaderPlayer = players.find((p) => p.id === leader.playerId);
        const speedKmh = Math.min(372, Math.round(Math.hypot(leader.vx, leader.vy) * 41.5));
        const statusBadge =
          weather === 'rain' ? 'WET GP' : leader.drsActive ? 'DRS ON' : 'P1 LIVE';
        paintJumbotronScreen(
          jumbotronSurface.ctx,
          leaderPlayer ? `P1 ${leaderPlayer.name}` : 'P1 LEADER',
          speedKmh,
          Math.max(1, leader.lap),
          statusBadge,
          leaderPlayer?.color || '#38bdf8'
        );
        jumbotronSurface.texture.needsUpdate = true;
      } else {
        paintJumbotronScreen(
          jumbotronSurface.ctx,
          track.name.split('–')[0].trim(),
          345,
          1,
          weather === 'rain' ? 'WET GP' : 'FIA GP',
          '#38bdf8'
        );
        jumbotronSurface.texture.needsUpdate = true;
      }
    }

    // Animate Grandstand Spectator Camera Flash Bursts
    if (crowdFlashesRef.current && crowdFlashAnchors.length > 0) {
      const fMesh = crowdFlashesRef.current;
      fMesh.count = crowdFlashAnchors.length;
      for (let i = 0; i < crowdFlashAnchors.length; i++) {
        const a = crowdFlashAnchors[i];
        const pulse = Math.sin(elapsed * 9.5 + a.phase) * Math.cos(elapsed * 14.2 + a.phase * 1.7);
        const isFlashing = pulse > 0.88;
        flashDummy.position.set(a.x, a.y, isFlashing ? a.z : -500);
        const s = isFlashing ? 0.55 + (pulse - 0.88) * 6.5 : 0.001;
        flashDummy.scale.setScalar(s);
        flashDummy.updateMatrix();
        fMesh.setMatrixAt(i, flashDummy.matrix);
      }
      fMesh.instanceMatrix.needsUpdate = true;
    }

    if (treesGroupRef.current) {
      treesGroupRef.current.children.forEach((treeGroup, index) => {
        const sway = Math.sin(elapsed * 1.8 + index * 0.5) * 0.014;
        const swayZ = Math.cos(elapsed * 1.3 + index * 0.3) * 0.012;
        treeGroup.rotation.x = sway;
        treeGroup.rotation.y = swayZ;
      });
    }

    if (flagsGroupRef.current) {
      flagsGroupRef.current.children.forEach((flagGroup, index) => {
        const banner = flagGroup.getObjectByName('banner');
        if (banner) {
          banner.rotation.z = Math.sin(elapsed * 5.0 + index * 1.4) * 0.11;
        }
      });
    }

    if (heliGroupRef.current) {
      const hAng = elapsed * 0.22;
      const hx = 400 + Math.cos(hAng) * 280;
      const hy = 250 + Math.sin(hAng) * 195;
      heliGroupRef.current.position.set(hx, hy, 78 + Math.sin(elapsed * 1.5) * 2.5);
      heliGroupRef.current.rotation.z = hAng + Math.PI / 2;
    }
    if (heliRotorRef.current) {
      heliRotorRef.current.rotation.z = elapsed * 32;
    }
    if (heliTailRotorRef.current) {
      heliTailRotorRef.current.rotation.y = elapsed * 46;
    }
    if (ferrisWheelRef.current) {
      ferrisWheelRef.current.rotation.y = elapsed * 0.18;
    }
  });

  const isNightOrSunset = lightingPreset === 'night' || lightingPreset === 'sunset';
  const showHeliBeam = isNightOrSunset || weather === 'rain';

  return (
    <group>
      {/* Expansive Next-Gen 1024px PBR Circuit Countryside Terrain (Albedo + Normal Relief + Dew Roughness) */}
      <mesh position={[400, 320, -0.24]} receiveShadow>
        <planeGeometry args={[3800, 2600]} />
        <meshStandardMaterial
          map={grassMaps.map}
          normalMap={grassMaps.normalMap}
          normalScale={_grassNormalScale}
          roughnessMap={grassMaps.roughnessMap}
          roughness={0.94}
          metalness={0.02}
        />
      </mesh>

      {/* Single-Draw-Call 3D Instanced Trackside Grass & Turf Clumps */}
      <instancedMesh
        ref={grassTuftsRef}
        args={[grassTuftGeo, undefined, Math.max(1, grassTuftInstances.length)]}
        receiveShadow
      >
        <meshStandardMaterial roughness={0.86} metalness={0.02} />
      </instancedMesh>

      {/* Coastal Seawall Promenade separating the Autodrome from the Marina Ocean Bay */}
      <mesh position={[400, -104, 0.9]} receiveShadow castShadow>
        <boxGeometry args={[2800, 10, 2.6]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.72} metalness={0.1} />
      </mesh>

      {/* Animated Shimmering Coastal Marina Ocean Bay (Monaco / Vice GP Harbor!) */}
      <mesh position={[400, -560, -0.15]} material={waterMaterial}>
        <planeGeometry args={[3600, 920]} />
      </mesh>

      {/* Luxury GP Marina Superyachts */}
      {marinaYachts}

      {/* Harbor Breakwater Pier & Red/White Port Hercule Marina Lighthouse */}
      <group position={[810, -135, 0]}>
        <mesh position={[-55, 18, 0.9]} receiveShadow castShadow>
          <boxGeometry args={[130, 8, 2.4]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.78} />
        </mesh>
        <mesh position={[0, 0, 9]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[2.2, 3.4, 18, 16]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.35} />
        </mesh>
        <mesh position={[0, 0, 14]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[2.35, 2.65, 4.5, 16]} />
          <meshStandardMaterial color="#dc2626" roughness={0.35} />
        </mesh>
        <mesh position={[0, 0, 19.2]}>
          <sphereGeometry args={[1.9, 12, 12]} />
          <meshStandardMaterial
            color="#fef08a"
            emissive="#facc15"
            emissiveIntensity={isNightOrSunset ? 7.5 : 1.5}
          />
        </mesh>
      </group>

      {/* F1 Team Paddock Village Motorhomes & Broadcast Satellite Compounds */}
      <group position={[110, 476, 0]}>
        <mesh position={[0, 0, 3.6]} castShadow receiveShadow>
          <boxGeometry args={[36, 12, 7.2]} />
          <meshPhysicalMaterial color="#0f172a" roughness={0.2} metalness={0.75} clearcoat={0.9} />
        </mesh>
        <mesh position={[0, -6.1, 5.2]}>
          <boxGeometry args={[34, 0.4, 0.7]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={3.0} />
        </mesh>
        <mesh position={[28, 0, 2.8]} castShadow receiveShadow>
          <boxGeometry args={[16, 8, 5.6]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.35} metalness={0.3} />
        </mesh>
      </group>

      <group position={[685, 476, 0]}>
        <mesh position={[0, 0, 3.6]} castShadow receiveShadow>
          <boxGeometry args={[34, 12, 7.2]} />
          <meshPhysicalMaterial color="#1e293b" roughness={0.2} metalness={0.75} clearcoat={0.9} />
        </mesh>
        <mesh position={[0, -6.1, 5.2]}>
          <boxGeometry args={[32, 0.4, 0.7]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={3.0} />
        </mesh>
      </group>

      {/* CIRCUIT-SPECIFIC REAL-WORLD 3D ARCHITECTURAL LANDMARKS */}
      {track.id === 'jarama' && (
        /* Iconic Torre del Jarama – RACE (Madrid): Cylindrical White Tower with Red/Gold Observation Decks + Paddock Control Building */
        <group position={[315, 265, 0]}>
          {/* Adjacent RACE Paddock Control Wing */}
          <mesh position={[-38, 4, 4.2]} castShadow receiveShadow>
            <boxGeometry args={[42, 18, 8.4]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.42} metalness={0.15} />
          </mesh>
          <mesh position={[-38, -5.2, 6.2]}>
            <boxGeometry args={[40, 0.6, 1.4]} />
            <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={1.6} />
          </mesh>
          {/* Reinforced Concrete Base Podium */}
          <mesh position={[0, 0, 2.5]} castShadow receiveShadow>
            <cylinderGeometry args={[14, 16, 5, 20]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.55} />
          </mesh>
          {/* Main White Cylindrical Control Tower Shaft */}
          <mesh position={[0, 0, 19]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[6.2, 7.0, 32, 24]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.35} metalness={0.1} />
          </mesh>
          {/* Lower Observation Glass Deck & RACE Red Ring */}
          <mesh position={[0, 0, 24]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[10.5, 9.8, 3.2, 24]} />
            <meshStandardMaterial color="#dc2626" roughness={0.3} metalness={0.25} />
          </mesh>
          <mesh position={[0, 0, 27.2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[10.0, 10.0, 3.4, 24]} />
            <meshPhysicalMaterial
              color="#0f172a"
              emissive={isNightOrSunset ? '#fbbf24' : '#38bdf8'}
              emissiveIntensity={isNightOrSunset ? 1.8 : 0.35}
              roughness={0.08}
              metalness={0.9}
              clearcoat={1.0}
            />
          </mesh>
          {/* Upper VIP Timing Crown & Helipad Roof */}
          <mesh position={[0, 0, 31.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[11.4, 10.5, 2.6, 24]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, 33.0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[8.5, 8.5, 1.2, 24]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.35} metalness={0.4} />
          </mesh>
          {/* Rooftop Broadcast Mast */}
          <mesh position={[0, 0, 38.5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.25, 0.45, 11, 8]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0, 44.2]}>
            <sphereGeometry args={[0.65, 10, 10]} />
            <meshStandardMaterial color="#ef4444" emissive="#ff1e42" emissiveIntensity={7.0} />
          </mesh>
        </group>
      )}

      {track.id === 'madring' && (
        /* Madring F1 (2026): Twin IFEMA Madrid Exhibition Pavilions + Skybridge + La Monumental Banked Coliseum Arc */
        <group>
          {/* IFEMA West & East Exhibition Pavilions in Infield */}
          <group position={[285, 250, 0]}>
            <mesh position={[0, 0, 6.5]} castShadow receiveShadow>
              <boxGeometry args={[76, 38, 13]} />
              <meshPhysicalMaterial
                color="#1e293b"
                roughness={0.18}
                metalness={0.78}
                clearcoat={0.9}
              />
            </mesh>
            <mesh position={[0, 0, 13.6]} castShadow>
              <boxGeometry args={[82, 42, 1.4]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.3} metalness={0.4} />
            </mesh>
            <mesh position={[0, -20.8, 11.5]}>
              <boxGeometry args={[78, 0.9, 1.2]} />
              <meshStandardMaterial
                color="#ec4899"
                emissive="#ec4899"
                emissiveIntensity={isNightOrSunset ? 5.0 : 2.2}
              />
            </mesh>
            <mesh position={[0, 20.8, 11.5]}>
              <boxGeometry args={[78, 0.9, 1.2]} />
              <meshStandardMaterial
                color="#38bdf8"
                emissive="#38bdf8"
                emissiveIntensity={isNightOrSunset ? 5.0 : 2.2}
              />
            </mesh>
          </group>

          {/* IFEMA East Valdebebas Pavilion + Elevated Pedestrian Skybridge */}
          <group position={[515, 252, 0]}>
            <mesh position={[0, 0, 6.0]} castShadow receiveShadow>
              <boxGeometry args={[64, 34, 12]} />
              <meshPhysicalMaterial
                color="#0f172a"
                roughness={0.18}
                metalness={0.82}
                clearcoat={0.9}
              />
            </mesh>
            <mesh position={[0, 0, 12.6]} castShadow>
              <boxGeometry args={[68, 38, 1.2]} />
              <meshStandardMaterial color="#e2e8f0" roughness={0.3} metalness={0.4} />
            </mesh>
            <mesh position={[-115, 0, 8.5]} castShadow>
              <boxGeometry args={[165, 6.5, 4.2]} />
              <meshPhysicalMaterial color="#38bdf8" roughness={0.12} metalness={0.85} clearcoat={1.0} />
            </mesh>
          </group>

          {/* La Monumental Curved Stadium Amphitheater Rim around the Eastern Banked Turn */}
          <group position={[744, 232, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <mesh position={[0, 0, 11]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[76, 3.4, 12, 36, Math.PI * 0.88]} />
              <meshStandardMaterial
                color="#f59e0b"
                emissive="#f59e0b"
                emissiveIntensity={isNightOrSunset ? 4.2 : 1.4}
                roughness={0.3}
                metalness={0.6}
              />
            </mesh>
          </group>
        </group>
      )}

      {track.id === 'monaco' && (
        /* Circuit de Monaco: Belle-Époque Casino de Monte-Carlo Twin Domes & Hôtel de Paris Rotunda */
        <group>
          <group position={[315, 252, 0]}>
            <mesh position={[0, 0, 6.5]} castShadow receiveShadow>
              <boxGeometry args={[72, 34, 13]} />
              <meshStandardMaterial color="#fef3c7" roughness={0.45} metalness={0.1} />
            </mesh>
            <mesh position={[0, 0, 14.5]} castShadow>
              <boxGeometry args={[48, 26, 4.0]} />
              <meshStandardMaterial color="#fde68a" roughness={0.4} />
            </mesh>
            {/* Iconic Twin Green Patina Copper Casino Domes */}
            <mesh position={[-11, 0, 18.5]} castShadow>
              <sphereGeometry args={[8.5, 20, 16]} />
              <meshStandardMaterial color="#0d9488" roughness={0.35} metalness={0.45} />
            </mesh>
            <mesh position={[11, 0, 18.5]} castShadow>
              <sphereGeometry args={[8.5, 20, 16]} />
              <meshStandardMaterial color="#0d9488" roughness={0.35} metalness={0.45} />
            </mesh>
            {/* Hôtel de Paris Rotunda Wing */}
            <mesh position={[52, 4, 8.5]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[14, 15, 17, 20]} />
              <meshStandardMaterial color="#fef9c3" roughness={0.42} />
            </mesh>
            <mesh position={[52, 4, 18.5]} castShadow>
              <sphereGeometry args={[11.5, 18, 14]} />
              <meshStandardMaterial color="#0f766e" roughness={0.35} metalness={0.4} />
            </mesh>
            {/* Warm Golden Palace Facade Illumination Strip */}
            <mesh position={[0, -17.2, 10.5]}>
              <boxGeometry args={[68, 0.8, 1.0]} />
              <meshStandardMaterial
                color="#fbbf24"
                emissive="#f59e0b"
                emissiveIntensity={isNightOrSunset ? 5.5 : 1.8}
              />
            </mesh>
          </group>
        </group>
      )}

      {track.id === 'grandprix' && (
        /* Autodromo Nazionale Monza: Historic Royal Park Villa & High-Speed Sopraelevata Banking Arch */
        <group position={[355, 250, 0]}>
          <mesh position={[0, 0, 6.0]} castShadow receiveShadow>
            <boxGeometry args={[74, 30, 12]} />
            <meshStandardMaterial color="#fed7aa" roughness={0.48} />
          </mesh>
          <mesh position={[0, 0, 14.0]} castShadow>
            <boxGeometry args={[42, 22, 4.5]} />
            <meshStandardMaterial color="#fdba74" roughness={0.45} />
          </mesh>
          <mesh position={[0, -15.3, 9.8]}>
            <boxGeometry args={[70, 0.8, 1.0]} />
            <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={2.5} />
          </mesh>
        </group>
      )}

      {/* Distant Horizon Mountain Range & Illuminated Glass Coastal Skyline */}
      {mountainPeaks}
      {skylineTowers}

      {/* Illuminated Grand Prix Festival Ferris Observation Wheel on the Horizon */}
      <group position={[815, 445, 0]} rotation={[0, 0, -0.6]}>
        <mesh position={[0, -4, 24]} rotation={[0.12, 0, 0]}>
          <cylinderGeometry args={[0.8, 1.5, 50, 6]} />
          <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.8} />
        </mesh>
        <mesh position={[0, 4, 24]} rotation={[-0.12, 0, 0]}>
          <cylinderGeometry args={[0.8, 1.5, 50, 6]} />
          <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.8} />
        </mesh>
        <group ref={ferrisWheelRef} position={[0, 0, 46]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[28, 0.9, 10, 32]} />
            <meshStandardMaterial
              color="#f43f5e"
              emissive={lightingPreset === 'night' ? '#38bdf8' : '#f43f5e'}
              emissiveIntensity={isNightOrSunset ? 5.5 : 0.8}
            />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[18, 0.5, 8, 24]} />
            <meshStandardMaterial
              color="#f59e0b"
              emissive="#f59e0b"
              emissiveIntensity={isNightOrSunset ? 4.5 : 0.6}
            />
          </mesh>
        </group>
      </group>

      {/* Stadium Floodlight Towers with Volumetric Cones */}
      {floodlightTowers}

      {/* Giant Trackside LED Broadcast Jumbotrons */}
      {jumbotrons}

      {/* Organic Animated Trees & Vice Coast Palms */}
      <group ref={treesGroupRef}>{staticTrees}</group>

      {/* Pit Complex & Terraced Spectator Grandstands */}
      {staticGrandstands}

      {/* Animated Grandstand Spectator Camera Flashes */}
      <instancedMesh
        ref={crowdFlashesRef}
        args={[undefined, undefined, Math.max(1, crowdFlashAnchors.length)]}
        frustumCulled={false}
      >
        <octahedronGeometry args={[0.75, 0]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.92}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>

      {/* FIA 100m & 50m Braking Marker Boards */}
      {brakeBoards}

      {/* Trackside Flags */}
      <group ref={flagsGroupRef}>
        {staticDecorations.filter((dec) => dec && dec.key?.includes('flag'))}
      </group>

      {/* Hospitality Tents */}
      {staticDecorations.filter((dec) => dec && !dec.key?.includes('flag'))}

      {/* Sculpted Orbiting F1 TV Broadcast Helicopter with Glass Canopy, Skids & Searchlight */}
      <group ref={heliGroupRef} position={[400, 120, 78]}>
        <mesh castShadow>
          <boxGeometry args={[7.2, 2.7, 2.3]} />
          <meshPhysicalMaterial color="#0f172a" roughness={0.16} metalness={0.82} clearcoat={1.0} />
        </mesh>
        {/* Tinted Glass Cockpit Nose Bubble */}
        <mesh position={[3.6, 0, -0.1]}>
          <sphereGeometry args={[1.35, 14, 12]} />
          <meshPhysicalMaterial color="#38bdf8" roughness={0.05} metalness={0.95} clearcoat={1.0} />
        </mesh>
        {/* Landing Skids */}
        <mesh position={[0.4, -1.5, -1.65]}>
          <boxGeometry args={[6.4, 0.24, 0.24]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.3} metalness={0.85} />
        </mesh>
        <mesh position={[0.4, 1.5, -1.65]}>
          <boxGeometry args={[6.4, 0.24, 0.24]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.3} metalness={0.85} />
        </mesh>
        {/* Tail Boom & Spinning Tail Rotor */}
        <mesh position={[-6.0, 0, 0.3]}>
          <boxGeometry args={[6.4, 0.65, 0.78]} />
          <meshStandardMaterial color="#1e293b" roughness={0.38} metalness={0.72} />
        </mesh>
        <mesh ref={heliTailRotorRef} position={[-9.1, 0.55, 0.55]}>
          <boxGeometry args={[0.15, 0.15, 2.4]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.75} />
        </mesh>
        {/* Main Rotor Blades */}
        <mesh ref={heliRotorRef} position={[0.4, 0, 1.65]}>
          <boxGeometry args={[15.5, 0.65, 0.12]} />
          <meshBasicMaterial color="#cbd5e1" transparent opacity={0.55} />
        </mesh>
        {/* Red Strobe Beacon */}
        <mesh position={[-9.0, 0, 1.1]}>
          <sphereGeometry args={[0.45, 8, 8]} />
          <meshStandardMaterial color="#ef4444" emissive="#ff1e42" emissiveIntensity={8.5} />
        </mesh>
        {/* Volumetric TV Broadcast Searchlight Cone under Helicopter in Night / Sunset / Wet GP */}
        {showHeliBeam && (
          <mesh position={[12, 0, -34]} rotation={[Math.PI / 2, 0.32, 0]}>
            <coneGeometry args={[22, 68, 16, 1, true]} />
            <meshBasicMaterial
              color="#e0f2fe"
              transparent
              opacity={lightingPreset === 'night' ? 0.09 : 0.05}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        )}
      </group>
    </group>
  );
};
