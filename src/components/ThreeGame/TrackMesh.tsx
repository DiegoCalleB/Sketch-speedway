import React, { useMemo, useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Track, WeatherCondition } from '../../types';
import { getTrackBankingProfile } from '../../utils/tracks';
import { LightingPreset } from './SceneAtmosphere';

interface TrackMeshProps {
  track: Track;
  countdownValue?: string | null;
  lightingPreset?: LightingPreset;
  weather?: WeatherCondition;
}

const _asphaltNormalScale = new THREE.Vector2(1.45, 1.45);
const _kerbNormalScale = new THREE.Vector2(1.2, 1.2);

// Next-Gen 1024x1024 Photogrammetry-Style PBR Asphalt Albedo + Specular Roughness Map + True RGB Tangent Normal Map
const createNextGenAsphaltMaps = (
  maxAnisotropy: number,
  preset: LightingPreset,
  weather: WeatherCondition = 'dry'
) => {
  const size = 1024;

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const ctx = albedoCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d');

  const normCanvas = document.createElement('canvas');
  normCanvas.width = size;
  normCanvas.height = size;
  const nCtx = normCanvas.getContext('2d');

  if (!ctx || !rCtx || !nCtx) {
    return {
      map: new THREE.Texture(),
      roughnessMap: new THREE.Texture(),
      normalMap: new THREE.Texture()
    };
  }

  const isRain = weather === 'rain';
  const isNightWet = preset === 'night' || isRain;
  const isSunset = preset === 'sunset';

  // Rich motorsport obsidian bitumen base (slightly deeper wet sheen in rain while keeping high contrast against green turf)
  ctx.fillStyle = isRain ? '#12161f' : preset === 'night' ? '#131720' : '#1d222b';
  ctx.fillRect(0, 0, size, size);

  rCtx.fillStyle = isRain ? '#161616' : preset === 'night' ? '#262626' : isSunset ? '#747474' : '#909090';
  rCtx.fillRect(0, 0, size, size);

  nCtx.fillStyle = 'rgb(128, 128, 255)';
  nCtx.fillRect(0, 0, size, size);

  // Subtle asphalt paver lane seams & macro bitumen tonal variation
  for (let i = 0; i < 18; i++) {
    const px = Math.random() * size;
    const py = Math.random() * size;
    const pr = 90 + Math.random() * 190;
    const g = ctx.createRadialGradient(px, py, 10, px, py, pr);
    g.addColorStop(0, i % 2 === 0 ? 'rgba(38, 44, 56, 0.20)' : 'rgba(10, 12, 18, 0.24)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }

  // Polished rubbered-in F1 racing groove in center corridor + off-line tire marbles
  const rubberAlbedoGrad = ctx.createLinearGradient(0, 0, 0, size);
  rubberAlbedoGrad.addColorStop(0.0, 'rgba(9, 11, 15, 0.42)');
  rubberAlbedoGrad.addColorStop(0.18, 'rgba(15, 18, 24, 0.04)');
  rubberAlbedoGrad.addColorStop(0.36, 'rgba(4, 6, 10, 0.54)');
  rubberAlbedoGrad.addColorStop(0.50, 'rgba(2, 4, 7, 0.68)');
  rubberAlbedoGrad.addColorStop(0.64, 'rgba(4, 6, 10, 0.54)');
  rubberAlbedoGrad.addColorStop(0.82, 'rgba(15, 18, 24, 0.04)');
  rubberAlbedoGrad.addColorStop(1.0, 'rgba(9, 11, 15, 0.42)');
  ctx.fillStyle = rubberAlbedoGrad;
  ctx.fillRect(0, 0, size, size);

  // Specular roughness drop in the rubbered racing line (creates realistic grazing sun-glint & floodlight reflections)
  const rubberRoughGrad = rCtx.createLinearGradient(0, 0, 0, size);
  rubberRoughGrad.addColorStop(0.0, isNightWet ? '#1c1c1c' : '#a8a8a8');
  rubberRoughGrad.addColorStop(0.22, isNightWet ? '#121212' : '#6c6c6c');
  rubberRoughGrad.addColorStop(0.44, isNightWet ? '#070707' : '#242424');
  rubberRoughGrad.addColorStop(0.50, isNightWet ? '#040404' : '#181818');
  rubberRoughGrad.addColorStop(0.56, isNightWet ? '#070707' : '#242424');
  rubberRoughGrad.addColorStop(0.78, isNightWet ? '#121212' : '#6c6c6c');
  rubberRoughGrad.addColorStop(1.0, isNightWet ? '#1c1c1c' : '#a8a8a8');
  rCtx.fillStyle = rubberRoughGrad;
  rCtx.fillRect(0, 0, size, size);

  // Wet-weather / Sunset mirror puddle patches
  const puddleCount = isRain ? 135 : isNightWet ? 85 : 34;
  for (let i = 0; i < puddleCount; i++) {
    const px = Math.random() * size;
    const py = 75 + Math.random() * (size - 150);
    const rx = 55 + Math.random() * (isRain ? 210 : 165);
    const ry = 20 + Math.random() * (isRain ? 72 : 58);
    const pGrad = rCtx.createRadialGradient(px, py, 4, px, py, rx);
    pGrad.addColorStop(0, isRain ? 'rgba(2, 2, 2, 0.98)' : isNightWet ? 'rgba(4, 4, 4, 0.96)' : 'rgba(20, 20, 20, 0.62)');
    pGrad.addColorStop(1, 'rgba(128, 128, 128, 0)');
    rCtx.fillStyle = pGrad;
    rCtx.fillRect(px - rx, py - ry, rx * 2, ry * 2);
  }

  // Longitudinal tire rubber streaks & glossy tar-sealed road cracks
  for (let i = 0; i < 82; i++) {
    const y = 95 + Math.random() * (size - 190);
    const h = 1.6 + Math.random() * 4.5;
    ctx.fillStyle = `rgba(3, 5, 8, ${0.10 + Math.random() * 0.14})`;
    ctx.fillRect(0, y, size, h);
    rCtx.fillStyle = 'rgba(16, 16, 16, 0.45)';
    rCtx.fillRect(0, y, size, h);
  }

  // High-frequency crushed granite aggregate micro-speckles + RGB tangent normal facets
  for (let i = 0; i < 62000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const s = 1.0 + Math.random() * 2.0;
    const pick = Math.random();
    if (pick > 0.66) {
      ctx.fillStyle = 'rgba(182, 192, 206, 0.14)';
      nCtx.fillStyle = 'rgb(172, 148, 244)';
    } else if (pick > 0.28) {
      ctx.fillStyle = 'rgba(7, 9, 13, 0.26)';
      nCtx.fillStyle = 'rgb(88, 108, 244)';
    } else {
      ctx.fillStyle = 'rgba(118, 128, 142, 0.12)';
      nCtx.fillStyle = 'rgb(116, 164, 246)';
    }
    ctx.fillRect(x, y, s, s);
    nCtx.fillRect(x, y, s, s);
  }

  // Smooth water puddle centers in normal map so rain puddles act as glass mirrors
  if (isNightWet || isSunset) {
    const smoothPuddleCount = isRain ? 68 : 36;
    for (let i = 0; i < smoothPuddleCount; i++) {
      const px = Math.random() * size;
      const py = 100 + Math.random() * (size - 200);
      const r = 38 + Math.random() * (isRain ? 95 : 78);
      const nGrad = nCtx.createRadialGradient(px, py, 4, px, py, r);
      nGrad.addColorStop(0, 'rgba(128, 128, 255, 0.94)');
      nGrad.addColorStop(1, 'rgba(128, 128, 255, 0)');
      nCtx.fillStyle = nGrad;
      nCtx.fillRect(px - r, py - r, r * 2, r * 2);
    }
  }

  // Off-line F1 tire rubber marbles along outer and inner edges of the racing groove
  for (let i = 0; i < 420; i++) {
    const mx = Math.random() * size;
    const isTopSide = i % 2 === 0;
    const my = isTopSide
      ? 55 + Math.random() * 165
      : size - 220 + Math.random() * 165;
    const mw = 2.0 + Math.random() * 4.5;
    const mh = 1.5 + Math.random() * 3.0;
    ctx.fillStyle = 'rgba(4, 6, 9, 0.55)';
    ctx.fillRect(mx, my, mw, mh);
    rCtx.fillStyle = '#c8c8c8';
    rCtx.fillRect(mx, my, mw, mh);
    nCtx.fillStyle = 'rgb(168, 118, 236)';
    nCtx.fillRect(mx, my, mw, mh);
  }

  // Crisp FIA White Track-Limit Edge Stripes
  ctx.fillStyle = 'rgba(248, 250, 252, 0.96)';
  ctx.fillRect(0, 22, size, 22);
  ctx.fillRect(0, size - 44, size, 22);

  rCtx.fillStyle = '#444444';
  rCtx.fillRect(0, 22, size, 22);
  rCtx.fillRect(0, size - 44, size, 22);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
  roughnessMap.anisotropy = maxAnisotropy;

  const normalMap = new THREE.CanvasTexture(normCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.ClampToEdgeWrapping;
  normalMap.anisotropy = maxAnisotropy;

  return { map, roughnessMap, normalMap };
};

// Modern FIA Paul Ricard / Miami GP High-Friction Blue-Slate Runoff Apron Texture
const createRunoffApronTexture = (maxAnisotropy: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 256, 128);

  // Diagonal high-grip FIA safety stripes
  ctx.fillStyle = '#0369a1';
  for (let x = -128; x < 384; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 18, 0);
    ctx.lineTo(x - 16, 128);
    ctx.lineTo(x - 34, 128);
    ctx.closePath();
    ctx.fill();
  }

  // Subtle gritty friction noise
  for (let i = 0; i < 3200; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(Math.random() * 256, Math.random() * 128, 1.5, 1.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = maxAnisotropy;
  return texture;
};

// Procedural raked FIA limestone gravel trap texture
const createGravelTexture = (maxAnisotropy: number) => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = '#b9ad93';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 8) {
    ctx.fillStyle = 'rgba(84, 73, 56, 0.24)';
    ctx.fillRect(0, y, size, 3);
    ctx.fillStyle = 'rgba(235, 226, 205, 0.26)';
    ctx.fillRect(0, y + 3, size, 2);
  }

  for (let i = 0; i < 12000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const s = 1 + Math.random() * 2.2;
    ctx.fillStyle =
      Math.random() > 0.5 ? 'rgba(240, 232, 214, 0.30)' : 'rgba(92, 82, 65, 0.30)';
    ctx.fillRect(x, y, s, s);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 2);
  texture.anisotropy = maxAnisotropy;
  return texture;
};

// Continuous FIA serrated Red & White rumble kerb texture + relief normal map
const createKerbMaps = (maxAnisotropy: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const nCanvas = document.createElement('canvas');
  nCanvas.width = 256;
  nCanvas.height = 64;
  const nCtx = nCanvas.getContext('2d');

  if (!ctx || !nCtx) return { map: new THREE.Texture(), normalMap: new THREE.Texture() };

  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(128, 0, 128, 64);

  nCtx.fillStyle = 'rgb(128, 128, 255)';
  nCtx.fillRect(0, 0, 256, 64);

  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.fillRect(x, 0, 3, 64);
    // Serrated sawtooth ridge normals
    nCtx.fillStyle = 'rgb(185, 128, 240)';
    nCtx.fillRect(x, 0, 6, 64);
    nCtx.fillStyle = 'rgb(80, 128, 240)';
    nCtx.fillRect(x + 6, 0, 4, 64);
  }
  const scuff = ctx.createLinearGradient(0, 0, 0, 64);
  scuff.addColorStop(0, 'rgba(15, 23, 42, 0.38)');
  scuff.addColorStop(0.5, 'rgba(15, 23, 42, 0.05)');
  scuff.addColorStop(1, 'rgba(15, 23, 42, 0.28)');
  ctx.fillStyle = scuff;
  ctx.fillRect(0, 0, 256, 64);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = maxAnisotropy;

  const normalMap = new THREE.CanvasTexture(nCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.ClampToEdgeWrapping;
  normalMap.anisotropy = maxAnisotropy;

  return { map, normalMap };
};

// FIA Perimeter Sponsor Barrier & Tecpro Advertising Texture
const createBarrierSponsorTexture = (maxAnisotropy: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const panels = [
    { bg: '#0f172a', accent: '#f59e0b', text: 'DRAW RACE GP' },
    { bg: '#172554', accent: '#38bdf8', text: 'PIRELLI P-ZERO' },
    { bg: '#064e3b', accent: '#34d399', text: 'ROLEX · FIA' },
    { bg: '#1e293b', accent: '#38bdf8', text: 'ARAMCO · F1' }
  ];

  const pw = 512 / panels.length;
  panels.forEach((p, idx) => {
    const x0 = idx * pw;
    ctx.fillStyle = p.bg;
    ctx.fillRect(x0, 0, pw, 64);
    ctx.fillStyle = p.accent;
    ctx.fillRect(x0, 0, pw, 7);
    ctx.fillRect(x0, 57, pw, 7);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '900 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.text, x0 + pw * 0.5, 33);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = maxAnisotropy;
  return texture;
};

// Procedural checkered flag texture for the start/finish line
const createCheckerTexture = (maxAnisotropy: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const cols = 3;
  const rows = 18;
  const cw = canvas.width / cols;
  const ch = canvas.height / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#f8fafc' : '#111827';
      ctx.fillRect(c * cw, r * ch, cw, ch);
    }
  }

  ctx.fillStyle = 'rgba(20, 24, 31, 0.14)';
  ctx.fillRect(0, 0, 128, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
};

// Procedural FIA sponsor gantry banner texture
const createGantryBannerTexture = (maxAnisotropy: number, text: string, accentColor: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, 512, 96);

  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, 512, 10);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 86, 512, 10);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 48);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
};

