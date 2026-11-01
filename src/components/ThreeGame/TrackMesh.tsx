import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Track } from '../../types';

interface TrackMeshProps {
  track: Track;
}

// Procedural tileable asphalt grain texture generator
const createAsphaltTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = '#1e293b'; // Slate dark asphalt base
  ctx.fillRect(0, 0, 128, 128);
  
  // High-frequency fine grains
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    const size = Math.random() * 1.2;
    const val = Math.random() * 15;
    ctx.fillStyle = `rgba(${15 + val}, ${23 + val}, ${42 + val}, ${0.12})`;
    ctx.fillRect(x, y, size, size);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 12);
  return texture;
};

export const TrackMesh: React.FC<TrackMeshProps> = ({ track }) => {
  // Memoize geometry & textures to prevent memory leaks and lag
  const { shapeGeometry, outerCurbs, innerCurbs, asphaltTexture } = useMemo(() => {
    const outer = track.outerBoundary;
    const inner = track.innerBoundary;

    // 1. Create 3D track shape with inner hole
    const shape = new THREE.Shape();
    shape.moveTo(outer[0].x, 500 - outer[0].y);
    for (let i = 1; i < outer.length; i++) {
      shape.lineTo(outer[i].x, 500 - outer[i].y);
    }
    shape.closePath();

    const hole = new THREE.Path();
    hole.moveTo(inner[0].x, 500 - inner[0].y);
    for (let i = 1; i < inner.length; i++) {
      hole.lineTo(inner[i].x, 500 - inner[i].y);
    }
    hole.closePath();
    shape.holes.push(hole);

    // Extrude options
    const extrudeSettings = {
      depth: 0.3,
      bevelEnabled: false,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const texture = createAsphaltTexture();

    // Helper to generate curb meshes along boundaries
    const generateCurbs = (boundary: typeof outer, prefix: string) => {
      const curbsList: React.ReactNode[] = [];
      const interval = 2; // sample points to avoid massive overhead
      for (let i = 0; i < boundary.length; i += interval) {
        const p1 = boundary[i];
        const p2 = boundary[(i + interval) % boundary.length];

        const v1 = new THREE.Vector3(p1.x, 500 - p1.y, 0.25);
        const v2 = new THREE.Vector3(p2.x, 500 - p2.y, 0.25);
        const distance = v1.distanceTo(v2);
        if (distance < 0.5) continue;

        const position = v1.clone().add(v2).multiplyScalar(0.5);
        const direction = v2.clone().sub(v1).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);

        // Curbs color alternate
        const color = (i / interval) % 2 === 0 ? '#ef4444' : '#ffffff';

        curbsList.push(
          <mesh 
            key={`${prefix}-curb-${i}`} 
            position={position} 
            quaternion={quaternion}
            receiveShadow
          >
            <boxGeometry args={[1.6, distance + 0.2, 0.22]} />
            <meshStandardMaterial 
              color={color} 
              roughness={0.9} 
              metalness={0.0}
            />
          </mesh>
        );
      }
      return curbsList;
    };

    return {
      shapeGeometry: geometry,
      asphaltTexture: texture,
      outerCurbs: generateCurbs(outer, 'outer'),
      innerCurbs: generateCurbs(inner, 'inner')
    };
  }, [track]);

  return (
    <group>
      {/* Extruded Track Asphalt Slab */}
      <mesh 
        geometry={shapeGeometry} 
        receiveShadow 
        castShadow
        position={[0, 0, 0]}
      >
        <meshStandardMaterial 
          map={asphaltTexture}
          roughness={0.82} 
          metalness={0.15}
          color="#27272a" // Zinc dark
        />
      </mesh>

      {/* 3D Track Edge Curbs */}
      {outerCurbs}
      {innerCurbs}

      {/* White Grid Starting Line Graphics */}
      <mesh position={[track.startLine.p1.x, 500 - track.startLine.p1.y, 0.32]} rotation={[0, 0, track.startGrid[0].angle]}>
        <boxGeometry args={[1.5, 45, 0.02]} />
        <meshStandardMaterial color="#ffffff" roughness={1.0} />
      </mesh>
    </group>
  );
};
