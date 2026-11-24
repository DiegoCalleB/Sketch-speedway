import React, { useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { RaceCarState, Track, WeatherCondition } from '../../types';
import { getTrackSurfaceInfo } from '../../utils/tracks';
import { CARS_RENDER_LAYER } from './renderLayers';

interface Car3DProps {
  playerId?: string;
  carsStateRef?: React.MutableRefObject<RaceCarState[]>;
  track?: Track;
  isRacing?: boolean;
  weather?: WeatherCondition;
  color: string;
  position: [number, number, number];
  angle: number;
  driftAngle?: number;
  steerAngle?: number;
  slipAngle?: number;
  longitudinalG?: number;
  lateralG?: number;
  bankAngle?: number;
  isDrifting: boolean;
  isBraking: boolean;
  drsActive?: boolean;
  throttle?: number;
  name: string;
  active?: boolean;
  speed?: number;
  showLabel?: boolean;
  carNumber?: number;
}

// High-detail procedural woven carbon-fiber albedo + tangent normal map
const createCarbonFiberMaps = (maxAnisotropy: number) => {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const normCanvas = document.createElement('canvas');
  normCanvas.width = size;
  normCanvas.height = size;
  const nCtx = normCanvas.getContext('2d');

  if (!ctx || !nCtx) {
    return { map: new THREE.Texture(), normalMap: new THREE.Texture() };
  }

  ctx.fillStyle = '#090d14';
  ctx.fillRect(0, 0, size, size);
  nCtx.fillStyle = 'rgb(128, 128, 255)';
  nCtx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 8) {
    for (let x = 0; x < size; x += 8) {
      const alt = ((x + y) / 8) % 2 === 0;
      ctx.fillStyle = alt ? '#252f42' : '#111622';
      ctx.fillRect(x, y, 7, 4);
      ctx.fillStyle = alt ? '#111622' : '#2f3a50';
      ctx.fillRect(x, y + 4, 7, 4);

      nCtx.fillStyle = alt ? 'rgb(154, 120, 248)' : 'rgb(104, 136, 248)';
      nCtx.fillRect(x, y, 7, 4);
      nCtx.fillStyle = alt ? 'rgb(108, 146, 248)' : 'rgb(148, 114, 248)';
      nCtx.fillRect(x, y + 4, 7, 4);
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 5);
  map.anisotropy = maxAnisotropy;

  const normalMap = new THREE.CanvasTexture(normCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(6, 5);
  normalMap.anisotropy = maxAnisotropy;

  return { map, normalMap };
};

// Automotive Metallic-Flake Micro-Normal Map for real Ferrari/McLaren/Mercedes clearcoat shimmer
const createMetallicFlakeNormalMap = () => {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = 'rgb(128, 128, 255)';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 5500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 112 + Math.floor(Math.random() * 32);
    const g = 112 + Math.floor(Math.random() * 32);
    ctx.fillStyle = `rgb(${r}, ${g}, 252)`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  return tex;
};

// High-Resolution Procedural F1 Championship Livery Albedo Texture (Racing stripes, carbon-weave lower skirts, team badges & car number)
const createCarLiveryTexture = (baseColor: string, carNumber: number, maxAnisotropy: number) => {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  // Base metallic livery coat
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  // Subtle tonal metallic gradient along the body length
  const bodyGrad = ctx.createLinearGradient(0, 0, size, size);
  bodyGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.16)');
  bodyGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.0)');
  bodyGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0.22)');
  bodyGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.10)');
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(0, 0, size, size);

  // Exposed carbon-fiber lower aero skirt band
  ctx.fillStyle = '#0b0f17';
  ctx.fillRect(0, size * 0.78, size, size * 0.22);

  // Crisp championship twin aerodynamic swoosh stripes
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(0, size * 0.74);
  ctx.lineTo(size, size * 0.64);
  ctx.lineTo(size, size * 0.69);
  ctx.lineTo(0, size * 0.78);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(0, size * 0.78);
  ctx.lineTo(size, size * 0.69);
  ctx.lineTo(size, size * 0.72);
  ctx.lineTo(0, size * 0.81);
  ctx.closePath();
  ctx.fill();

  // Panel seam lines & aerodynamic fastener rivets
  ctx.strokeStyle = 'rgba(5, 8, 15, 0.36)';
  ctx.lineWidth = 2;
  for (let x = 64; x < size; x += 96) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 18, size * 0.75);
    ctx.stroke();
  }

  // Nosecone & engine cover circular white/carbon roundel with racing number
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.36, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#f8fafc';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'italic 900 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(carNumber || 1), size * 0.5, size * 0.37);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.18, 0.38);
  tex.anisotropy = maxAnisotropy;
  return tex;
};

// Procedural Pirelli P-Zero Tire Tread Normal & Roughness Map (Dry slick thermal graining vs Wet evacuation grooves)
const createTireTreadNormalMap = (weather: WeatherCondition, maxAnisotropy: number) => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = 'rgb(128, 128, 255)';
  ctx.fillRect(0, 0, size, size);

  if (weather === 'rain') {
    // Deep Pirelli Cinturato Blue/Green Wet evacuation circumferential & chevron grooves
    for (let x = 28; x < size; x += 36) {
      ctx.fillStyle = 'rgb(75, 128, 235)';
      ctx.fillRect(x, 0, 5, size);
      ctx.fillStyle = 'rgb(180, 128, 235)';
      ctx.fillRect(x + 5, 0, 5, size);
    }
    ctx.lineWidth = 4;
    for (let y = 0; y < size; y += 20) {
      ctx.strokeStyle = 'rgb(128, 182, 238)';
      ctx.beginPath();
      ctx.moveTo(16, y);
      ctx.lineTo(size * 0.5, y + 12);
      ctx.lineTo(size - 16, y);
      ctx.stroke();
    }
  } else {
    // High-grip Pirelli P-Zero Slick subtle circumferential wear bands & micro-rubber graining
    for (let i = 0; i < 2400; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const nx = 118 + Math.floor(Math.random() * 20);
      const ny = 118 + Math.floor(Math.random() * 20);
      ctx.fillStyle = `rgb(${nx}, ${ny}, 250)`;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 4);
  tex.anisotropy = maxAnisotropy;
  return tex;
};

// Cross-Drilled Carbon-Ceramic Brake Rotor Albedo Texture
const createBrakeRotorTexture = (maxAnisotropy: number) => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const cx = size * 0.5;
  const cy = size * 0.5;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, size, size);

  // Brushed concentric carbon-ceramic friction tracks
  for (let r = 42; r < 118; r += 3) {
    ctx.strokeStyle = r % 6 === 0 ? 'rgba(148, 163, 184, 0.28)' : 'rgba(15, 23, 42, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Cross-drilled cooling ventilation holes in spiral pattern
  ctx.fillStyle = '#090d16';
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
    for (let step = 0; step < 4; step++) {
      const rad = 52 + step * 16;
      const ang = a + step * 0.09;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
};

// Procedural Pirelli P-Zero 18-inch Tire Sidewall Ring Texture (shows realistic spinning motion!)
const createTireSidewallTexture = (accentColor: string, maxAnisotropy: number) => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const cx = size * 0.5;
  const cy = size * 0.5;

  ctx.clearRect(0, 0, size, size);

  // Dark rubber sidewall ring
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.49, 0, Math.PI * 2);
  ctx.fillStyle = '#12161f';
  ctx.fill();

  // Inner rim cutout
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.31, 0, Math.PI * 2);
  ctx.fillStyle = '#1c222e';
  ctx.fill();

  // Iconic dual-arc Pirelli compound stripe (makes wheel rotation immediately readable!)
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.39, 0.25, Math.PI - 0.25);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.39, Math.PI + 0.25, Math.PI * 2 - 0.25);
  ctx.stroke();

  // Crisp sidewall stencil dashes at opposite poles
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.43, -0.14, 0.14);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.43, Math.PI - 0.14, Math.PI + 0.14);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
};

