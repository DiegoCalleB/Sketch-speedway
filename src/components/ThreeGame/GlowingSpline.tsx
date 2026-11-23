import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Point, Track } from '../../types';
import { getTrackSurfaceInfo } from '../../utils/tracks';

interface GlowingSplineProps {
  path: Point[];
  track?: Track;
  colorOverride?: string;
  isCompleted?: boolean;
}

export const GlowingSpline: React.FC<GlowingSplineProps> = ({
  path,
  track,
  colorOverride = '#38bdf8',
  isCompleted = false
}) => {
  const ribbonGeo = useMemo(() => {
    if (path.length < 2) return null;

    const positions: number[] = [];
    const indices: number[] = [];
    const halfWidth = isCompleted ? 0.55 : 0.85;

    for (let i = 0; i < path.length; i++) {
      const curr = path[i];
      const prev = path[Math.max(0, i - 1)];
      const next = path[Math.min(path.length - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const z = track ? getTrackSurfaceInfo(curr, track).elevationZ + 0.14 : 0.65;

      positions.push(curr.x + nx * halfWidth, 500 - (curr.y + ny * halfWidth), z);
      positions.push(curr.x - nx * halfWidth, 500 - (curr.y - ny * halfWidth), z);

      if (i < path.length - 1) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    return geo;
  }, [path, track, isCompleted]);

  if (!ribbonGeo) return null;

  return (
    <mesh geometry={ribbonGeo}>
      <meshBasicMaterial
        color={colorOverride}
        transparent
        opacity={isCompleted ? 0.24 : 0.45}
        side={THREE.DoubleSide}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
};
