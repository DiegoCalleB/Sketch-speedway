import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Track } from '../../types';
import { getTrackBankingProfile } from '../../utils/tracks';

interface TrackMeshProps {
  track: Track;
}

// Procedural tileable asphalt grain texture generator with high-contrast tarmac tone
const createAsphaltTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = '#334155'; // Clean motorsport slate tarmac base
  ctx.fillRect(0, 0, 256, 256);

  // Fine aggregate grain
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const size = Math.random() * 1.5;
    const isLight = Math.random() > 0.5;
    ctx.fillStyle = isLight ? 'rgba(148, 163, 184, 0.14)' : 'rgba(15, 23, 42, 0.18)';
    ctx.fillRect(x, y, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 2);
  return texture;
};

// Procedural checkered flag texture for the start/finish line
const createCheckerTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const cols = 2;
  const rows = 12;
  const cw = canvas.width / cols;
  const ch = canvas.height / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#0f172a';
      ctx.fillRect(c * cw, r * ch, cw, ch);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export const TrackMesh: React.FC<TrackMeshProps> = ({ track }) => {
  const {
    bankedTrackGeometry,
    gravelTrapGeometry,
    outerCurbs,
    innerCurbs,
    asphaltTexture,
    checkerTexture,
    startLineTransform,
    centerLineSegments
  } = useMemo(() => {
    const outer = track.outerBoundary;
    const inner = track.innerBoundary;
    const len = Math.min(outer.length, inner.length);
    const banking = getTrackBankingProfile(track);

    // 1. Build 3D Banked Asphalt Ribbon + Outer Banking Skirt Geometry
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= len; i++) {
      const idx = i % len;
      const oPt = outer[idx];
      const iPt = inner[idx];
      const b = banking[idx];

      // Top ribbon vertices: 0 = outer top, 1 = inner top, 2 = outer bottom skirt (z = 0)
      positions.push(oPt.x, 500 - oPt.y, b.outerZ);
      positions.push(iPt.x, 500 - iPt.y, b.innerZ);
      positions.push(oPt.x, 500 - oPt.y, 0.0);

      const u = (i / len) * 14;
      uvs.push(u, 1);
      uvs.push(u, 0);
      uvs.push(u, 0.5);
    }

    for (let i = 0; i < len; i++) {
      const base = i * 3;
      const next = (i + 1) * 3;

      // Top asphalt quad (two triangles)
      indices.push(base, base + 1, next);
      indices.push(base + 1, next + 1, next);

      // Outer banked embankment wall (outer top down to ground z = 0)
      indices.push(base, next, base + 2);
      indices.push(next, next + 2, base + 2);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    // 2. Build 3D Gravel Runoff Traps (Escapatorias de Grava/Arena) on outside of corners
    const gravelPos: number[] = [];
    const gravelIndices: number[] = [];
    let gVertCount = 0;

    for (let i = 0; i < len; i++) {
      const nIdx = (i + 1) % len;
      const b1 = banking[i];
      const b2 = banking[nIdx];
      if (b1.curvature < 0.0038 && b2.curvature < 0.0038) continue;

      const o1 = outer[i];
      const i1 = inner[i];
      const o2 = outer[nIdx];
      const i2 = inner[nIdx];

      const dir1X = o1.x - i1.x;
      const dir1Y = o1.y - i1.y;
      const len1 = Math.hypot(dir1X, dir1Y) || 1;
      const stripW1 = Math.min(22, 8 + b1.curvature * 950);

      const dir2X = o2.x - i2.x;
      const dir2Y = o2.y - i2.y;
      const len2 = Math.hypot(dir2X, dir2Y) || 1;
      const stripW2 = Math.min(22, 8 + b2.curvature * 950);

      const g1x = o1.x + (dir1X / len1) * stripW1;
      const g1y = o1.y + (dir1Y / len1) * stripW1;
      const g2x = o2.x + (dir2X / len2) * stripW2;
      const g2y = o2.y + (dir2Y / len2) * stripW2;

      gravelPos.push(o1.x, 500 - o1.y, 0.14);
      gravelPos.push(g1x, 500 - g1y, 0.12);
      gravelPos.push(o2.x, 500 - o2.y, 0.14);
      gravelPos.push(g2x, 500 - g2y, 0.12);

      gravelIndices.push(gVertCount, gVertCount + 1, gVertCount + 2);
      gravelIndices.push(gVertCount + 1, gVertCount + 3, gVertCount + 2);
      gVertCount += 4;
    }

    const gravelGeo = new THREE.BufferGeometry();
    if (gravelPos.length > 0) {
      gravelGeo.setAttribute('position', new THREE.Float32BufferAttribute(gravelPos, 3));
      gravelGeo.setIndex(gravelIndices);
      gravelGeo.computeVertexNormals();
    }

    const texture = createAsphaltTexture();
    const checker = createCheckerTexture();

    // 3. Helper to generate 3D Curbs following exact banked elevation
    const generateCurbs = (boundary: typeof outer, isOuter: boolean, prefix: string) => {
      const curbsList: React.ReactNode[] = [];
      for (let i = 0; i < len; i++) {
        const nIdx = (i + 1) % len;
        const p1 = boundary[i];
        const p2 = boundary[nIdx];
        const z1 = isOuter ? banking[i].outerZ : banking[i].innerZ;
        const z2 = isOuter ? banking[nIdx].outerZ : banking[nIdx].innerZ;

        const v1 = new THREE.Vector3(p1.x, 500 - p1.y, z1 + 0.06);
        const v2 = new THREE.Vector3(p2.x, 500 - p2.y, z2 + 0.06);
        const distance = v1.distanceTo(v2);
        if (distance < 0.5) continue;

        const position = v1.clone().add(v2).multiplyScalar(0.5);
        const direction = v2.clone().sub(v1).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);

        const isCorner = banking[i].curvature > 0.0045;
        const color =
          i % 2 === 0
            ? isCorner && isOuter
              ? '#f59e0b' // High-visibility FIA amber/red rumble strips on banked outer turns
              : '#ef4444'
            : '#f8fafc';

        curbsList.push(
          <mesh
            key={`${prefix}-curb-${i}`}
            position={position}
            quaternion={quaternion}
            receiveShadow
          >
            <boxGeometry args={[isOuter && isCorner ? 2.8 : 2.2, distance + 0.35, 0.3]} />
            <meshStandardMaterial color={color} roughness={0.6} metalness={0.08} />
          </mesh>
        );
      }
      return curbsList;
    };

    // 4. Subtle dashed center reference line following banked elevation
    const centerSegs: React.ReactNode[] = [];
    for (let i = 0; i < len; i += 2) {
      const nIdx = (i + 1) % len;
      const zMid1 = (banking[i].outerZ + banking[i].innerZ) * 0.5 + 0.06;
      const zMid2 = (banking[nIdx].outerZ + banking[nIdx].innerZ) * 0.5 + 0.06;
      const c1 = new THREE.Vector3(
        (outer[i].x + inner[i].x) * 0.5,
        500 - (outer[i].y + inner[i].y) * 0.5,
        zMid1
      );
      const c2 = new THREE.Vector3(
        (outer[nIdx].x + inner[nIdx].x) * 0.5,
        500 - (outer[nIdx].y + inner[nIdx].y) * 0.5,
        zMid2
      );
      const dist = c1.distanceTo(c2);
      if (dist < 0.5) continue;
      const pos = c1.clone().add(c2).multiplyScalar(0.5);
      const dir = c2.clone().sub(c1).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

      centerSegs.push(
        <mesh key={`center-dash-${i}`} position={pos} quaternion={quat}>
          <planeGeometry args={[0.9, dist * 0.55]} />
          <meshBasicMaterial color="#94a3b8" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      );
    }

    // 5. Calculate Start/Finish line transform on asphalt
    const p1 = track.startLine.p1;
    const p2 = track.startLine.p2;
    const v1 = new THREE.Vector3(p1.x, 500 - p1.y, 0.65);
    const v2 = new THREE.Vector3(p2.x, 500 - p2.y, 0.65);
    const mid = v1.clone().add(v2).multiplyScalar(0.5);
    const fullDist = Math.max(20, v1.distanceTo(v2) - 26);
    const dir = v2.clone().sub(v1).normalize();
    const startQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    return {
      bankedTrackGeometry: geometry,
      gravelTrapGeometry: gravelGeo,
      asphaltTexture: texture,
      checkerTexture: checker,
      outerCurbs: generateCurbs(outer, true, 'outer'),
      innerCurbs: generateCurbs(inner, false, 'inner'),
      startLineTransform: { position: mid, quaternion: startQuat, length: fullDist },
      centerLineSegments: centerSegs
    };
  }, [track]);

  return (
    <group>
      {/* F1 Gravel Runoff Traps on the Outside of Corners */}
      <mesh geometry={gravelTrapGeometry} receiveShadow>
        <meshStandardMaterial color="#b45309" roughness={0.95} metalness={0.02} side={THREE.DoubleSide} />
      </mesh>

      {/* 3D Banked Track Asphalt Ribbon */}
      <mesh geometry={bankedTrackGeometry} receiveShadow castShadow>
        <meshStandardMaterial
          map={asphaltTexture}
          roughness={0.76}
          metalness={0.12}
          color="#e2e8f0"
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Subtle centerline dashes */}
      {centerLineSegments}

      {/* 3D Banked Track Edge Curbs */}
      {outerCurbs}
      {innerCurbs}

      {/* Checkered F1 Start / Finish Line */}
      <mesh
        position={startLineTransform.position}
        quaternion={startLineTransform.quaternion}
        receiveShadow
      >
        <planeGeometry args={[5.5, startLineTransform.length]} />
        <meshStandardMaterial
          map={checkerTexture}
          roughness={0.6}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
    </group>
  );
};