// Procedural radial contact-shadow gradient under the F1 Venturi floor
const createContactShadowTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const grad = ctx.createRadialGradient(64, 32, 6, 64, 32, 60);
  grad.addColorStop(0.0, 'rgba(2, 6, 20, 0.94)');
  grad.addColorStop(0.55, 'rgba(2, 6, 20, 0.68)');
  grad.addColorStop(0.84, 'rgba(2, 6, 20, 0.22)');
  grad.addColorStop(1.0, 'rgba(2, 6, 20, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

// Build sculpted CAD-beveled aerodynamic geometries (no boxy primitives!)
const createSculptedF1Geometries = () => {
  // 1. Sleek tapered & sloped F1 Monocoque + Nosecone Side Profile extruded with rounded aerodynamic bevels
  const noseShape = new THREE.Shape();
  noseShape.moveTo(-4.85, 0.35);
  noseShape.lineTo(2.45, 0.35);
  noseShape.quadraticCurveTo(5.65, 0.34, 7.35, 0.22);
  noseShape.lineTo(7.45, 0.44);
  noseShape.quadraticCurveTo(5.25, 0.90, 2.15, 1.50);
  noseShape.lineTo(-1.35, 1.58);
  noseShape.quadraticCurveTo(-2.15, 2.42, -2.85, 2.30);
  noseShape.lineTo(-4.95, 1.38);
  noseShape.closePath();

  const monocoqueGeo = new THREE.ExtrudeGeometry(noseShape, {
    depth: 1.48,
    bevelEnabled: true,
    bevelSegments: 5,
    steps: 1,
    bevelSize: 0.22,
    bevelThickness: 0.24
  });
  monocoqueGeo.translate(0, 0, -0.74);
  monocoqueGeo.rotateX(Math.PI / 2);
  monocoqueGeo.computeVertexNormals();

  // 2. Sculpted Water-Slide Undercut Sidepod Geometry
  const podShape = new THREE.Shape();
  podShape.moveTo(-3.95, 0.38);
  podShape.lineTo(2.25, 0.38);
  podShape.quadraticCurveTo(2.48, 0.94, 2.18, 1.38);
  podShape.quadraticCurveTo(0.42, 1.44, -1.62, 1.16);
  podShape.quadraticCurveTo(-3.25, 0.86, -3.95, 0.65);
  podShape.closePath();

  const sidepodGeo = new THREE.ExtrudeGeometry(podShape, {
    depth: 1.08,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 1,
    bevelSize: 0.18,
    bevelThickness: 0.22
  });
  sidepodGeo.translate(0, 0, -0.54);
  sidepodGeo.rotateX(Math.PI / 2);
  sidepodGeo.computeVertexNormals();

  const leftSidepodGeo = sidepodGeo.clone();
  const rightSidepodGeo = sidepodGeo;

  // 3. Swept Delta Front Wing Mainplane Profile
  const fwShape = new THREE.Shape();
  fwShape.moveTo(-0.35, -3.32);
  fwShape.quadraticCurveTo(0.35, -1.6, 0.65, 0.0);
  fwShape.quadraticCurveTo(0.35, 1.6, -0.35, 3.32);
  fwShape.lineTo(-0.98, 3.32);
  fwShape.quadraticCurveTo(-0.42, 1.5, -0.22, 0.0);
  fwShape.quadraticCurveTo(-0.42, -1.5, -0.98, -3.32);
  fwShape.closePath();

  const frontWingGeo = new THREE.ExtrudeGeometry(fwShape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.04,
    bevelThickness: 0.04
  });
  frontWingGeo.computeVertexNormals();

  // 4. Curved Titanium Halo Tube
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.35, -0.78, 1.72),
    new THREE.Vector3(0.45, -0.74, 2.02),
    new THREE.Vector3(1.42, -0.36, 2.06),
    new THREE.Vector3(1.85, 0.0, 2.0),
    new THREE.Vector3(1.42, 0.36, 2.06),
    new THREE.Vector3(0.45, 0.74, 2.02),
    new THREE.Vector3(-0.35, 0.78, 1.72)
  ]);
  const haloCurveGeo = new THREE.TubeGeometry(curve, 28, 0.11, 10, false);

  // Store immutable pristine vertex buffers so 3D plastic denting can deform vertices in-place and reset cleanly
  const baseMonocoquePos = new Float32Array(
    (monocoqueGeo.attributes.position as THREE.BufferAttribute).array
  );
  const baseLeftPodPos = new Float32Array(
    (leftSidepodGeo.attributes.position as THREE.BufferAttribute).array
  );
  const baseRightPodPos = new Float32Array(
    (rightSidepodGeo.attributes.position as THREE.BufferAttribute).array
  );
  const baseFrontWingPos = new Float32Array(
    (frontWingGeo.attributes.position as THREE.BufferAttribute).array
  );

  return {
    monocoqueGeo,
    leftSidepodGeo,
    rightSidepodGeo,
    frontWingGeo,
    haloCurveGeo,
    baseMonocoquePos,
    baseLeftPodPos,
    baseRightPodPos,
    baseFrontWingPos
  };
};

// Physically crumple & dent 3D monocoque + nosecone BufferGeometry vertices based on 4-zone impact damage
const applyMonocoqueVertexDents = (
  geo: THREE.BufferGeometry,
  basePos: Float32Array,
  dmgFront: number,
  dmgRear: number,
  dmgLeft: number,
  dmgRight: number
) => {
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;
  const len = basePos.length;

  for (let i = 0; i < len; i += 3) {
    let x = basePos[i];
    let y = basePos[i + 1];
    let z = basePos[i + 2];

    // 1. Nosecone frontal impact crumpling (x > 1.8)
    if (dmgFront > 0.005 && x > 1.8) {
      const frontRatio = Math.min(1, (x - 1.8) / 5.65);
      const ripple = Math.sin(x * 3.8 + y * 5.2) * 0.22 + Math.cos(z * 6.0 - x * 2.7) * 0.14;
      // Accordion longitudinal crush + downward nose buckle + lateral twist
      x -= frontRatio * frontRatio * dmgFront * 1.45;
      z -= frontRatio * dmgFront * (0.38 - ripple * 0.55);
      y += frontRatio * dmgFront * (ripple * 0.42 + (dmgLeft - dmgRight) * 0.35);
    }

    // 2. Rear attenuator & engine cover tail impact crumpling (x < -2.2)
    if (dmgRear > 0.005 && x < -2.2) {
      const rearRatio = Math.min(1, (-2.2 - x) / 2.75);
      const ripple = Math.sin(x * 4.4 - y * 4.8) * 0.2;
      x += rearRatio * rearRatio * dmgRear * 1.15;
      z += rearRatio * dmgRear * (0.24 + ripple * 0.45);
      y += rearRatio * dmgRear * ripple * 0.32;
    }

    // 3. Left monocoque flank denting (y < -0.15 in 3D car local coordinates)
    if (dmgLeft > 0.005 && y < -0.15 && x > -3.8 && x < 4.5) {
      const longEnvelope = Math.max(0, 1 - Math.abs(x - 0.3) / 4.2);
      const crease = Math.sin(x * 3.6 + z * 5.0) * 0.16;
      y += longEnvelope * dmgLeft * (0.36 + crease);
      z += longEnvelope * dmgLeft * crease * 0.45;
    }

    // 4. Right monocoque flank denting (y > 0.15 in 3D car local coordinates)
    if (dmgRight > 0.005 && y > 0.15 && x > -3.8 && x < 4.5) {
      const longEnvelope = Math.max(0, 1 - Math.abs(x - 0.3) / 4.2);
      const crease = Math.cos(x * 3.6 - z * 5.0) * 0.16;
      y -= longEnvelope * dmgRight * (0.36 + crease);
      z += longEnvelope * dmgRight * crease * 0.45;
    }

    arr[i] = x;
    arr[i + 1] = y;
    arr[i + 2] = z;
  }

  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
};

// Physically cave in & corrugate the left or right aerodynamic sidepod mesh on barrier or wheel-to-wheel impact
const applySidepodVertexDents = (
  geo: THREE.BufferGeometry,
  basePos: Float32Array,
  sideDmg: number,
  frontDmg: number,
  isLeftPod: boolean
) => {
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;
  const len = basePos.length;
  const inwardDir = isLeftPod ? 1 : -1;

  for (let i = 0; i < len; i += 3) {
    let x = basePos[i];
    let y = basePos[i + 1];
    let z = basePos[i + 2];

    if (sideDmg > 0.005) {
      // Outer sidepod wall caves inward toward the radiator core with realistic corrugated dent waves
      const outerWeight = isLeftPod ? Math.max(0, (0.65 - y) / 1.35) : Math.max(0, (y + 0.65) / 1.35);
      const midPodWeight = Math.max(0.18, 1 - Math.abs(x + 0.4) / 3.8);
      const dentWave = Math.sin(x * 3.4 + z * 5.5) * 0.24 + Math.cos(x * 6.2) * 0.12;
      const crushDepth = outerWeight * midPodWeight * sideDmg;

      y += inwardDir * crushDepth * (0.68 + dentWave * 0.45);
      z += crushDepth * (dentWave * 0.38 - 0.12);
      x -= crushDepth * 0.22 * Math.sin(z * 4.2);
    }

    if (frontDmg > 0.005 && x > 0.6) {
      const leadRatio = Math.min(1, (x - 0.6) / 1.85);
      x -= leadRatio * frontDmg * 0.42;
      z -= leadRatio * frontDmg * 0.16;
    }

    arr[i] = x;
    arr[i + 1] = y;
    arr[i + 2] = z;
  }

  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
};

// Physically bend & buckle the carbon front wing mainplane tips on frontal/side impact
const applyFrontWingVertexDents = (
  geo: THREE.BufferGeometry,
  basePos: Float32Array,
  dmgFront: number,
  dmgLeft: number,
  dmgRight: number
) => {
  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;
  const len = basePos.length;

  for (let i = 0; i < len; i += 3) {
    let x = basePos[i];
    let y = basePos[i + 1];
    let z = basePos[i + 2];

    const spanRatio = Math.abs(y) / 3.35;
    if (dmgFront > 0.005) {
      const wave = Math.sin(y * 2.8 + x * 4.0) * 0.18;
      x -= (0.35 + spanRatio * 0.65) * dmgFront * 0.62;
      z += (spanRatio * 0.42 - 0.18 + wave) * dmgFront * 0.55;
    }
    if (dmgLeft > 0.005 && y < -0.8) {
      const leftSpan = Math.min(1, (-y - 0.8) / 2.55);
      x -= leftSpan * dmgLeft * 0.52;
      z += leftSpan * dmgLeft * 0.36;
      y += leftSpan * dmgLeft * 0.28;
    }
    if (dmgRight > 0.005 && y > 0.8) {
      const rightSpan = Math.min(1, (y - 0.8) / 2.55);
      x -= rightSpan * dmgRight * 0.52;
      z -= rightSpan * dmgRight * 0.28;
      y -= rightSpan * dmgRight * 0.28;
    }

    arr[i] = x;
    arr[i + 1] = y;
    arr[i + 2] = z;
  }

  posAttr.needsUpdate = true;
  geo.computeVertexNormals();
};

