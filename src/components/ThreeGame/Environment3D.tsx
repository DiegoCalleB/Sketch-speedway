import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Track } from '../../types';
import { getTrackBankingProfile } from '../../utils/tracks';
import { LightingPreset } from './SceneAtmosphere';

interface Environment3DProps {
  track: Track;
  lightingPreset?: LightingPreset;
}

// High-resolution organic European / Vice Coast Autodrome countryside grass & soil texture
const createNaturalTerrainTexture = (maxAnisotropy: number, preset: LightingPreset) => {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = preset === 'night' ? '#101c13' : preset === 'sunset' ? '#2c4223' : '#314c2a';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 110; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 24 + Math.random() * 72;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
    const palette =
      i % 3 === 0
        ? ['rgba(76, 102, 50, 0.28)', 'rgba(76, 102, 50, 0)']
        : i % 3 === 1
          ? ['rgba(36, 58, 28, 0.34)', 'rgba(36, 58, 28, 0)']
          : ['rgba(104, 92, 58, 0.16)', 'rgba(104, 92, 58, 0)'];
    grad.addColorStop(0, palette[0]);
    grad.addColorStop(1, palette[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Subtle mowed stadium turf stripes
  for (let x = 0; x < size; x += 32) {
    ctx.fillStyle = (x / 32) % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
    ctx.fillRect(x, 0, 32, size);
  }

  for (let i = 0; i < 28000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 1 + Math.random() * 1.4;
    const h = 1.5 + Math.random() * 2.8;
    const pick = Math.random();
    if (pick > 0.65) {
      ctx.fillStyle = 'rgba(112, 140, 74, 0.18)';
    } else if (pick > 0.25) {
      ctx.fillStyle = 'rgba(20, 36, 16, 0.24)';
    } else {
      ctx.fillStyle = 'rgba(138, 124, 82, 0.14)';
    }
    ctx.fillRect(x, y, w, h);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 18);
  texture.anisotropy = maxAnisotropy;
  return texture;
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

// Procedural Giant Trackside LED Broadcast Jumbotron Screen texture
const createJumbotronTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const grad = ctx.createLinearGradient(0, 0, 256, 128);
  grad.addColorStop(0, '#090d16');
  grad.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);

  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, 0, 256, 18);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('  FIA FORMULA 1  ·  LIVE TELEMETRY', 8, 13);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '900 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('DRAW RACE GP', 128, 56);

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('VMAX: 343 KM/H · DRS', 128, 88);

  ctx.fillStyle = '#10b981';
  ctx.fillRect(24, 104, 208, 8);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
  lightingPreset = 'day'
}) => {
  const { gl } = useThree();
  const maxAnisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  const treesGroupRef = useRef<THREE.Group>(null);
  const flagsGroupRef = useRef<THREE.Group>(null);
  const heliGroupRef = useRef<THREE.Group>(null);
  const heliRotorRef = useRef<THREE.Mesh>(null);
  const heliTailRotorRef = useRef<THREE.Mesh>(null);
  const ferrisWheelRef = useRef<THREE.Group>(null);

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
    grassTexture,
    skylineTexture,
    crowdTexture,
    board100Tex,
    board50Tex,
    jumbotronTex,
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
    const texture = createNaturalTerrainTexture(maxAnisotropy, lightingPreset);
    const skylineTex = createSkylineFacadeTexture(lightingPreset);
    const crowd = createCrowdSeatsTexture();
    const b100 = createBrakeBoardTexture('100');
    const b50 = createBrakeBoardTexture('50');
    const jumbo = createJumbotronTexture();

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
            /* GTA VI Vice Coast Arched Palm Frond Crown */
            <group position={[sz * 0.04, 0, sz * 0.8]}>
              {[0, 1, 2, 3, 4, 5, 6].map((fIdx) => {
                const fAng = (fIdx / 7) * Math.PI * 2;
                return (
                  <group key={`frond-${fIdx}`} rotation={[0, 0, fAng]}>
                    <mesh
                      position={[sz * 0.22, 0, -sz * 0.03]}
                      rotation={[0, 0.34, 0]}
                      castShadow
                    >
                      <boxGeometry args={[sz * 0.46, sz * 0.14, 0.14]} />
                      <meshStandardMaterial color={fIdx % 2 === 0 ? '#2f6b30' : '#3a7d38'} roughness={0.76} />
                    </mesh>
                    <mesh
                      position={[sz * 0.44, 0, -sz * 0.16]}
                      rotation={[0, 0.78, 0]}
                      castShadow
                    >
                      <boxGeometry args={[sz * 0.24, sz * 0.09, 0.10]} />
                      <meshStandardMaterial color="#3c7f3a" roughness={0.78} />
                    </mesh>
                  </group>
                );
              })}
            </group>
          ) : isPine ? (
            <group position={[0, 0, sz * 0.44]}>
              <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
                <coneGeometry args={[sz * 0.44, sz * 0.62, 8]} />
                <meshStandardMaterial color="#1d3d24" roughness={0.88} />
              </mesh>
              <mesh position={[0, 0, sz * 0.28]} rotation={[Math.PI / 2, 0, 0.4]} castShadow receiveShadow>
                <coneGeometry args={[sz * 0.34, sz * 0.52, 8]} />
                <meshStandardMaterial color="#254c2b" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0, sz * 0.52]} rotation={[Math.PI / 2, 0, 0.8]} castShadow>
                <coneGeometry args={[sz * 0.22, sz * 0.4, 8]} />
                <meshStandardMaterial color="#2f5e34" roughness={0.82} />
              </mesh>
            </group>
          ) : (
            <group position={[0, 0, sz * 0.48]}>
              <mesh position={[0, 0, 0]} castShadow receiveShadow>
                <dodecahedronGeometry args={[sz * 0.34, 1]} />
                <meshStandardMaterial color="#264723" roughness={0.88} />
              </mesh>
              <mesh position={[-sz * 0.15, sz * 0.12, sz * 0.12]} castShadow>
                <dodecahedronGeometry args={[sz * 0.24, 1]} />
                <meshStandardMaterial color="#345c2c" roughness={0.86} />
              </mesh>
              <mesh position={[sz * 0.16, -sz * 0.1, sz * 0.15]} castShadow>
                <dodecahedronGeometry args={[sz * 0.25, 1]} />
                <meshStandardMaterial color="#3f6a32" roughness={0.84} />
              </mesh>
              <mesh position={[0.04 * sz, 0.08 * sz, sz * 0.24]} castShadow>
                <dodecahedronGeometry args={[sz * 0.21, 1]} />
                <meshStandardMaterial color="#487537" roughness={0.82} />
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

    // 4. Distant Sculpted Horizon Mountain Range
    const peaks: React.ReactNode[] = [];
    const mountainRingCount = 26;
    for (let m = 0; m < mountainRingCount; m++) {
      const ang = (m / mountainRingCount) * Math.PI * 2;
      // Leave coastal ocean opening along the south-east arc for the shimmering marina bay!
      if (ang > 4.2 && ang < 5.6) continue;
      const dist = 940 + ((m * 137) % 260);
      const mx = 400 + Math.cos(ang) * dist;
      const my = 250 + Math.sin(ang) * (dist * 0.85);
      const radius = 155 + ((m * 73) % 130);
      const height = 140 + ((m * 89) % 175);
      peaks.push(
        <mesh
          key={`mountain-peak-${m}`}
          position={[mx, my, height * 0.42 - 12]}
          rotation={[Math.PI / 2, (m * 0.7) % Math.PI, 0]}
        >
          <coneGeometry args={[radius, height, 6]} />
          <meshStandardMaterial
            color={
              lightingPreset === 'sunset'
                ? '#334155'
                : lightingPreset === 'night'
                  ? '#0f172a'
                  : '#384b39'
            }
            roughness={0.95}
            metalness={0.05}
            flatShading
          />
        </mesh>
      );
    }

    // 5. Distant Vice / Miami Glass High-Rise Skyline along the North-East Coastal Ridge
    const skyline: React.ReactNode[] = [];
    for (let s = 0; s < 16; s++) {
      const bx = 560 + s * 46 + ((s * 29) % 24);
      const by = 695 + ((s * 53) % 85);
      const bw = 20 + ((s * 19) % 20);
      const bd = 18 + ((s * 13) % 16);
      const bh = 68 + ((s * 47) % 135);
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

    // 6. Luxury Monaco / Miami GP Marina Superyachts moored in the Southern Coastal Bay
    const yachts: React.ReactNode[] = [
      { x: 185, y: -155, rot: 0.22, scale: 1.15 },
      { x: 330, y: -175, rot: -0.14, scale: 1.35 },
      { x: 495, y: -162, rot: 0.30, scale: 1.1 },
      { x: 640, y: -182, rot: -0.25, scale: 1.25 }
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
        {/* Teak Foredeck */}
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
            emissiveIntensity={isNightOrSunset ? 0.9 : 0}
            roughness={0.08}
            metalness={0.85}
            clearcoat={1.0}
          />
        </mesh>
        {/* Upper Sun Deck */}
        <mesh position={[-4.5, 0, 5.0]}>
          <boxGeometry args={[9.5, 4.4, 0.5]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.25} />
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

    return {
      grassTexture: texture,
      skylineTexture: skylineTex,
      crowdTexture: crowd,
      board100Tex: b100,
      board50Tex: b50,
      jumbotronTex: jumbo,
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

  useEffect(() => {
    return () => {
      grassTexture.dispose();
      skylineTexture.dispose();
      crowdTexture.dispose();
      board100Tex.dispose();
      board50Tex.dispose();
      jumbotronTex.dispose();
    };
  }, [grassTexture, skylineTexture, crowdTexture, board100Tex, board50Tex, jumbotronTex]);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();
    waterMaterial.uniforms.uTime.value = elapsed;

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

  return (
    <group>
      {/* Expansive Natural Circuit Countryside Terrain */}
      <mesh position={[400, 320, -0.24]} receiveShadow>
        <planeGeometry args={[3800, 2600]} />
        <meshStandardMaterial map={grassTexture} roughness={0.94} metalness={0.02} />
      </mesh>

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
      </group>
    </group>
  );
};
