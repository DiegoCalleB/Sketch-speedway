import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface SkidmarkPoint {
  x: number;
  y: number;
  z?: number;
  angle?: number;
  color: string;
  alpha: number;
}

interface Skidmarks3DProps {
  skidmarks?: SkidmarkPoint[];
  skidmarksRef?: React.MutableRefObject<SkidmarkPoint[]>;
}

const _dummy = new THREE.Object3D();
const MAX_MARKS = 1100;

export const Skidmarks3D: React.FC<Skidmarks3DProps> = ({ skidmarks, skidmarksRef }) => {
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const lastLenRef = useRef<number>(-1);
  const lastTailXRef = useRef<number>(NaN);
  const lastTailYRef = useRef<number>(NaN);

  useFrame(() => {
    const mesh = instancedMeshRef.current;
    if (!mesh) return;

    const list = skidmarksRef ? skidmarksRef.current : skidmarks || [];
    const len = list.length;
    const tail = len > 0 ? list[len - 1] : null;
    const tailX = tail ? tail.x : NaN;
    const tailY = tail ? tail.y : NaN;

    if (
      len === lastLenRef.current &&
      (len === 0 || (tailX === lastTailXRef.current && tailY === lastTailYRef.current))
    ) {
      return;
    }

    lastLenRef.current = len;
    lastTailXRef.current = tailX;
    lastTailYRef.current = tailY;

    let instanceIdx = 0;

    for (let i = 0; i < len && instanceIdx + 1 < MAX_MARKS; i++) {
      const sm = list[i];
      const heading = sm.angle !== undefined ? -sm.angle : 0;
      const elevation = (sm.z ?? 0.55) + 0.08;

      // Dual-wheel F1 rear rubber streaks (left & right tires offset perpendicular to heading)
      const perpX = -Math.sin(heading) * 2.85;
      const perpY = Math.cos(heading) * 2.85;

      // Left rear tire streak
      _dummy.position.set(sm.x + perpX, 500 - sm.y + perpY, elevation);
      _dummy.rotation.set(0, 0, heading);
      _dummy.scale.set(4.6, 1.05, 1.0);
      _dummy.updateMatrix();
      mesh.setMatrixAt(instanceIdx++, _dummy.matrix);

      // Right rear tire streak
      _dummy.position.set(sm.x - perpX, 500 - sm.y - perpY, elevation);
      _dummy.rotation.set(0, 0, heading);
      _dummy.scale.set(4.6, 1.05, 1.0);
      _dummy.updateMatrix();
      mesh.setMatrixAt(instanceIdx++, _dummy.matrix);
    }

    mesh.count = instanceIdx;
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={instancedMeshRef}
      args={[undefined, undefined, MAX_MARKS]}
      frustumCulled={false}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        color="#080a0f"
        transparent
        opacity={0.44}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </instancedMesh>
  );
};