export const TrackMesh: React.FC<TrackMeshProps> = ({
  track,
  countdownValue = null,
  lightingPreset = 'day',
  weather = 'dry'
}) => {
  const { gl } = useThree();
  const maxAnisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  const tireWallInstancedRef = useRef<THREE.InstancedMesh>(null);
  const apexCatEyesRef = useRef<THREE.InstancedMesh>(null);
  const asphaltShaderUniformsRef = useRef<{
    uTime: { value: number };
    uWetness: { value: number };
  }>({
    uTime: { value: 0 },
    uWetness: { value: weather === 'rain' ? 1.0 : 0.0 }
  });

  useEffect(() => {
    asphaltShaderUniformsRef.current.uWetness.value = weather === 'rain' ? 1.0 : 0.0;
  }, [weather]);

  const handleAsphaltBeforeCompile = useMemo(() => {
    return (shader: THREE.WebGLProgramParametersWithUniforms) => {
      shader.uniforms.uTime = asphaltShaderUniformsRef.current.uTime;
      shader.uniforms.uWetness = asphaltShaderUniformsRef.current.uWetness;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vAsphaltWorldPos;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vAsphaltWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform float uWetness;
           varying vec3 vAsphaltWorldPos;
           float asphaltHash(vec2 p) {
             return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
           }`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
           // Procedural sub-millimeter quartz aggregate micro-facet & wet raindrop concentric ripples
           vec2 microGrid = floor(vAsphaltWorldPos.xy * 16.0);
           float microSparkle = asphaltHash(microGrid);
           if (microSparkle > 0.965) {
             roughnessFactor = max(0.04, roughnessFactor * 0.45);
           }
           if (uWetness > 0.5) {
             vec2 cell = floor(vAsphaltWorldPos.xy * 0.42);
             vec2 local = fract(vAsphaltWorldPos.xy * 0.42) - 0.5;
             float phase = fract(uTime * 1.45 + asphaltHash(cell));
             float ring = smoothstep(0.06, 0.0, abs(length(local) - phase * 0.45)) * (1.0 - phase);
             roughnessFactor = clamp(roughnessFactor - ring * 0.28, 0.03, 1.0);
           }`
        );
    };
  }, []);

  const marshalLedMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#10b981',
        emissive: '#10b981',
        emissiveIntensity: lightingPreset === 'night' ? 6.5 : 3.2,
        roughness: 0.25
      }),
    [lightingPreset]
  );

  useEffect(() => {
    return () => {
      marshalLedMat.dispose();
    };
  }, [marshalLedMat]);

  useFrame((state) => {
    const elapsed = state.clock.getElapsedTime();
    asphaltShaderUniformsRef.current.uTime.value = elapsed;
    const base = lightingPreset === 'night' ? 6.2 : 3.0;
    marshalLedMat.emissiveIntensity = base + Math.sin(elapsed * 4.2) * 0.85;
  });

  const {
    bankedTrackGeometry,
    runoffApronGeometry,
    gravelTrapGeometry,
    outerKerbGeometry,
    innerKerbGeometry,
    barrierGeometry,
    catchFenceGeometry,
    tireStackTransforms,
    apexCatEyeTransforms,
    marshalPanels,
    asphaltMaps,
    runoffApronTexture,
    gravelTexture,
    kerbMaps,
    barrierTexture,
    checkerTexture,
    gantryTexture,
    sectorGantries,
    startLineTransform,
    gridSlots,
    drsActivationZones,
    monacoTunnelArches
  } = useMemo(() => {
    const outer = track.outerBoundary;
    const inner = track.innerBoundary;
    const len = Math.min(outer.length, inner.length);
    const banking = getTrackBankingProfile(track);

    // 1. Build 3D Banked Asphalt Ribbon + Outer Embankment Skirt Geometry
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    let totalTrackLen = 0;
    const cumDist: number[] = [0];
    for (let i = 0; i < len; i++) {
      const nIdx = (i + 1) % len;
      const mx1 = (outer[i].x + inner[i].x) * 0.5;
      const my1 = (outer[i].y + inner[i].y) * 0.5;
      const mx2 = (outer[nIdx].x + inner[nIdx].x) * 0.5;
      const my2 = (outer[nIdx].y + inner[nIdx].y) * 0.5;
      totalTrackLen += Math.hypot(mx2 - mx1, my2 - my1);
      cumDist.push(totalTrackLen);
    }

    for (let i = 0; i <= len; i++) {
      const idx = i % len;
      const oPt = outer[idx];
      const iPt = inner[idx];
      const b = banking[idx];

      positions.push(oPt.x, 500 - oPt.y, b.outerZ);
      positions.push(iPt.x, 500 - iPt.y, b.innerZ);
      positions.push(oPt.x, 500 - oPt.y, -0.2);

      const u = cumDist[i] / 62;
      uvs.push(u, 1);
      uvs.push(u, 0);
      uvs.push(u, 0.98);
    }

    for (let i = 0; i < len; i++) {
      const base = i * 3;
      const next = (i + 1) * 3;
      indices.push(base, base + 1, next);
      indices.push(base + 1, next + 1, next);
      indices.push(base, next, base + 2);
      indices.push(next, next + 2, base + 2);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeTangents();

    // 2. Continuous Flush 3D FIA Kerb Ribbons
    const buildKerbRibbon = (isOuter: boolean) => {
      const kPos: number[] = [];
      const kUvs: number[] = [];
      const kIdx: number[] = [];

      for (let i = 0; i <= len; i++) {
        const idx = i % len;
        const oPt = outer[idx];
        const iPt = inner[idx];
        const dx = oPt.x - iPt.x;
        const dy = oPt.y - iPt.y;
        const dLen = Math.hypot(dx, dy) || 1;
        const nx = dx / dLen;
        const ny = dy / dLen;

        const b = banking[idx];
        const kerbW = b.curvature > 0.0045 ? 3.4 : 2.4;

        if (isOuter) {
          const baseX = oPt.x - nx * 0.5;
          const baseY = oPt.y - ny * 0.5;
          const edgeX = oPt.x + nx * kerbW;
          const edgeY = oPt.y + ny * kerbW;
          kPos.push(baseX, 500 - baseY, b.outerZ + 0.08);
          kPos.push(edgeX, 500 - edgeY, b.outerZ + 0.26);
          kPos.push(edgeX, 500 - edgeY, Math.max(0.0, b.outerZ - 0.1));
        } else {
          const baseX = iPt.x + nx * 0.5;
          const baseY = iPt.y + ny * 0.5;
          const edgeX = iPt.x - nx * kerbW;
          const edgeY = iPt.y - ny * kerbW;
          kPos.push(edgeX, 500 - edgeY, b.innerZ + 0.26);
          kPos.push(baseX, 500 - baseY, b.innerZ + 0.08);
          kPos.push(edgeX, 500 - edgeY, Math.max(0.0, b.innerZ - 0.1));
        }

        const u = cumDist[i] / 14;
        kUvs.push(u, 0);
        kUvs.push(u, 1);
        kUvs.push(u, 1);
      }

      for (let i = 0; i < len; i++) {
        const b0 = i * 3;
        const b1 = (i + 1) * 3;
        kIdx.push(b0, b0 + 1, b1);
        kIdx.push(b0 + 1, b1 + 1, b1);
        kIdx.push(b0 + 1, b0 + 2, b1 + 1);
        kIdx.push(b0 + 2, b1 + 2, b1 + 1);
      }

      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(kPos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(kUvs, 2));
      g.setIndex(kIdx);
      g.computeVertexNormals();
      g.computeTangents();
      return g;
    };

    const outerKerbGeo = buildKerbRibbon(true);
    const innerKerbGeo = buildKerbRibbon(false);

    // 3. FIA High-Friction Runoff Aprons + Raked Limestone Gravel Traps + 3D Tire Barrier Stacks + LED Marshal Boards
    const apronPos: number[] = [];
    const apronUvs: number[] = [];
    const apronIdx: number[] = [];
    let aVertCount = 0;

    const gravelPos: number[] = [];
    const gravelUvs: number[] = [];
    const gravelIndices: number[] = [];
    let gVertCount = 0;

    const tireTransforms: { x: number; y: number; z: number; color: string }[] = [];
    const catEyes: { x: number; y: number; z: number; color: string }[] = [];
    const marshals: { x: number; y: number; z: number; angle: number }[] = [];

    for (let i = 0; i < len; i++) {
      const nIdx = (i + 1) % len;
      const b1 = banking[i];
      const b2 = banking[nIdx];
      if (b1.curvature < 0.0032 && b2.curvature < 0.0032) continue;

      const o1 = outer[i];
      const i1 = inner[i];
      const o2 = outer[nIdx];
      const i2 = inner[nIdx];

      const dir1X = o1.x - i1.x;
      const dir1Y = o1.y - i1.y;
      const len1 = Math.hypot(dir1X, dir1Y) || 1;
      const nx1 = dir1X / len1;
      const ny1 = dir1Y / len1;

      const dir2X = o2.x - i2.x;
      const dir2Y = o2.y - i2.y;
      const len2 = Math.hypot(dir2X, dir2Y) || 1;
      const nx2 = dir2X / len2;
      const ny2 = dir2Y / len2;

      const apronW1 = 7.5;
      const apronW2 = 7.5;
      const stripW1 = Math.min(28, 12 + b1.curvature * 1200);
      const stripW2 = Math.min(28, 12 + b2.curvature * 1200);

      // FIA Blue-Slate Friction Apron immediately outside the outer kerb
      const aStart1X = o1.x + nx1 * 2.4;
      const aStart1Y = o1.y + ny1 * 2.4;
      const aEnd1X = o1.x + nx1 * apronW1;
      const aEnd1Y = o1.y + ny1 * apronW1;

      const aStart2X = o2.x + nx2 * 2.4;
      const aStart2Y = o2.y + ny2 * 2.4;
      const aEnd2X = o2.x + nx2 * apronW2;
      const aEnd2Y = o2.y + ny2 * apronW2;

      apronPos.push(aStart1X, 500 - aStart1Y, 0.16);
      apronPos.push(aEnd1X, 500 - aEnd1Y, 0.14);
      apronPos.push(aStart2X, 500 - aStart2Y, 0.16);
      apronPos.push(aEnd2X, 500 - aEnd2Y, 0.14);

      const au1 = cumDist[i] / 26;
      const au2 = cumDist[i + 1] / 26;
      apronUvs.push(au1, 0, au1, 1, au2, 0, au2, 1);
      apronIdx.push(aVertCount, aVertCount + 1, aVertCount + 2);
      apronIdx.push(aVertCount + 1, aVertCount + 3, aVertCount + 2);
      aVertCount += 4;

      // Raked Limestone Gravel Trap beyond the FIA friction apron
      const g1x = o1.x + nx1 * stripW1;
      const g1y = o1.y + ny1 * stripW1;
      const g2x = o2.x + nx2 * stripW2;
      const g2y = o2.y + ny2 * stripW2;

      gravelPos.push(aEnd1X, 500 - aEnd1Y, 0.12);
      gravelPos.push(g1x, 500 - g1y, 0.08);
      gravelPos.push(aEnd2X, 500 - aEnd2Y, 0.12);
      gravelPos.push(g2x, 500 - g2y, 0.08);

      const u1 = cumDist[i] / 55;
      const u2 = cumDist[i + 1] / 55;
      gravelUvs.push(u1, 0, u1, 1, u2, 0, u2, 1);

      gravelIndices.push(gVertCount, gVertCount + 1, gVertCount + 2);
      gravelIndices.push(gVertCount + 1, gVertCount + 3, gVertCount + 2);
      gVertCount += 4;

      // 3D Dark Rubber & FIA Blue/White Tecpro Tire Stack Columns along outer corner wall
      const tx = o1.x + nx1 * (stripW1 + 0.8);
      const ty = 500 - (o1.y + ny1 * (stripW1 + 0.8));
      const isBlue = i % 2 === 0;
      tireTransforms.push(
        { x: tx, y: ty, z: 0.7, color: '#181c24' },
        { x: tx, y: ty, z: 1.9, color: isBlue ? '#0284c7' : '#e2e8f0' }
      );

      // Embedded Solar LED Apex Cat-Eye Studs along inner & outer kerbs
      catEyes.push(
        {
          x: i1.x - nx1 * 1.1,
          y: 500 - (i1.y - ny1 * 1.1),
          z: b1.innerZ + 0.28,
          color: i % 2 === 0 ? '#10b981' : '#fbbf24'
        },
        {
          x: o1.x + nx1 * 1.1,
          y: 500 - (o1.y + ny1 * 1.1),
          z: b1.outerZ + 0.28,
          color: i % 2 === 0 ? '#ef4444' : '#38bdf8'
        }
      );

      // Place glowing FIA Digital LED Marshal Flag Panels at key corner apexes
      if (i % 9 === 0 && b1.curvature > 0.005) {
        const aimAngle = Math.atan2(-ny1, -nx1);
        marshals.push({
          x: o1.x + nx1 * (stripW1 + 1.8),
          y: 500 - (o1.y + ny1 * (stripW1 + 1.8)),
          z: 4.5,
          angle: -aimAngle
        });
      }
    }

    const apronGeo = new THREE.BufferGeometry();
    if (apronPos.length > 0) {
      apronGeo.setAttribute('position', new THREE.Float32BufferAttribute(apronPos, 3));
      apronGeo.setAttribute('uv', new THREE.Float32BufferAttribute(apronUvs, 2));
      apronGeo.setIndex(apronIdx);
      apronGeo.computeVertexNormals();
    }

    const gravelGeo = new THREE.BufferGeometry();
    if (gravelPos.length > 0) {
      gravelGeo.setAttribute('position', new THREE.Float32BufferAttribute(gravelPos, 3));
      gravelGeo.setAttribute('uv', new THREE.Float32BufferAttribute(gravelUvs, 2));
      gravelGeo.setIndex(gravelIndices);
      gravelGeo.computeVertexNormals();
    }

    // 4. Perimeter FIA Sponsor Tecpro Barrier Wall + Upper Debris Catch-Fencing Ribbon
    const barPos: number[] = [];
    const barUvs: number[] = [];
    const barIdx: number[] = [];

    const fencePos: number[] = [];
    const fenceIdx: number[] = [];
    const wallHeight = 2.8;
    const fenceHeight = 6.6;

    for (let i = 0; i <= len; i++) {
      const idx = i % len;
      const oPt = outer[idx];
      const iPt = inner[idx];
      const dx = oPt.x - iPt.x;
      const dy = oPt.y - iPt.y;
      const dLen = Math.hypot(dx, dy) || 1;
      const b = banking[idx];
      const offset = b.curvature > 0.0032 ? Math.min(31, 15 + b.curvature * 1200) : 13.5;

      const bx = oPt.x + (dx / dLen) * offset;
      const by = oPt.y + (dy / dLen) * offset;
      barPos.push(bx, 500 - by, 0.0);
      barPos.push(bx, 500 - by, wallHeight);

      const u = cumDist[i] / 95;
      barUvs.push(u, 0);
      barUvs.push(u, 1);

      fencePos.push(bx, 500 - by, wallHeight);
      fencePos.push(bx, 500 - by, fenceHeight);
    }

    for (let i = 0; i < len; i++) {
      const v0 = i * 2;
      const v1 = (i + 1) * 2;
      barIdx.push(v0, v1, v0 + 1);
      barIdx.push(v1, v1 + 1, v0 + 1);

      fenceIdx.push(v0, v1, v0 + 1);
      fenceIdx.push(v1, v1 + 1, v0 + 1);
    }

    const barGeo = new THREE.BufferGeometry();
    barGeo.setAttribute('position', new THREE.Float32BufferAttribute(barPos, 3));
    barGeo.setAttribute('uv', new THREE.Float32BufferAttribute(barUvs, 2));
    barGeo.setIndex(barIdx);
    barGeo.computeVertexNormals();

    const fenceGeo = new THREE.BufferGeometry();
    fenceGeo.setAttribute('position', new THREE.Float32BufferAttribute(fencePos, 3));
    fenceGeo.setIndex(fenceIdx);
    fenceGeo.computeVertexNormals();

    // 5. Start/Finish line & Overhead FIA Gantry Transform
    const p1 = track.startLine.p1;
    const p2 = track.startLine.p2;
    const v1 = new THREE.Vector3(p1.x, 500 - p1.y, 0.62);
    const v2 = new THREE.Vector3(p2.x, 500 - p2.y, 0.62);
    const mid = v1.clone().add(v2).multiplyScalar(0.5);
    const fullDist = Math.max(40, v1.distanceTo(v2) - 14);
    const dir = v2.clone().sub(v1).normalize();
    const startQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    // 6. 3D Overhead Sector Timing Bridges at S1, S2, S3
    const secGantries = track.checkpoints.map((cp, idx) => {
      const cv1 = new THREE.Vector3(cp.p1.x, 500 - cp.p1.y, 0.5);
      const cv2 = new THREE.Vector3(cp.p2.x, 500 - cp.p2.y, 0.5);
      const cMid = cv1.clone().add(cv2).multiplyScalar(0.5);
      const cSpan = Math.max(46, cv1.distanceTo(cv2) + 8);
      const cDir = cv2.clone().sub(cv1).normalize();
      const cQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), cDir);
      const bannerColors = ['#f59e0b', '#06b6d4', '#10b981'];
      return {
        key: `sector-arch-${idx}`,
        position: cMid,
        quaternion: cQuat,
        span: cSpan,
        color: bannerColors[idx % bannerColors.length],
        texture: createGantryBannerTexture(
          maxAnisotropy,
          `SECTOR ${idx + 1}  ·  FIA TIMING`,
          bannerColors[idx % bannerColors.length]
        )
      };
    });

    // 7. Painted FIA Starting Grid Slots behind start line
    const slots = track.startGrid.slice(0, 4).map((slot, idx) => ({
      key: `grid-slot-${idx}`,
      position: [slot.x, 500 - slot.y, 0.63] as [number, number, number],
      angle: -slot.angle
    }));

    // 8. FIA DRS Activation Zone White Line + Glowing Green Trackside DRS Marker Boards
    const drsIndices = [Math.floor(len * 0.09), Math.floor(len * 0.56)];
    const drsZones = drsIndices.map((dIdx, idx) => {
      const rIdx = dIdx % len;
      const oRaw = outer[rIdx];
      const iRaw = inner[rIdx];
      const b = banking[rIdx];
      const oP = new THREE.Vector3(oRaw.x, 500 - oRaw.y, b.outerZ);
      const iP = new THREE.Vector3(iRaw.x, 500 - iRaw.y, b.innerZ);
      const dMid = oP.clone().add(iP).multiplyScalar(0.5);
      dMid.z += 0.34;
      const dSpan = Math.max(40, oP.distanceTo(iP) - 10);
      const dDir = iP.clone().sub(oP).normalize();
      const dQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dDir);
      return {
        key: `drs-zone-${idx}`,
        position: dMid,
        quaternion: dQuat,
        span: dSpan
      };
    });

    // 9. Circuit de Monaco 3D Louis II Tunnel Ribbed Architectural Canopy & Warm Interior Ceiling Lights
    const tunnelArches: {
      key: string;
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      span: number;
    }[] = [];

    if (track.id === 'monaco') {
      const tunnelIndices = [48, 51, 54, 57, 60, 63];
      tunnelIndices.forEach((tIdx) => {
        const rIdx = tIdx % len;
        const oRaw = outer[rIdx];
        const iRaw = inner[rIdx];
        const b = banking[rIdx];
        const oP = new THREE.Vector3(oRaw.x, 500 - oRaw.y, b.outerZ);
        const iP = new THREE.Vector3(iRaw.x, 500 - iRaw.y, b.innerZ);
        const tMid = oP.clone().add(iP).multiplyScalar(0.5);
        const tSpan = Math.max(54, oP.distanceTo(iP) + 12);
        const tDir = iP.clone().sub(oP).normalize();
        const tQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tDir);
        tunnelArches.push({
          key: `monaco-tunnel-rib-${tIdx}`,
          position: tMid,
          quaternion: tQuat,
          span: tSpan
        });
      });
    }

    const mainGantryTitle =
      track.id === 'jarama'
        ? 'CIRCUITO DEL JARAMA  ·  RACE MADRID'
        : track.id === 'madring'
          ? 'MADRING F1  ·  IFEMA MADRID GP'
          : track.id === 'monaco'
            ? 'FORMULA 1  ·  GRAND PRIX DE MONACO'
            : 'GRAND PRIX  ·  DRAW RACE  ·  FIA';

    return {
      bankedTrackGeometry: geometry,
      runoffApronGeometry: apronGeo,
      gravelTrapGeometry: gravelGeo,
      outerKerbGeometry: outerKerbGeo,
      innerKerbGeometry: innerKerbGeo,
      barrierGeometry: barGeo,
      catchFenceGeometry: fenceGeo,
      tireStackTransforms: tireTransforms,
      apexCatEyeTransforms: catEyes,
      marshalPanels: marshals,
      asphaltMaps: createNextGenAsphaltMaps(maxAnisotropy, lightingPreset, weather),
      runoffApronTexture: createRunoffApronTexture(maxAnisotropy),
      gravelTexture: createGravelTexture(maxAnisotropy),
      kerbMaps: createKerbMaps(maxAnisotropy),
      barrierTexture: createBarrierSponsorTexture(maxAnisotropy),
      checkerTexture: createCheckerTexture(maxAnisotropy),
      gantryTexture: createGantryBannerTexture(maxAnisotropy, mainGantryTitle, '#10b981'),
      sectorGantries: secGantries,
      startLineTransform: { position: mid, quaternion: startQuat, length: fullDist },
      gridSlots: slots,
      drsActivationZones: drsZones,
      monacoTunnelArches: tunnelArches
    };
  }, [track, maxAnisotropy, lightingPreset, weather]);

  // Populate 3D FIA Tire Wall InstancedMesh & Solar LED Apex Cat-Eye Studs
  useEffect(() => {
    const mesh = tireWallInstancedRef.current;
    if (mesh && tireStackTransforms.length > 0) {
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      mesh.count = tireStackTransforms.length;

      tireStackTransforms.forEach((t, idx) => {
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        color.set(t.color);
        mesh.setColorAt(idx, color);
      });

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }

    const catMesh = apexCatEyesRef.current;
    if (catMesh && apexCatEyeTransforms.length > 0) {
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      catMesh.count = apexCatEyeTransforms.length;

      apexCatEyeTransforms.forEach((c, idx) => {
        dummy.position.set(c.x, c.y, c.z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        catMesh.setMatrixAt(idx, dummy.matrix);
        color.set(c.color);
        catMesh.setColorAt(idx, color);
      });

      catMesh.instanceMatrix.needsUpdate = true;
      if (catMesh.instanceColor) catMesh.instanceColor.needsUpdate = true;
      catMesh.computeBoundingSphere();
    }
  }, [tireStackTransforms, apexCatEyeTransforms]);

  useEffect(() => {
    return () => {
      asphaltMaps.map.dispose();
      asphaltMaps.roughnessMap.dispose();
      asphaltMaps.normalMap.dispose();
      runoffApronTexture.dispose();
      gravelTexture.dispose();
      kerbMaps.map.dispose();
      kerbMaps.normalMap.dispose();
      barrierTexture.dispose();
      checkerTexture.dispose();
      gantryTexture.dispose();
      sectorGantries.forEach((sg) => sg.texture.dispose());
    };
  }, [
    asphaltMaps,
    runoffApronTexture,
    gravelTexture,
    kerbMaps,
    barrierTexture,
    checkerTexture,
    gantryTexture,
    sectorGantries
  ]);

  const countNum = countdownValue ? parseInt(countdownValue, 10) : 0;
  const isLightsOutGo = countdownValue === '¡YA!';

  return (
    <group>
      {/* Modern FIA High-Friction Blue-Slate Corner Runoff Aprons */}
      <mesh geometry={runoffApronGeometry} receiveShadow>
        <meshStandardMaterial
          map={runoffApronTexture}
          roughness={0.78}
          metalness={0.08}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Raked FIA Limestone Gravel Runoff Traps */}
      <mesh geometry={gravelTrapGeometry} receiveShadow>
        <meshStandardMaterial
          map={gravelTexture}
          roughness={0.95}
          metalness={0.02}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Next-Gen 1024px 3D Banked Tarmac Surface with RGB Normal Map + Specular Rubber Groove + Wet Puddle Ripples */}
      <mesh geometry={bankedTrackGeometry} receiveShadow castShadow>
        <meshPhysicalMaterial
          map={asphaltMaps.map}
          roughnessMap={asphaltMaps.roughnessMap}
          normalMap={asphaltMaps.normalMap}
          normalScale={_asphaltNormalScale}
          roughness={weather === 'rain' ? 0.38 : 0.78}
          metalness={weather === 'rain' ? 0.24 : 0.16}
          clearcoat={
            weather === 'rain'
              ? 0.96
              : lightingPreset === 'night'
                ? 0.82
                : lightingPreset === 'sunset'
                  ? 0.32
                  : 0.22
          }
          clearcoatRoughness={weather === 'rain' ? 0.04 : lightingPreset === 'night' ? 0.07 : 0.24}
          envMapIntensity={weather === 'rain' ? 2.55 : lightingPreset === 'night' ? 1.95 : 1.25}
          onBeforeCompile={handleAsphaltBeforeCompile}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Continuous Serrated FIA 3D Rumble Kerbs with Relief Normal Maps */}
      <mesh geometry={outerKerbGeometry} receiveShadow castShadow>
        <meshStandardMaterial
          map={kerbMaps.map}
          normalMap={kerbMaps.normalMap}
          normalScale={_kerbNormalScale}
          roughness={weather === 'rain' ? 0.18 : 0.42}
          metalness={weather === 'rain' ? 0.22 : 0.12}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={innerKerbGeometry} receiveShadow castShadow>
        <meshStandardMaterial
          map={kerbMaps.map}
          normalMap={kerbMaps.normalMap}
          normalScale={_kerbNormalScale}
          roughness={weather === 'rain' ? 0.18 : 0.42}
          metalness={weather === 'rain' ? 0.22 : 0.12}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 3D Embedded Solar LED Apex Cat-Eye Reflector Studs along Corner Kerbs */}
      <instancedMesh
        ref={apexCatEyesRef}
        args={[undefined, undefined, Math.max(1, apexCatEyeTransforms.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.65, 0.65, 0.18]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#38bdf8"
          emissiveIntensity={lightingPreset === 'night' || weather === 'rain' ? 4.8 : 1.8}
          roughness={0.2}
          metalness={0.8}
        />
      </instancedMesh>

      {/* 3D Instanced FIA Tire Barrier Stacks on Corner Runoffs */}
      <instancedMesh
        ref={tireWallInstancedRef}
        args={[undefined, undefined, Math.max(1, tireStackTransforms.length)]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[1.45, 1.45, 1.15, 12]} />
        <meshStandardMaterial roughness={0.62} metalness={0.08} />
      </instancedMesh>

      {/* Glowing FIA Digital LED Trackside Marshal Flag Boards */}
      {marshalPanels.map((mp, idx) => (
        <group key={`marshal-${idx}`} position={[mp.x, mp.y, mp.z]} rotation={[0, 0, mp.angle]}>
          <mesh position={[0, 0, -2.2]} castShadow>
            <cylinderGeometry args={[0.25, 0.3, 4.5, 6]} />
            <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.8} />
          </mesh>
          <mesh castShadow>
            <boxGeometry args={[0.5, 3.2, 2.2]} />
            <meshStandardMaterial color="#090d16" roughness={0.4} metalness={0.6} />
          </mesh>
          <mesh position={[0.28, 0, 0]} material={marshalLedMat}>
            <boxGeometry args={[0.08, 2.7, 1.7]} />
          </mesh>
        </group>
      ))}

      {/* Perimeter FIA Sponsor Tecpro Barriers */}
      <mesh geometry={barrierGeometry} castShadow receiveShadow>
        <meshStandardMaterial
          map={barrierTexture}
          roughness={0.36}
          metalness={0.30}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Perimeter Debris Catch-Fencing above the Tecpro Wall */}
      <mesh geometry={catchFenceGeometry}>
        <meshStandardMaterial
          color="#64748b"
          transparent
          opacity={0.22}
          roughness={0.28}
          metalness={0.86}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Painted FIA Staggered Starting Grid Boxes + Yellow Front-Axle Alignment Lines + Rubbered-In Launch Burnout Patches */}
      {gridSlots.map((slot) => (
        <group key={slot.key} position={slot.position} rotation={[0, 0, slot.angle]}>
          <mesh position={[8.5, 0, 0]}>
            <planeGeometry args={[1.1, 10.5]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.6} polygonOffset polygonOffsetFactor={-2} />
          </mesh>
          {/* Official FIA Yellow Front-Wheel Stop Alignment Line */}
          <mesh position={[7.2, -5.8, 0]}>
            <planeGeometry args={[0.7, 2.6]} />
            <meshStandardMaterial color="#facc15" roughness={0.5} polygonOffset polygonOffsetFactor={-3} />
          </mesh>
          <mesh position={[7.2, 5.8, 0]}>
            <planeGeometry args={[0.7, 2.6]} />
            <meshStandardMaterial color="#facc15" roughness={0.5} polygonOffset polygonOffsetFactor={-3} />
          </mesh>
          <mesh position={[5.0, -5.0, 0]}>
            <planeGeometry args={[7.2, 0.9]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.6} polygonOffset polygonOffsetFactor={-2} />
          </mesh>
          <mesh position={[5.0, 5.0, 0]}>
            <planeGeometry args={[7.2, 0.9]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.6} polygonOffset polygonOffsetFactor={-2} />
          </mesh>
          {/* Twin Rear-Tire Launch Burnout Rubber Strips */}
          <mesh position={[1.2, -2.85, 0]}>
            <planeGeometry args={[12.5, 1.45]} />
            <meshStandardMaterial
              color="#05070b"
              transparent
              opacity={0.46}
              roughness={0.32}
              polygonOffset
              polygonOffsetFactor={-1}
            />
          </mesh>
          <mesh position={[1.2, 2.85, 0]}>
            <planeGeometry args={[12.5, 1.45]} />
            <meshStandardMaterial
              color="#05070b"
              transparent
              opacity={0.46}
              roughness={0.32}
              polygonOffset
              polygonOffsetFactor={-1}
            />
          </mesh>
        </group>
      ))}

      {/* Checkered F1 Start / Finish Line */}
      <mesh
        position={startLineTransform.position}
        quaternion={startLineTransform.quaternion}
        receiveShadow
      >
        <planeGeometry args={[6.2, startLineTransform.length]} />
        <meshStandardMaterial
          map={checkerTexture}
          roughness={0.52}
          polygonOffset
          polygonOffsetFactor={-3}
        />
      </mesh>

      {/* FIA DRS Detection & Activation Zone Lines + Glowing Emerald Trackside DRS Boards */}
      {drsActivationZones.map((dz) => (
        <group
          key={dz.key}
          position={[dz.position.x, dz.position.y, dz.position.z]}
          quaternion={dz.quaternion}
        >
          <mesh>
            <planeGeometry args={[1.6, dz.span]} />
            <meshStandardMaterial
              color="#34d399"
              emissive="#10b981"
              emissiveIntensity={0.85}
              roughness={0.4}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          </mesh>
          <mesh position={[0, -dz.span * 0.56, 3.6]} castShadow>
            <boxGeometry args={[1.2, 3.8, 3.2]} />
            <meshStandardMaterial
              color="#065f46"
              emissive="#10b981"
              emissiveIntensity={lightingPreset === 'night' ? 3.2 : 1.6}
            />
          </mesh>
        </group>
      ))}

      {/* Circuit de Monaco 3D Louis II Tunnel Ribbed Concrete/Glass Canopy with Warm Ceiling Strips */}
      {monacoTunnelArches.map((ta) => (
        <group
          key={ta.key}
          position={[ta.position.x, ta.position.y, ta.position.z]}
          quaternion={ta.quaternion}
        >
          {/* Left & Right Tunnel Concrete Colonade Pillars */}
          <mesh position={[0, -ta.span * 0.54, 7.5]} castShadow>
            <boxGeometry args={[3.4, 2.6, 15]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.55} metalness={0.2} />
          </mesh>
          <mesh position={[0, ta.span * 0.54, 7.5]} castShadow>
            <boxGeometry args={[3.4, 2.6, 15]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.55} metalness={0.2} />
          </mesh>
          {/* Semi-Transparent Ribbed Tunnel Ceiling Slab */}
          <mesh position={[0, 0, 15.2]}>
            <boxGeometry args={[5.2, ta.span * 1.12, 1.4]} />
            <meshStandardMaterial
              color="#475569"
              transparent
              opacity={0.45}
              roughness={0.35}
              metalness={0.55}
            />
          </mesh>
          {/* Warm Amber Monte-Carlo Tunnel Sodium/LED Ceiling Light Strip */}
          <mesh position={[0, 0, 14.3]}>
            <boxGeometry args={[1.6, ta.span * 0.96, 0.35]} />
            <meshStandardMaterial
              color="#fbbf24"
              emissive="#f59e0b"
              emissiveIntensity={lightingPreset === 'night' ? 6.5 : 4.2}
            />
          </mesh>
        </group>
      ))}

      {/* 3D Overhead FIA Sector Timing Arches (S1, S2, S3) with Glowing LED Accent Strips */}
      {sectorGantries.map((sg) => (
        <group
          key={sg.key}
          position={[sg.position.x, sg.position.y, sg.position.z]}
          quaternion={sg.quaternion}
        >
          <mesh position={[0, -sg.span * 0.54, 8.0]} castShadow>
            <boxGeometry args={[2.0, 2.0, 16]} />
            <meshStandardMaterial color="#1e293b" roughness={0.32} metalness={0.82} />
          </mesh>
          <mesh position={[0, sg.span * 0.54, 8.0]} castShadow>
            <boxGeometry args={[2.0, 2.0, 16]} />
            <meshStandardMaterial color="#1e293b" roughness={0.32} metalness={0.82} />
          </mesh>
          <mesh position={[0, 0, 15.6]} castShadow>
            <boxGeometry args={[2.4, sg.span * 1.12, 2.8]} />
            <meshStandardMaterial map={sg.texture} roughness={0.30} metalness={0.38} />
          </mesh>
          {/* Neon Timing Arch LED Underside Strip */}
          <mesh position={[0, 0, 14.1]}>
            <boxGeometry args={[0.8, sg.span * 1.02, 0.25]} />
            <meshStandardMaterial
              color={sg.color}
              emissive={sg.color}
              emissiveIntensity={lightingPreset === 'night' ? 5.2 : 3.2}
            />
          </mesh>
        </group>
      ))}

      {/* Physical 3D Overhead FIA Starting Lights Gantry & Bridge */}
      <group
        position={[
          startLineTransform.position.x,
          startLineTransform.position.y,
          startLineTransform.position.z
        ]}
        quaternion={startLineTransform.quaternion}
      >
        <mesh position={[0, -startLineTransform.length * 0.56, 9.5]} castShadow receiveShadow>
          <boxGeometry args={[3.2, 2.8, 19]} />
          <meshStandardMaterial color="#334155" roughness={0.35} metalness={0.82} />
        </mesh>
        <mesh position={[0, startLineTransform.length * 0.56, 9.5]} castShadow receiveShadow>
          <boxGeometry args={[3.2, 2.8, 19]} />
          <meshStandardMaterial color="#334155" roughness={0.35} metalness={0.82} />
        </mesh>

        <mesh position={[0, 0, 18.2]} castShadow receiveShadow>
          <boxGeometry args={[3.6, startLineTransform.length * 1.18, 4.2]} />
          <meshStandardMaterial map={gantryTexture} roughness={0.30} metalness={0.35} />
        </mesh>
        {/* Architectural Carbon-Steel Upper Truss Cap & Side Diagonal Bracing */}
        <mesh position={[0, 0, 20.65]} castShadow>
          <boxGeometry args={[1.8, startLineTransform.length * 1.16, 0.7]} />
          <meshStandardMaterial color="#475569" roughness={0.28} metalness={0.86} />
        </mesh>
        <mesh position={[0, -startLineTransform.length * 0.44, 14.4]} rotation={[0.62, 0, 0]} castShadow>
          <boxGeometry args={[0.9, 9.2, 0.9]} />
          <meshStandardMaterial color="#475569" roughness={0.30} metalness={0.85} />
        </mesh>
        <mesh position={[0, startLineTransform.length * 0.44, 14.4]} rotation={[-0.62, 0, 0]} castShadow>
          <boxGeometry args={[0.9, 9.2, 0.9]} />
          <meshStandardMaterial color="#475569" roughness={0.30} metalness={0.85} />
        </mesh>

        {/* 5 Hanging FIA Red Starting Light Pods */}
        {[-12, -6, 0, 6, 12].map((yOff, idx) => {
          const lightNum = idx + 1;
          const litRed =
            !isLightsOutGo &&
            countdownValue !== null &&
            ((countNum === 3 && lightNum <= 2) ||
              (countNum === 2 && lightNum <= 4) ||
              countNum === 1);
          return (
            <group key={`gantry-pod-${idx}`} position={[0, yOff, 14.8]}>
              <mesh castShadow>
                <boxGeometry args={[1.4, 2.2, 3.0]} />
                <meshStandardMaterial color="#090d16" roughness={0.45} metalness={0.45} />
              </mesh>
              <mesh position={[0.76, 0, -0.4]}>
                <boxGeometry args={[0.18, 1.4, 1.4]} />
                <meshStandardMaterial
                  color={isLightsOutGo ? '#10b981' : litRed ? '#ef4444' : '#1e293b'}
                  emissive={isLightsOutGo ? '#10b981' : litRed ? '#ff1e42' : '#000000'}
                  emissiveIntensity={isLightsOutGo || litRed ? 9.0 : 0}
                />
              </mesh>
              <mesh position={[-0.76, 0, -0.4]}>
                <boxGeometry args={[0.18, 1.4, 1.4]} />
                <meshStandardMaterial
                  color={isLightsOutGo ? '#10b981' : litRed ? '#ef4444' : '#1e293b'}
                  emissive={isLightsOutGo ? '#10b981' : litRed ? '#ff1e42' : '#000000'}
                  emissiveIntensity={isLightsOutGo || litRed ? 9.0 : 0}
                />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
};