const _normalScaleCarbon = new THREE.Vector2(1.25, 1.25);
const _normalScaleFlake = new THREE.Vector2(0.18, 0.18);
const _colBrakeRed = new THREE.Color('#ff1e42');
const _colCyan = new THREE.Color('#22d3ee');
const _colDarkRain = new THREE.Color('#7f1d1d');
const _colDarkBrake = new THREE.Color('#450a0a');

export const Car3D: React.FC<Car3DProps> = ({
  playerId,
  carsStateRef,
  track,
  isRacing = false,
  weather = 'dry',
  color,
  position,
  angle,
  steerAngle = 0,
  longitudinalG = 0,
  lateralG = 0,
  bankAngle = 0,
  isDrifting,
  isBraking,
  drsActive = false,
  throttle = 0,
  name,
  active = false,
  speed = 0,
  showLabel = false,
  carNumber = 1
}) => {
  const { gl } = useThree();
  const maxAnisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());

  const rootGroupRef = useRef<THREE.Group>(null);
  const contactShadowRef = useRef<THREE.Mesh>(null);
  const carGroupRef = useRef<THREE.Group>(null);
  const chassisBodyRef = useRef<THREE.Group>(null);
  const frontWingGroupRef = useRef<THREE.Group>(null);
  const rearWingGroupRef = useRef<THREE.Group>(null);
  const leftSidepodMeshRef = useRef<THREE.Mesh>(null);
  const rightSidepodMeshRef = useRef<THREE.Mesh>(null);
  const leftMirrorGroupRef = useRef<THREE.Group>(null);
  const rightMirrorGroupRef = useRef<THREE.Group>(null);
  const monocoqueMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const leftPodMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const rightPodMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const frontLeftWheelGroupRef = useRef<THREE.Group>(null);
  const frontRightWheelGroupRef = useRef<THREE.Group>(null);
  const rearLeftWheelGroupRef = useRef<THREE.Group>(null);
  const rearRightWheelGroupRef = useRef<THREE.Group>(null);
  const frontLeftTireRef = useRef<THREE.Group>(null);
  const frontRightTireRef = useRef<THREE.Group>(null);
  const rearLeftTireRef = useRef<THREE.Group>(null);
  const rearRightTireRef = useRef<THREE.Group>(null);
  const steeringWheelRef = useRef<THREE.Group>(null);
  const driverHelmetRef = useRef<THREE.Group>(null);
  const drsFlapRef = useRef<THREE.Mesh>(null);
  const exhaustFlameRef = useRef<THREE.Group>(null);
  const leftVortexRef = useRef<THREE.Mesh>(null);
  const rightVortexRef = useRef<THREE.Mesh>(null);
  const tailLightPointRef = useRef<THREE.PointLight>(null);
  const skidSparkLightRef = useRef<THREE.PointLight>(null);

  const smoothYawRef = useRef<number>(-angle);
  const brakeHeatRef = useRef<number>(0);
  // Track currently applied 3D vertex deformation so we only update BufferGeometry on impact changes
  const appliedDamageRef = useRef({
    front: 0,
    rear: 0,
    left: 0,
    right: 0,
    lastImpactBounce: 0
  });
  // Second-order spring-damper chassis suspension state (zero per-frame allocations)
  const suspRef = useRef({
    pitch: 0,
    pitchVel: 0,
    roll: 0,
    rollVel: 0,
    heave: 0,
    heaveVel: 0
  });

  const flBrakeMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const frBrakeMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const rlBrakeMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const rrBrakeMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const steeringLedMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const rainLightMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const leftBrakeLedMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const rightBrakeLedMatRef = useRef<THREE.MeshStandardMaterial>(null);

  // Assign entire Car3D hierarchy strictly to CARS_RENDER_LAYER (Layer 1) with frustumCulled=false
  // so BOTH/ALL cars render in Pass 2 at native full-DPR sharpness with ZERO bloom smear or scenery occlusion
  useLayoutEffect(() => {
    const root = rootGroupRef.current;
    if (!root) return;
    root.traverse((obj) => {
      obj.layers.set(CARS_RENDER_LAYER);
      if ((obj as THREE.Light).isLight) {
        obj.layers.enable(0);
      }
      obj.frustumCulled = false;
    });
  }, [active, showLabel, isRacing]);

  // Synchronize initial / drawing-mode transforms imperatively so React HUD re-renders during 'racing'
  // can NEVER overwrite live physics positions managed inside useFrame
  useLayoutEffect(() => {
    if (!isRacing) {
      if (rootGroupRef.current) {
        rootGroupRef.current.visible = true;
        rootGroupRef.current.position.set(position[0], position[1], position[2]);
      }
      if (contactShadowRef.current) {
        contactShadowRef.current.rotation.set(0, 0, -angle);
      }
      if (carGroupRef.current) {
        carGroupRef.current.rotation.z = -angle;
      }
      smoothYawRef.current = -angle;
    } else if (rootGroupRef.current && carsStateRef?.current && playerId && track) {
      const liveCar = carsStateRef.current.find((c) => c.playerId === playerId);
      if (liveCar) {
        const carSurf = getTrackSurfaceInfo({ x: liveCar.x, y: liveCar.y }, track);
        rootGroupRef.current.position.set(liveCar.x, 500 - liveCar.y, carSurf.elevationZ + 0.15);
        if (contactShadowRef.current) contactShadowRef.current.rotation.set(0, 0, -liveCar.angle);
        if (carGroupRef.current) carGroupRef.current.rotation.z = -liveCar.angle;
        smoothYawRef.current = -liveCar.angle;
      } else {
        rootGroupRef.current.position.set(position[0], position[1], position[2]);
        if (contactShadowRef.current) contactShadowRef.current.rotation.set(0, 0, -angle);
        if (carGroupRef.current) carGroupRef.current.rotation.z = -angle;
        smoothYawRef.current = -angle;
      }
    }
  }, [isRacing, position[0], position[1], position[2], angle, carsStateRef, playerId, track]);

  const {
    carbonMaps,
    flakeNormalMap,
    liveryTex,
    tireTreadNormalMap,
    brakeRotorTex,
    tireSidewallTex,
    shadowTex,
    monocoqueGeo,
    leftSidepodGeo,
    rightSidepodGeo,
    frontWingGeo,
    haloCurveGeo,
    baseMonocoquePos,
    baseLeftPodPos,
    baseRightPodPos,
    baseFrontWingPos
  } = useMemo(() => {
    const cMaps = createCarbonFiberMaps(maxAnisotropy);
    const flake = createMetallicFlakeNormalMap();
    const liv = createCarLiveryTexture(color, carNumber, maxAnisotropy);
    const treadNorm = createTireTreadNormalMap(weather, maxAnisotropy);
    const rotorTex = createBrakeRotorTexture(maxAnisotropy);
    const sidewall = createTireSidewallTexture(
      weather === 'rain' ? '#38bdf8' : color,
      maxAnisotropy
    );
    const sTex = createContactShadowTexture();
    const geos = createSculptedF1Geometries();
    return {
      carbonMaps: cMaps,
      flakeNormalMap: flake,
      liveryTex: liv,
      tireTreadNormalMap: treadNorm,
      brakeRotorTex: rotorTex,
      tireSidewallTex: sidewall,
      shadowTex: sTex,
      ...geos
    };
  }, [color, carNumber, weather, maxAnisotropy]);

  useEffect(() => {
    return () => {
      carbonMaps.map.dispose();
      carbonMaps.normalMap.dispose();
      flakeNormalMap.dispose();
      liveryTex.dispose();
      tireTreadNormalMap.dispose();
      brakeRotorTex.dispose();
      tireSidewallTex.dispose();
      shadowTex.dispose();
      monocoqueGeo.dispose();
      leftSidepodGeo.dispose();
      rightSidepodGeo.dispose();
      frontWingGeo.dispose();
      haloCurveGeo.dispose();
    };
  }, [
    carbonMaps,
    flakeNormalMap,
    liveryTex,
    tireTreadNormalMap,
    brakeRotorTex,
    tireSidewallTex,
    shadowTex,
    monocoqueGeo,
    leftSidepodGeo,
    rightSidepodGeo,
    frontWingGeo,
    haloCurveGeo
  ]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const elapsed = state.clock.getElapsedTime();

    // Direct 60/120fps physics-ref synchronization during 'racing' (zero React reconciliation lag!)
    let liveSpeed = speed;
    let liveAngle = angle;
    let liveSteerAngle = steerAngle;
    let liveLongG = longitudinalG;
    let liveLatG = lateralG;
    let liveBankAngle = bankAngle;
    let liveDrifting = isDrifting;
    let liveBraking = isBraking;
    let liveDrs = drsActive;
    let liveThrottle = throttle;
    let liveOnCurb = false;
    let liveOffTrack = false;
    let liveShiftKick = 0;
    let liveDmgFront = 0;
    let liveDmgRear = 0;
    let liveDmgLeft = 0;
    let liveDmgRight = 0;
    let liveImpactSev = 0;
    let liveBounceCooldown = 0;

    if (isRacing && carsStateRef?.current && playerId && track) {
      const liveCar = carsStateRef.current.find((c) => c.playerId === playerId);
      if (liveCar) {
        if (rootGroupRef.current) {
          const isHidden = Boolean(liveCar.disqualified);
          rootGroupRef.current.visible = !isHidden;
          if (isHidden) return;
          const carSurf = getTrackSurfaceInfo({ x: liveCar.x, y: liveCar.y }, track);
          rootGroupRef.current.position.set(liveCar.x, 500 - liveCar.y, carSurf.elevationZ + 0.15);
          liveBankAngle = carSurf.bankAngleRad;
        }
        if (contactShadowRef.current) {
          contactShadowRef.current.rotation.z = -liveCar.angle;
        }
        liveSpeed = Math.hypot(liveCar.vx, liveCar.vy);
        liveAngle = liveCar.angle;
        liveSteerAngle = liveCar.steerAngle ?? 0;
        liveLongG = liveCar.longitudinalG ?? 0;
        liveLatG = liveCar.lateralG ?? 0;
        liveDrifting = liveCar.isDrifting;
        liveBraking = (liveCar.brake ?? 0) > 0.18 && liveSpeed > 1.4;
        liveDrs = Boolean(liveCar.drsActive);
        liveThrottle = liveCar.throttle ?? 0;
        liveOnCurb = Boolean(liveCar.onCurb);
        liveOffTrack = Boolean(liveCar.offTrack);
        liveShiftKick = liveCar.shiftKick ?? 0;
        liveDmgFront = liveCar.damageFront ?? 0;
        liveDmgRear = liveCar.damageRear ?? 0;
        liveDmgLeft = liveCar.damageLeft ?? 0;
        liveDmgRight = liveCar.damageRight ?? 0;
        liveImpactSev = liveCar.lastImpactSeverity ?? 0;
        liveBounceCooldown = liveCar.bounceCooldown ?? 0;
      }
    } else if (rootGroupRef.current) {
      rootGroupRef.current.visible = true;
      rootGroupRef.current.position.set(position[0], position[1], position[2]);
      if (contactShadowRef.current) {
        contactShadowRef.current.rotation.z = -angle;
      }
    }

    // 0. Real-Time 3D Mesh Vertex Crumpling, Denting & Component Buckling on Barrier / Car Collisions
    const prevDmg = appliedDamageRef.current;
    const dmgChanged =
      Math.abs(liveDmgFront - prevDmg.front) > 0.008 ||
      Math.abs(liveDmgRear - prevDmg.rear) > 0.008 ||
      Math.abs(liveDmgLeft - prevDmg.left) > 0.008 ||
      Math.abs(liveDmgRight - prevDmg.right) > 0.008;

    if (dmgChanged) {
      prevDmg.front = liveDmgFront;
      prevDmg.rear = liveDmgRear;
      prevDmg.left = liveDmgLeft;
      prevDmg.right = liveDmgRight;

      applyMonocoqueVertexDents(
        monocoqueGeo,
        baseMonocoquePos,
        liveDmgFront,
        liveDmgRear,
        liveDmgLeft,
        liveDmgRight
      );
      applySidepodVertexDents(leftSidepodGeo, baseLeftPodPos, liveDmgLeft, liveDmgFront, true);
      applySidepodVertexDents(rightSidepodGeo, baseRightPodPos, liveDmgRight, liveDmgFront, false);
      applyFrontWingVertexDents(
        frontWingGeo,
        baseFrontWingPos,
        liveDmgFront,
        liveDmgLeft,
        liveDmgRight
      );

      // Misalign & droop front wing assembly on frontal/corner impact
      if (frontWingGroupRef.current) {
        frontWingGroupRef.current.position.set(
          6.9 - liveDmgFront * 0.58,
          (liveDmgLeft - liveDmgRight) * 0.24,
          0.34 - liveDmgFront * 0.14
        );
        frontWingGroupRef.current.rotation.set(
          (liveDmgLeft - liveDmgRight) * 0.19,
          liveDmgFront * 0.22,
          (liveDmgLeft - liveDmgRight) * 0.16
        );
      }

      // Twist & tilt rear wing assembly on rear/side impact
      if (rearWingGroupRef.current) {
        rearWingGroupRef.current.position.set(
          -5.45 + liveDmgRear * 0.42,
          (liveDmgLeft - liveDmgRight) * 0.18,
          2.2 - liveDmgRear * 0.16
        );
        rearWingGroupRef.current.rotation.set(
          (liveDmgRight - liveDmgLeft) * 0.16 + liveDmgRear * 0.11,
          -liveDmgRear * 0.26,
          (liveDmgLeft - liveDmgRight) * 0.14
        );
      }

      // Bend wing mirrors inward on sidepod impacts
      if (leftMirrorGroupRef.current) {
        leftMirrorGroupRef.current.rotation.set(
          liveDmgLeft * 0.42,
          liveDmgLeft * 0.28,
          -liveDmgLeft * 0.52
        );
      }
      if (rightMirrorGroupRef.current) {
        rightMirrorGroupRef.current.rotation.set(
          -liveDmgRight * 0.42,
          liveDmgRight * 0.28,
          liveDmgRight * 0.52
        );
      }

      // Scuff clearcoat finish on dented bodywork panels
      if (monocoqueMatRef.current) {
        const totalDmg = Math.min(1, liveDmgFront + liveDmgRear + (liveDmgLeft + liveDmgRight) * 0.5);
        monocoqueMatRef.current.clearcoatRoughness = 0.025 + totalDmg * 0.45;
        monocoqueMatRef.current.roughness = 0.09 + totalDmg * 0.24;
      }
      if (leftPodMatRef.current) {
        leftPodMatRef.current.clearcoatRoughness = 0.025 + liveDmgLeft * 0.55;
        leftPodMatRef.current.roughness = 0.10 + liveDmgLeft * 0.30;
      }
      if (rightPodMatRef.current) {
        rightPodMatRef.current.clearcoatRoughness = 0.025 + liveDmgRight * 0.55;
        rightPodMatRef.current.roughness = 0.10 + liveDmgRight * 0.30;
      }
    }

    // Trigger violent physical suspension pitch/roll/heave impulse when an impact occurs
    if (liveBounceCooldown >= 8 && prevDmg.lastImpactBounce < 8 && liveImpactSev > 0.06) {
      const shock = Math.min(1.0, liveImpactSev);
      suspRef.current.heaveVel += (0.85 + Math.random() * 0.6) * shock * 3.2;
      suspRef.current.pitchVel += (liveDmgFront >= liveDmgRear ? -1 : 1) * shock * 2.8;
      suspRef.current.rollVel += (liveDmgLeft >= liveDmgRight ? 1 : -1) * shock * 3.4;
    }
    prevDmg.lastImpactBounce = liveBounceCooldown;

    // 1. Spin 18-inch Pirelli tires at exact angular velocity v / R
    const wheelSpinSpeed = liveSpeed * 25 * dt;
    if (rearLeftTireRef.current && rearRightTireRef.current) {
      rearLeftTireRef.current.rotation.y += wheelSpinSpeed * 0.92;
      rearRightTireRef.current.rotation.y += wheelSpinSpeed * 0.92;
    }
    if (frontLeftTireRef.current && frontRightTireRef.current) {
      frontLeftTireRef.current.rotation.y += wheelSpinSpeed;
      frontRightTireRef.current.rotation.y += wheelSpinSpeed;
    }

    // 2. Real Physical Ackermann Front-Wheel Steering + Front Suspension Toe/Camber Knock on heavy frontal crash
    if (frontLeftWheelGroupRef.current && frontRightWheelGroupRef.current) {
      // In 3D Z-up coordinates (3D Y = 500 - 2D y), 2D clockwise +steerAngle maps to -steerAngle around +Z
      const baseSteerZ = THREE.MathUtils.clamp(-liveSteerAngle, -0.52, 0.52);
      const damagedToeLeft = liveDmgFront * 0.16 + liveDmgLeft * 0.12;
      const damagedToeRight = -liveDmgFront * 0.16 - liveDmgRight * 0.12;
      const ackermannLeft = (baseSteerZ < 0 ? baseSteerZ * 1.12 : baseSteerZ * 0.92) + damagedToeLeft;
      const ackermannRight = (baseSteerZ > 0 ? baseSteerZ * 1.12 : baseSteerZ * 0.92) + damagedToeRight;
      frontLeftWheelGroupRef.current.rotation.z = THREE.MathUtils.damp(
        frontLeftWheelGroupRef.current.rotation.z,
        ackermannLeft,
        22,
        dt
      );
      frontRightWheelGroupRef.current.rotation.z = THREE.MathUtils.damp(
        frontRightWheelGroupRef.current.rotation.z,
        ackermannRight,
        22,
        dt
      );
    }

    // Rotate F1 cockpit steering wheel in sync with physical front-wheel steering!
    if (steeringWheelRef.current) {
      const targetWheelRoll = THREE.MathUtils.clamp(-liveSteerAngle * 2.1, -1.1, 1.1);
      steeringWheelRef.current.rotation.x = THREE.MathUtils.damp(
        steeringWheelRef.current.rotation.x,
        targetWheelRoll,
        20,
        dt
      );
    }

    // Driver helmet naturally looks toward the apex & leans against lateral G-forces!
    if (driverHelmetRef.current) {
      const headLookZ = THREE.MathUtils.clamp(-liveSteerAngle * 0.72, -0.34, 0.34);
      const headTiltX = THREE.MathUtils.clamp(liveLatG * 0.045, -0.22, 0.22);
      driverHelmetRef.current.rotation.z = THREE.MathUtils.damp(
        driverHelmetRef.current.rotation.z,
        headLookZ,
        14,
        dt
      );
      driverHelmetRef.current.rotation.x = THREE.MathUtils.damp(
        driverHelmetRef.current.rotation.x,
        headTiltX,
        12,
        dt
      );
    }

    // 3. True Rigid-Body Chassis Yaw + 2nd-Order Spring-Damper Suspension (real F1 double-wishbone heave/pitch/roll!)
    const susp = suspRef.current;
    const kerbRipple =
      liveOnCurb && liveSpeed > 0.8
        ? Math.sin(elapsed * (34 + liveSpeed * 8)) * Math.min(0.11, liveSpeed * 0.022)
        : liveOffTrack && liveSpeed > 0.6
          ? Math.sin(elapsed * 26 + liveSpeed * 4) * 0.075
          : 0;

    // Target equilibrium angles & ride height driven by Newtonian G-forces, aero downforce & sequential shift torque
    const shiftPitchKick = -liveShiftKick * 0.028;
    const targetPitch = THREE.MathUtils.clamp(-liveLongG * 0.017 + shiftPitchKick, -0.056, 0.082);
    const targetRoll = THREE.MathUtils.clamp(liveLatG * 0.024 + kerbRipple * 0.35, -0.14, 0.14);
    const aeroCompression = -THREE.MathUtils.clamp(liveSpeed * liveSpeed * 0.0029, 0, 0.16);
    const porpoise = liveSpeed > 5.3 ? Math.sin(elapsed * 54) * 0.016 : 0;
    const targetHeave = aeroCompression + porpoise + kerbRipple * 0.65;

    // Damped Harmonic Oscillator integration (stiff F1 torsion-bar springs with realistic transient overshoot/rebound)
    const kPitch = 145;
    const cPitch = 17.5;
    susp.pitchVel += ((targetPitch - susp.pitch) * kPitch - susp.pitchVel * cPitch) * dt;
    susp.pitch = THREE.MathUtils.clamp(susp.pitch + susp.pitchVel * dt, -0.09, 0.11);

    const kRoll = 165;
    const cRoll = 18.5;
    susp.rollVel += ((targetRoll - susp.roll) * kRoll - susp.rollVel * cRoll) * dt;
    susp.roll = THREE.MathUtils.clamp(susp.roll + susp.rollVel * dt, -0.19, 0.19);

    const kHeave = 190;
    const cHeave = 20.0;
    susp.heaveVel += ((targetHeave - susp.heave) * kHeave - susp.heaveVel * cHeave) * dt;
    susp.heave = THREE.MathUtils.clamp(susp.heave + susp.heaveVel * dt, -0.24, 0.18);

    if (carGroupRef.current) {
      const targetYaw = -liveAngle;
      let diff = targetYaw - smoothYawRef.current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      smoothYawRef.current += diff * Math.min(1, dt * 26);
      carGroupRef.current.rotation.z = smoothYawRef.current;

      // Track banking tilts the entire car + wheels perpendicular to the banked tarmac normal
      const bankedRoll = THREE.MathUtils.clamp(liveBankAngle * 1.4, -0.22, 0.22);
      carGroupRef.current.rotation.x = THREE.MathUtils.damp(
        carGroupRef.current.rotation.x,
        bankedRoll,
        14,
        dt
      );
    }

    // Apply sprung-mass pitch, roll & heave strictly to the suspended monocoque chassis
    if (chassisBodyRef.current) {
      chassisBodyRef.current.rotation.y = susp.pitch;
      chassisBodyRef.current.rotation.x = susp.roll;
      chassisBodyRef.current.position.z = susp.heave;
    }

    // 4. Independent 4-Wheel Vertical Suspension Travel & Dynamic Front Cornering Negative Camber + Impact Camber Knock
    // Wheels stay firmly planted on tarmac while individually articulating over serrated kerbs & gravel bumps!
    const bumpFreq = 28 + liveSpeed * 7.5;
    const bumpAmp =
      liveOnCurb && liveSpeed > 0.7
        ? Math.min(0.14, 0.05 + liveSpeed * 0.018)
        : liveOffTrack && liveSpeed > 0.5
          ? 0.09
          : liveSpeed > 2.0
            ? 0.014
            : 0;
    const flJounce = bumpAmp * Math.sin(elapsed * bumpFreq);
    const frJounce = bumpAmp * Math.sin(elapsed * bumpFreq + 1.35);
    const rlJounce = bumpAmp * Math.sin(elapsed * bumpFreq - 0.85);
    const rrJounce = bumpAmp * Math.sin(elapsed * bumpFreq + 0.55);

    const dynamicCamber = THREE.MathUtils.clamp(-0.045 - Math.abs(liveLatG) * 0.012, -0.10, -0.04);
    if (frontLeftWheelGroupRef.current) {
      frontLeftWheelGroupRef.current.position.z = 0.78 + flJounce;
      frontLeftWheelGroupRef.current.rotation.x = dynamicCamber - liveDmgLeft * 0.14;
    }
    if (frontRightWheelGroupRef.current) {
      frontRightWheelGroupRef.current.position.z = 0.78 + frJounce;
      frontRightWheelGroupRef.current.rotation.x = -dynamicCamber + liveDmgRight * 0.14;
    }
    if (rearLeftWheelGroupRef.current) {
      rearLeftWheelGroupRef.current.position.z = 0.86 + rlJounce;
    }
    if (rearRightWheelGroupRef.current) {
      rearRightWheelGroupRef.current.position.z = 0.86 + rrJounce;
    }

    // 5. Real Active Aerodynamic DRS Rear Flap synced to physics drsActive state
    if (drsFlapRef.current) {
      const isDrsNow = liveDrs || (liveSpeed > 6.1 && !liveBraking && !liveDrifting);
      const targetDrsPitch = isDrsNow ? -0.46 : 0.16;
      drsFlapRef.current.rotation.y = THREE.MathUtils.damp(
        drsFlapRef.current.rotation.y,
        targetDrsPitch,
        16,
        dt
      );
    }

    // 6. Incandescent Carbon-Ceramic Brake Disc Glow & Rear Brake LEDs driven directly by live deceleration
    const brakingEnergy =
      liveBraking && liveSpeed > 1.6 ? Math.min(1, 0.45 + Math.abs(liveLongG) * 0.25) : 0;
    brakeHeatRef.current = THREE.MathUtils.damp(
      brakeHeatRef.current,
      brakingEnergy,
      liveBraking ? 11.5 : 2.6,
      dt
    );
    const glowIntensity = brakeHeatRef.current * 9.5;
    if (flBrakeMatRef.current) flBrakeMatRef.current.emissiveIntensity = glowIntensity;
    if (frBrakeMatRef.current) frBrakeMatRef.current.emissiveIntensity = glowIntensity;
    if (rlBrakeMatRef.current) rlBrakeMatRef.current.emissiveIntensity = glowIntensity;
    if (rrBrakeMatRef.current) rrBrakeMatRef.current.emissiveIntensity = glowIntensity;

    if (steeringLedMatRef.current) {
      steeringLedMatRef.current.emissive.copy(liveBraking ? _colBrakeRed : _colCyan);
    }
    if (rainLightMatRef.current) {
      const isWetStrobe = weather === 'rain' && Math.sin(elapsed * 25.0) > -0.15;
      const lit = liveBraking || liveDrifting || isWetStrobe;
      rainLightMatRef.current.color.copy(lit ? _colBrakeRed : _colDarkRain);
      rainLightMatRef.current.emissiveIntensity = lit ? (isWetStrobe ? 11.5 : 9.5) : 1.5;
    }
    if (leftBrakeLedMatRef.current) {
      leftBrakeLedMatRef.current.color.copy(liveBraking ? _colBrakeRed : _colDarkBrake);
      leftBrakeLedMatRef.current.emissiveIntensity = liveBraking ? 7.8 : 0.3;
    }
    if (rightBrakeLedMatRef.current) {
      rightBrakeLedMatRef.current.color.copy(liveBraking ? _colBrakeRed : _colDarkBrake);
      rightBrakeLedMatRef.current.emissiveIntensity = liveBraking ? 7.8 : 0.3;
    }

    // 7. Exhaust Overrun Backfire & Sequential Upshift Flame Plume + Dynamic Real-Time Diffuser PointLight
    const isBackfiring =
      liveShiftKick > 0.42 ||
      (liveBraking && liveSpeed > 2.6 && Math.sin(elapsed * 46) > 0.22) ||
      (liveThrottle > 0.8 && liveLongG > 0.9 && liveSpeed > 2.8 && Math.sin(elapsed * 58) > 0.45);

    if (exhaustFlameRef.current) {
      exhaustFlameRef.current.visible = isBackfiring;
      if (isBackfiring) {
        const shiftBoost = liveShiftKick > 0.42 ? 1.32 : 1.0;
        const pulseScale = (0.85 + Math.random() * 0.72) * shiftBoost;
        exhaustFlameRef.current.scale.set(pulseScale, (1.0 + Math.random() * 0.35) * shiftBoost, pulseScale);
      }
    }

    if (tailLightPointRef.current) {
      const isWetStrobe = weather === 'rain' && Math.sin(elapsed * 25.0) > -0.15;
      if (isBackfiring) {
        tailLightPointRef.current.color.set('#38bdf8');
        tailLightPointRef.current.intensity = 16;
      } else if (liveBraking || liveDrifting || isWetStrobe) {
        tailLightPointRef.current.color.set('#ff1e42');
        tailLightPointRef.current.intensity = isWetStrobe ? 4.4 : 3.2;
      } else {
        tailLightPointRef.current.intensity = 0;
      }
    }

    // 8. Aerodynamic Rear Wingtip Condensation Vortices above 265 km/h & Underfloor Titanium Skid-Block Spark Flash
    if (leftVortexRef.current && rightVortexRef.current) {
      const showVortex = liveSpeed > 5.55;
      leftVortexRef.current.visible = showVortex;
      rightVortexRef.current.visible = showVortex;
      if (showVortex) {
        const vAlpha = Math.min(0.38, (liveSpeed - 5.55) * 0.18);
        (leftVortexRef.current.material as THREE.MeshBasicMaterial).opacity = vAlpha;
        (rightVortexRef.current.material as THREE.MeshBasicMaterial).opacity = vAlpha;
      }
    }

    if (skidSparkLightRef.current) {
      const isBottomingOut =
        (liveSpeed > 5.4 && Math.sin(elapsed * 52) > 0.35) ||
        (liveOnCurb && liveSpeed > 2.5 && Math.sin(elapsed * 42) > 0.1);
      skidSparkLightRef.current.intensity = isBottomingOut ? 6.5 + Math.random() * 5.0 : 0;
    }
  });

  // Helper for detailed 18" Open-Wheel Pirelli Slick + Brembo Caliper + Carbon Duct + Cross-Drilled Glowing Ceramic Rotor
  const renderWheelAssembly = (
    tireRef: React.RefObject<THREE.Group | null>,
    brakeMatRef: React.RefObject<THREE.MeshStandardMaterial | null>,
    radius: number,
    width: number,
    isLeft: boolean
  ) => {
    const sideSign = isLeft ? -1 : 1;
    return (
      <group>
        {/* Stationary Carbon-Fiber Aerodynamic Brake Scoop & Wheel Wake Deflector */}
        <mesh position={[0.15, -sideSign * (width * 0.44), 0.28]}>
          <boxGeometry args={[radius * 1.02, 0.2, radius * 1.22]} />
          <meshStandardMaterial
            map={carbonMaps.map}
            normalMap={carbonMaps.normalMap}
            roughness={0.34}
            metalness={0.48}
          />
        </mesh>

        {/* Stationary Brembo 6-Piston Racing Brake Caliper */}
        <mesh position={[-radius * 0.36, -sideSign * (width * 0.32), 0.12]}>
          <boxGeometry args={[0.38, 0.32, 0.65]} />
          <meshPhysicalMaterial
            color="#ef4444"
            roughness={0.16}
            metalness={0.78}
            clearcoat={1.0}
          />
        </mesh>

        {/* Stationary Incandescent Cross-Drilled Carbon-Ceramic Brake Disc */}
        <mesh position={[0, -sideSign * (width * 0.34), 0]}>
          <cylinderGeometry args={[radius * 0.64, radius * 0.64, 0.2, 24]} />
          <meshStandardMaterial
            ref={brakeMatRef}
            map={brakeRotorTex}
            color="#475569"
            emissive="#ff4500"
            emissiveIntensity={0}
            roughness={0.34}
            metalness={0.78}
          />
        </mesh>

        {/* Spinning Tire + Rim Group */}
        <group ref={tireRef}>
          {/* Main Pirelli P-Zero Rubber Slick / Wet Tread with 3D Tread Normal Map */}
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[radius, radius, width * 0.86, 32]} />
            <meshPhysicalMaterial
              color="#0e1118"
              normalMap={tireTreadNormalMap}
              roughness={weather === 'rain' ? 0.24 : 0.48}
              metalness={0.08}
              clearcoat={weather === 'rain' ? 0.92 : 0.52}
              clearcoatRoughness={weather === 'rain' ? 0.08 : 0.28}
            />
          </mesh>
          {/* Rounded Toroidal Tire Shoulders */}
          <mesh
            position={[0, sideSign * (width * 0.43), 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[radius * 0.84, radius * 0.16, 12, 28]} />
            <meshPhysicalMaterial
              color="#121620"
              roughness={0.60}
              metalness={0.08}
              clearcoat={0.32}
            />
          </mesh>
          <mesh
            position={[0, -sideSign * (width * 0.43), 0]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <torusGeometry args={[radius * 0.84, radius * 0.16, 12, 28]} />
            <meshPhysicalMaterial
              color="#121620"
              roughness={0.60}
              metalness={0.08}
              clearcoat={0.32}
            />
          </mesh>

          {/* Pirelli P-Zero Sidewall Compound Graphics Disc */}
          <mesh position={[0, sideSign * (width * 0.51), 0]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[radius * 0.96, 28]} />
            <meshStandardMaterial
              map={tireSidewallTex}
              transparent
              roughness={0.55}
              metalness={0.12}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Deep-Dish Anisotropic Brushed Metallic 18" BBS/OZ Aero Wheel Rim Face */}
          <mesh position={[0, sideSign * (width * 0.49), 0]}>
            <cylinderGeometry args={[radius * 0.62, radius * 0.56, 0.12, 20]} />
            <meshPhysicalMaterial
              color="#222a38"
              roughness={0.16}
              metalness={0.96}
              anisotropy={0.85}
              clearcoat={0.65}
            />
          </mesh>
          {/* Center-Lock Anodized Gold Wheel Nut */}
          <mesh position={[0, sideSign * (width * 0.54), 0]}>
            <cylinderGeometry args={[radius * 0.17, radius * 0.19, 0.14, 6]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.16} metalness={0.96} />
          </mesh>
          {/* Multi-Spoke Forged Alloy Star Pattern */}
          {[0, Math.PI / 3, (Math.PI * 2) / 3].map((ang, sIdx) => (
            <mesh
              key={`spoke-${sIdx}`}
              position={[0, sideSign * (width * 0.525), 0]}
              rotation={[0, ang, 0]}
            >
              <boxGeometry args={[radius * 1.14, 0.04, 0.12]} />
              <meshStandardMaterial color="#cbd5e1" roughness={0.16} metalness={0.96} />
            </mesh>
          ))}
        </group>
      </group>
    );
  };

  return (
    <group ref={rootGroupRef}>
      {/* Soft Grounded Contact Shadow directly beneath Venturi Floor */}
      <mesh ref={contactShadowRef} position={[0, 0, -0.04]}>
        <planeGeometry args={[18.8, 10.4]} />
        <meshBasicMaterial map={shadowTex} transparent opacity={0.94} depthWrite={false} />
      </mesh>

      {/* Subtle Active Car Focus Ring (only in drawing/selection) */}
      {!isRacing && active && speed < 0.1 && (
        <mesh position={[0, 0, -0.02]}>
          <ringGeometry args={[7.8, 8.7, 36]} />
          <meshBasicMaterial color={color} transparent opacity={0.48} depthWrite={false} />
        </mesh>
      )}

      <group ref={carGroupRef}>
        {/* Suspended Chassis Group */}
        <group ref={chassisBodyRef}>
          {/* Compact Dynamic PointLight at Rear Diffuser + Underbody Titanium Skid-Block Spark Light */}
          {active && (
            <>
              <pointLight
                ref={tailLightPointRef}
                position={[-6.4, 0, 1.0]}
                color="#ff1e42"
                intensity={0}
                distance={12}
                decay={2}
              />
              <pointLight
                ref={skidSparkLightRef}
                position={[-1.5, 0, 0.25]}
                color="#fbbf24"
                intensity={0}
                distance={10}
                decay={2}
              />
            </>
          )}

          {/* Carbon-Fiber Venturi Underfloor Plank & Sculpted Rear Diffuser Tunnels */}
          <mesh castShadow receiveShadow position={[-0.35, 0, 0.34]}>
            <boxGeometry args={[12.0, 5.25, 0.18]} />
            <meshStandardMaterial
              map={carbonMaps.map}
              normalMap={carbonMaps.normalMap}
              normalScale={_normalScaleCarbon}
              roughness={0.34}
              metalness={0.52}
            />
          </mesh>
          {/* Rear Venturi Diffuser Strakes */}
          {[-1.6, -0.8, 0.8, 1.6].map((yPos, dIdx) => (
            <mesh key={`diff-strake-${dIdx}`} position={[-5.45, yPos, 0.56]}>
              <boxGeometry args={[1.65, 0.1, 0.46]} />
              <meshStandardMaterial map={carbonMaps.map} roughness={0.36} metalness={0.54} />
            </mesh>
          ))}
          {/* Floor Edge Aero Fences */}
          <mesh position={[-0.4, -2.56, 0.48]}>
            <boxGeometry args={[8.1, 0.12, 0.28]} />
            <meshPhysicalMaterial
              color={color}
              normalMap={flakeNormalMap}
              normalScale={_normalScaleFlake}
              roughness={0.10}
              metalness={0.80}
              clearcoat={1.0}
              clearcoatRoughness={0.03}
              envMapIntensity={2.4}
            />
          </mesh>
          <mesh position={[-0.4, 2.56, 0.48]}>
            <boxGeometry args={[8.1, 0.12, 0.28]} />
            <meshPhysicalMaterial
              color={color}
              normalMap={flakeNormalMap}
              normalScale={_normalScaleFlake}
              roughness={0.10}
              metalness={0.80}
              clearcoat={1.0}
              clearcoatRoughness={0.03}
              envMapIntensity={2.4}
            />
          </mesh>

          {/* Sculpted CAD Beveled F1 Monocoque, Nosecone & Engine Roll-Hoop with Custom Championship Livery Texture */}
          <mesh geometry={monocoqueGeo} castShadow receiveShadow>
            <meshPhysicalMaterial
              ref={monocoqueMatRef}
              map={liveryTex}
              normalMap={flakeNormalMap}
              normalScale={_normalScaleFlake}
              roughness={0.08}
              metalness={0.82}
              clearcoat={1.0}
              clearcoatRoughness={0.02}
              iridescence={0.18}
              sheen={0.38}
              sheenColor="#ffffff"
              envMapIntensity={2.6}
            />
          </mesh>

          {/* Nosecone Aerodynamic Pitot Pressure Sensor Mast & FOM Onboard Nose Camera Pods */}
          <mesh position={[5.15, 0, 1.24]} rotation={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.025, 0.035, 0.65, 8]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.18} metalness={0.95} />
          </mesh>
          {[-0.68, 0.68].map((yCam, cIdx) => (
            <mesh key={`nose-cam-${cIdx}`} position={[5.45, yCam, 0.72]}>
              <boxGeometry args={[0.42, 0.28, 0.12]} />
              <meshStandardMaterial map={carbonMaps.map} roughness={0.3} metalness={0.6} />
            </mesh>
          ))}

          {/* Sculpted Undercut Aerodynamic Sidepods (Independent Left & Right Deformable Meshes) */}
          <mesh
            ref={leftSidepodMeshRef}
            geometry={leftSidepodGeo}
            position={[0.1, -1.36, 0]}
            rotation={[0.06, 0, -0.05]}
            castShadow
            receiveShadow
          >
            <meshPhysicalMaterial
              ref={leftPodMatRef}
              map={liveryTex}
              normalMap={flakeNormalMap}
              normalScale={_normalScaleFlake}
              roughness={0.09}
              metalness={0.80}
              clearcoat={1.0}
              clearcoatRoughness={0.02}
              iridescence={0.14}
              envMapIntensity={2.5}
            />
          </mesh>
          <mesh
            ref={rightSidepodMeshRef}
            geometry={rightSidepodGeo}
            position={[0.1, 1.36, 0]}
            rotation={[-0.06, 0, 0.05]}
            castShadow
            receiveShadow
          >
            <meshPhysicalMaterial
              ref={rightPodMatRef}
              map={liveryTex}
              normalMap={flakeNormalMap}
              normalScale={_normalScaleFlake}
              roughness={0.09}
              metalness={0.80}
              clearcoat={1.0}
              clearcoatRoughness={0.02}
              iridescence={0.14}
              envMapIntensity={2.5}
            />
          </mesh>

          {/* Engine Cover Cooling Louver Vents (Carbon Detail) */}
          {[-1.25, 1.25].map((ySide, idx) => (
            <mesh key={`louver-${idx}`} position={[-1.4, ySide, 1.32]} rotation={[0, 0.12, 0]}>
              <boxGeometry args={[2.1, 0.42, 0.06]} />
              <meshStandardMaterial map={carbonMaps.map} roughness={0.45} metalness={0.4} />
            </mesh>
          ))}

          {/* Championship White & Carbon Livery Pin-Striping along Nosecone */}
          <mesh position={[3.95, 0, 1.25]} rotation={[0, 0.14, 0]}>
            <boxGeometry args={[5.3, 0.24, 0.04]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.14} metalness={0.45} />
          </mesh>

          {/* Wing Mirrors on Carbon Stalks (Tilt & bend on sidepod impacts) */}
          {[-1.55, 1.55].map((yMir, idx) => (
            <group
              key={`mirror-${idx}`}
              ref={idx === 0 ? leftMirrorGroupRef : rightMirrorGroupRef}
              position={[1.75, yMir, 1.62]}
            >
              <mesh>
                <boxGeometry args={[0.38, 0.62, 0.24]} />
                <meshPhysicalMaterial
                  color={color}
                  roughness={0.1}
                  metalness={0.75}
                  clearcoat={1.0}
                />
              </mesh>
              <mesh position={[-0.2, 0, 0]}>
                <boxGeometry args={[0.04, 0.52, 0.18]} />
                <meshStandardMaterial color="#e2e8f0" roughness={0.04} metalness={1.0} />
              </mesh>
            </group>
          ))}

          {/* Deep Carbon Radiator Sidepod Intakes + Sculpted Venturi Floor Bargeboard Vortex Strakes */}
          <mesh position={[2.34, -1.66, 0.96]}>
            <boxGeometry args={[0.22, 1.18, 0.62]} />
            <meshStandardMaterial color="#03050a" roughness={0.92} />
          </mesh>
          <mesh position={[2.34, 1.66, 0.96]}>
            <boxGeometry args={[0.22, 1.18, 0.62]} />
            <meshStandardMaterial color="#03050a" roughness={0.92} />
          </mesh>
          {[-2.35, 2.35].map((yBarge, bIdx) => (
            <group key={`bargeboard-${bIdx}`} position={[2.45, yBarge, 0.66]}>
              <mesh rotation={[0, 0, yBarge < 0 ? 0.24 : -0.24]} castShadow>
                <boxGeometry args={[1.65, 0.08, 0.62]} />
                <meshStandardMaterial
                  map={carbonMaps.map}
                  normalMap={carbonMaps.normalMap}
                  roughness={0.30}
                  metalness={0.56}
                />
              </mesh>
              <mesh position={[0.45, yBarge < 0 ? -0.18 : 0.18, -0.14]} rotation={[0, 0, yBarge < 0 ? 0.18 : -0.18]}>
                <boxGeometry args={[1.15, 0.06, 0.34]} />
                <meshStandardMaterial map={carbonMaps.map} roughness={0.32} metalness={0.54} />
              </mesh>
            </group>
          ))}

          {/* Swept Delta Multi-Element Carbon Front Wing + Contoured Winglet Endplates */}
          <group ref={frontWingGroupRef} position={[6.9, 0, 0.34]}>
            <mesh geometry={frontWingGeo} castShadow receiveShadow>
              <meshStandardMaterial
                map={carbonMaps.map}
                normalMap={carbonMaps.normalMap}
                roughness={0.30}
                metalness={0.54}
              />
            </mesh>
            <mesh castShadow position={[-0.32, 0, 0.19]} rotation={[0, -0.18, 0]}>
              <boxGeometry args={[0.68, 6.22, 0.09]} />
              <meshPhysicalMaterial
                color={color}
                roughness={0.1}
                metalness={0.78}
                clearcoat={1.0}
                envMapIntensity={2.3}
              />
            </mesh>
            <mesh castShadow position={[-0.25, -3.32, 0.3]}>
              <boxGeometry args={[1.68, 0.14, 0.76]} />
              <meshPhysicalMaterial color={color} roughness={0.12} metalness={0.72} clearcoat={1.0} />
            </mesh>
            <mesh castShadow position={[-0.25, 3.32, 0.3]}>
              <boxGeometry args={[1.68, 0.14, 0.76]} />
              <meshPhysicalMaterial color={color} roughness={0.12} metalness={0.72} clearcoat={1.0} />
            </mesh>
          </group>

          {/* Carbon Dorsal Shark Fin & Glowing FIA Broadcast T-Cam Pod */}
          <mesh castShadow position={[-3.45, 0, 2.0]}>
            <boxGeometry args={[2.8, 0.11, 0.98]} />
            <meshStandardMaterial
              map={carbonMaps.map}
              normalMap={carbonMaps.normalMap}
              roughness={0.30}
              metalness={0.54}
            />
          </mesh>
          <group position={[-1.4, 0, 2.54]}>
            <mesh castShadow>
              <boxGeometry args={[0.45, 0.18, 0.42]} />
              <meshStandardMaterial color="#0f172a" roughness={0.38} />
            </mesh>
            <mesh position={[0, 0, 0.2]}>
              <boxGeometry args={[0.42, 1.48, 0.16]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={1.15}
                roughness={0.20}
              />
            </mesh>
          </group>

          {/* Open Cockpit Recess, Rotating F1 Steering Wheel, Animated Driver Helmet & Curved Titanium Halo */}
          <mesh position={[0.45, 0, 1.56]}>
            <boxGeometry args={[2.25, 1.22, 0.18]} />
            <meshStandardMaterial color="#04070d" roughness={0.92} />
          </mesh>
          {/* Cockpit F1 Steering Wheel (physically rotates with steerAngle!) */}
          <group ref={steeringWheelRef} position={[1.18, 0, 1.74]} rotation={[0, -0.35, 0]}>
            <mesh>
              <boxGeometry args={[0.12, 0.64, 0.38]} />
              <meshStandardMaterial color="#0f172a" roughness={0.42} />
            </mesh>
            <mesh position={[-0.07, 0, 0.08]}>
              <boxGeometry args={[0.02, 0.44, 0.13]} />
              <meshStandardMaterial
                ref={steeringLedMatRef}
                color="#22d3ee"
                emissive={isBraking ? '#ff1e42' : '#22d3ee'}
                emissiveIntensity={5.8}
              />
            </mesh>
          </group>
          {/* Driver Racing Helmet (livery-matched crown for instant car recognition + turns toward apex!) */}
          <group ref={driverHelmetRef} position={[0.25, 0, 1.88]}>
            <mesh castShadow>
              <sphereGeometry args={[0.56, 22, 18]} />
              <meshPhysicalMaterial
                color={color}
                roughness={0.08}
                metalness={0.55}
                clearcoat={1.0}
                envMapIntensity={2.4}
              />
            </mesh>
            <mesh position={[0.36, 0, 0.08]}>
              <boxGeometry args={[0.32, 0.72, 0.24]} />
              <meshPhysicalMaterial
                color="#38bdf8"
                roughness={0.02}
                metalness={1.0}
                clearcoat={1.0}
                iridescence={0.65}
                envMapIntensity={3.0}
              />
            </mesh>
          </group>
          {/* Real Curved 3D Titanium Halo + Central Front Safety Pylon */}
          <mesh geometry={haloCurveGeo} castShadow>
            <meshStandardMaterial color="#1e293b" roughness={0.18} metalness={0.92} />
          </mesh>
          <mesh position={[1.82, 0, 1.72]} rotation={[0, -0.35, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.11, 0.65, 8]} />
            <meshStandardMaterial color="#1e293b" roughness={0.18} metalness={0.92} />
          </mesh>

          {/* Carbon Double-Wishbone Suspension Arms */}
          <mesh position={[4.15, 0, 0.88]}>
            <boxGeometry args={[0.28, 6.2, 0.1]} />
            <meshStandardMaterial map={carbonMaps.map} roughness={0.38} metalness={0.52} />
          </mesh>
          <mesh position={[3.95, 0, 0.56]}>
            <boxGeometry args={[0.24, 6.1, 0.09]} />
            <meshStandardMaterial map={carbonMaps.map} roughness={0.38} metalness={0.52} />
          </mesh>
          <mesh position={[-3.95, 0, 0.9]}>
            <boxGeometry args={[0.34, 6.3, 0.12]} />
            <meshStandardMaterial map={carbonMaps.map} roughness={0.38} metalness={0.52} />
          </mesh>
          <mesh position={[-3.75, 0, 0.58]}>
            <boxGeometry args={[0.28, 6.2, 0.1]} />
            <meshStandardMaterial map={carbonMaps.map} roughness={0.38} metalness={0.52} />
          </mesh>

          {/* High-Downforce Carbon Rear Wing Assembly with Twin Swan-Neck DRS Pillars, Active Flap & Wingtip Vapor Vortices */}
          <group ref={rearWingGroupRef} position={[-5.45, 0, 2.2]}>
            {/* Twin Swan-Neck Carbon Rear Wing Support Pillars + Hydraulic DRS Actuator Pod */}
            <mesh position={[0.42, -0.34, -0.62]} castShadow>
              <boxGeometry args={[0.92, 0.11, 1.48]} />
              <meshStandardMaterial map={carbonMaps.map} roughness={0.32} metalness={0.54} />
            </mesh>
            <mesh position={[0.42, 0.34, -0.62]} castShadow>
              <boxGeometry args={[0.92, 0.11, 1.48]} />
              <meshStandardMaterial map={carbonMaps.map} roughness={0.32} metalness={0.54} />
            </mesh>
            <mesh position={[0.02, 0, 0.36]} castShadow>
              <boxGeometry args={[1.08, 0.24, 0.42]} />
              <meshStandardMaterial map={carbonMaps.map} roughness={0.28} metalness={0.60} />
            </mesh>
            <mesh position={[0, -2.2, -0.35]} castShadow>
              <boxGeometry args={[1.7, 0.16, 1.74]} />
              <meshStandardMaterial
                map={carbonMaps.map}
                normalMap={carbonMaps.normalMap}
                roughness={0.30}
                metalness={0.54}
              />
            </mesh>
            <mesh position={[0, 2.2, -0.35]} castShadow>
              <boxGeometry args={[1.7, 0.16, 1.74]} />
              <meshStandardMaterial
                map={carbonMaps.map}
                normalMap={carbonMaps.normalMap}
                roughness={0.30}
                metalness={0.54}
              />
            </mesh>
            <mesh position={[0.12, 0, 0.08]} castShadow>
              <boxGeometry args={[1.2, 4.42, 0.15]} />
              <meshStandardMaterial map={carbonMaps.map} roughness={0.34} />
            </mesh>
            <mesh ref={drsFlapRef} position={[-0.28, 0, 0.44]} castShadow>
              <boxGeometry args={[0.8, 4.36, 0.14]} />
              <meshPhysicalMaterial
                color={color}
                roughness={0.09}
                metalness={0.78}
                clearcoat={1.0}
                envMapIntensity={2.35}
              />
            </mesh>

            {/* Left & Right High-Speed Wingtip Condensation Vapor Trails */}
            <mesh
              ref={leftVortexRef}
              position={[-6.5, -2.2, 0.45]}
              rotation={[0, 0, Math.PI / 2]}
              visible={false}
            >
              <cylinderGeometry args={[0.04, 0.24, 12.2, 8]} />
              <meshBasicMaterial color="#e2e8f0" transparent opacity={0.25} depthWrite={false} />
            </mesh>
            <mesh
              ref={rightVortexRef}
              position={[-6.5, 2.2, 0.45]}
              rotation={[0, 0, Math.PI / 2]}
              visible={false}
            >
              <cylinderGeometry args={[0.04, 0.24, 12.2, 8]} />
              <meshBasicMaterial color="#e2e8f0" transparent opacity={0.25} depthWrite={false} />
            </mesh>
          </group>

          {/* Central Titanium Exhaust Tailpipe + Brushed Heat-Shield Collar, Overrun Backfire Flame & FIA Rear Rain Light */}
          <group position={[-5.92, 0, 0.88]}>
            <mesh position={[0.15, 0, 0.34]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.26, 0.28, 0.55, 12]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.18} metalness={0.98} />
            </mesh>
            <mesh position={[0.38, 0, 0.34]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.36, 0.38, 0.26, 12]} />
              <meshPhysicalMaterial color="#d97706" roughness={0.24} metalness={0.95} iridescence={0.45} />
            </mesh>
            {/* Multi-Layer Blue-White Overrun Exhaust Flame */}
            <group ref={exhaustFlameRef} position={[-0.95, 0, 0.34]} visible={false}>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <coneGeometry args={[0.38, 2.3, 12]} />
                <meshBasicMaterial
                  color="#38bdf8"
                  transparent
                  opacity={0.85}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
              <mesh position={[0.35, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <coneGeometry args={[0.18, 1.35, 10]} />
                <meshBasicMaterial
                  color="#ffffff"
                  transparent
                  opacity={0.95}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            </group>
            {/* FIA Center Rain/Harvesting LED */}
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.22, 0.52, 0.56]} />
              <meshStandardMaterial
                ref={rainLightMatRef}
                color={isBraking || isDrifting ? '#ff1e42' : '#7f1d1d'}
                emissive="#ff1e42"
                emissiveIntensity={isBraking || isDrifting ? 9.5 : 1.5}
              />
            </mesh>
            {/* Rear Wing Endplate Vertical LED Strips */}
            <mesh position={[0.35, -2.2, 0.92]}>
              <boxGeometry args={[0.16, 0.14, 0.82]} />
              <meshStandardMaterial
                ref={leftBrakeLedMatRef}
                color={isBraking ? '#ff1e42' : '#450a0a'}
                emissive="#ff1e42"
                emissiveIntensity={isBraking ? 7.8 : 0.3}
              />
            </mesh>
            <mesh position={[0.35, 2.2, 0.92]}>
              <boxGeometry args={[0.16, 0.14, 0.82]} />
              <meshStandardMaterial
                ref={rightBrakeLedMatRef}
                color={isBraking ? '#ff1e42' : '#450a0a'}
                emissive="#ff1e42"
                emissiveIntensity={isBraking ? 7.8 : 0.3}
              />
            </mesh>
          </group>
        </group>

        {/* 4 Detailed 18" Open-Wheel Pirelli F1 Slicks with Independent Suspension Travel, Ackermann Steering, Brembo Calipers & Glowing Discs */}
        <group ref={frontLeftWheelGroupRef} position={[4.15, -3.18, 0.78]}>
          {renderWheelAssembly(frontLeftTireRef, flBrakeMatRef, 1.32, 1.35, true)}
        </group>
        <group ref={frontRightWheelGroupRef} position={[4.15, 3.18, 0.78]}>
          {renderWheelAssembly(frontRightTireRef, frBrakeMatRef, 1.32, 1.35, false)}
        </group>
        <group ref={rearLeftWheelGroupRef} position={[-3.95, -3.25, 0.86]}>
          {renderWheelAssembly(rearLeftTireRef, rlBrakeMatRef, 1.46, 1.68, true)}
        </group>
        <group ref={rearRightWheelGroupRef} position={[-3.95, 3.25, 0.86]}>
          {renderWheelAssembly(rearRightTireRef, rrBrakeMatRef, 1.46, 1.68, false)}
        </group>
      </group>

      {/* Compact Optional Driver Badge */}
      {showLabel && (
        <Html distanceFactor={140} position={[0, 0, 5.0]} center style={{ pointerEvents: 'none' }}>
          <div
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide font-mono whitespace-nowrap border pointer-events-none select-none ${
              active
                ? 'bg-slate-950/90 text-white border-amber-400/60'
                : 'bg-slate-950/75 text-slate-300 border-slate-800'
            }`}
          >
            {name}
          </div>
        </Html>
      )}
    </group>
  );
};
