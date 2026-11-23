import React, { useRef, useEffect } from 'react';
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
  skidmarks: SkidmarkPoint[];
}

const _dummy = new THREE.Object3D();

export const Skidmarks3D: React.FC<Skidmarks3DProps> = ({ skidmarks }) => {
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = instancedMeshRef.current;
    if (!mesh) return;

    const maxMarks = 1100;
    let instanceIdx = 0;

    for (let i = 0; i < skidmarks.length && instanceIdx + 1 < maxMarks; i++) {
      const sm = skidmarks[i];
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
  }, [skidmarks]);

  return (
    <instancedMesh
      ref={instancedMeshRef}
      args={[undefined, undefined, 1100]}
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
