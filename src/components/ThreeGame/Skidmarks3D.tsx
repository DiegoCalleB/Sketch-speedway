import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

interface Skidmarks3DProps {
  skidmarks: { x: number; y: number; color: string; alpha: number }[];
}

export const Skidmarks3D: React.FC<Skidmarks3DProps> = ({ skidmarks }) => {
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = instancedMeshRef.current;
    if (!mesh) return;

    const dummy = new THREE.Object3D();
    const count = skidmarks.length;
    
    // Set active count in the pool
    mesh.count = count;

    skidmarks.forEach((sm, idx) => {
      dummy.position.set(sm.x, 500 - sm.y, 0.12); // slightly above asphalt
      dummy.scale.set(2.5, 2.5, 1.0); // realistic tyre mark size
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
  }, [skidmarks]);

  return (
    <instancedMesh 
      ref={instancedMeshRef} 
      args={[null as any, null as any, 600]}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial 
        color="#090d16" 
        transparent 
        opacity={0.35} 
        depthWrite={false} 
      />
    </instancedMesh>
  );
};
