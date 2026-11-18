import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface Car3DProps {
  color: string;
  position: [number, number, number];
  angle: number;
  driftAngle?: number;
  bankAngle?: number;
  isDrifting: boolean;
  isBraking: boolean;
  name: string;
  active?: boolean;
  speed?: number;
  showLabel?: boolean;
}

export const Car3D: React.FC<Car3DProps> = ({
  color,
  position,
  angle,
  driftAngle = 0,
  bankAngle = 0,
  isDrifting,
  isBraking,
  name,
  active = false,
  speed = 0,
  showLabel = false
}) => {
  const carGroupRef = useRef<THREE.Group>(null);
  const frontLeftWheelRef = useRef<THREE.Mesh>(null);
  const frontRightWheelRef = useRef<THREE.Mesh>(null);
  const rearLeftWheelRef = useRef<THREE.Mesh>(null);
  const rearRightWheelRef = useRef<THREE.Mesh>(null);
  const smoothYawRef = useRef<number>(-angle);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    // 1. Spinning wheels proportional to travel speed
    const wheelSpinSpeed = speed * 18 * dt;
    if (rearLeftWheelRef.current && rearRightWheelRef.current) {
      rearLeftWheelRef.current.rotation.x += wheelSpinSpeed;
      rearRightWheelRef.current.rotation.x += wheelSpinSpeed;
    }
    if (frontLeftWheelRef.current && frontRightWheelRef.current) {
      frontLeftWheelRef.current.rotation.x += wheelSpinSpeed;
      frontRightWheelRef.current.rotation.x += wheelSpinSpeed;

      // 2. Counter-steer front wheels during drift
      const targetSteer = isDrifting ? THREE.MathUtils.clamp(driftAngle * 0.7, -0.45, 0.45) : 0;
      frontLeftWheelRef.current.rotation.z = THREE.MathUtils.damp(
        frontLeftWheelRef.current.rotation.z,
        targetSteer,
        12,
        dt
      );
      frontRightWheelRef.current.rotation.z = frontLeftWheelRef.current.rotation.z;
    }

    // 3. Smooth angular interpolation for the chassis + 3D track banking camber
    if (carGroupRef.current) {
      const targetYaw = -angle - driftAngle;
      let diff = targetYaw - smoothYawRef.current;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      smoothYawRef.current += diff * Math.min(1, dt * 18);
      carGroupRef.current.rotation.z = smoothYawRef.current;

      // Combine track banking camber with subtle drift body roll
      const targetRoll = THREE.MathUtils.clamp(bankAngle * 1.4 + driftAngle * 0.18, -0.24, 0.24);
      carGroupRef.current.rotation.x = THREE.MathUtils.damp(
        carGroupRef.current.rotation.x,
        targetRoll,
        10,
        dt
      );
    }
  });

  return (
    <group position={position}>
      {/* Contact Shadow Grounding Plane */}
      <mesh position={[0, 0, -0.08]} rotation={[0, 0, -angle]}>
        <planeGeometry args={[15, 9]} />
        <meshBasicMaterial color="#020617" transparent opacity={0.42} depthWrite={false} />
      </mesh>

      {/* Active Player Ground Halo */}
      {active && (
        <mesh position={[0, 0, -0.05]}>
          <ringGeometry args={[7.2, 8.6, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      )}

      <group ref={carGroupRef} rotation={[0, 0, -angle]}>
        {/* Main Body Chassis */}
        <mesh castShadow receiveShadow position={[0, 0, 1.1]}>
          <boxGeometry args={[11.2, 5.2, 1.75]} />
          <meshStandardMaterial color={color} roughness={0.22} metalness={0.5} />
        </mesh>

        {/* Side Nose Taper */}
        <mesh castShadow receiveShadow position={[4.2, 0, 0.95]}>
          <boxGeometry args={[4.2, 4.0, 1.3]} />
          <meshStandardMaterial color={color} roughness={0.22} metalness={0.5} />
        </mesh>

        {/* Cockpit Canopy Dome */}
        <mesh position={[-0.8, 0, 2.1]} castShadow>
          <sphereGeometry args={[1.75, 12, 12]} />
          <meshStandardMaterial
            color="#0f172a"
            roughness={0.08}
            metalness={0.9}
            transparent
            opacity={0.9}
          />
        </mesh>

        {/* Front Carbon Spoiler Lip */}
        <mesh position={[6.1, 0, 0.55]} castShadow>
          <boxGeometry args={[1.4, 5.2, 0.35]} />
          <meshStandardMaterial color="#090d16" roughness={0.6} />
        </mesh>

        {/* Rear Wing Spoiler Structure */}
        <group position={[-5.1, 0, 2.3]}>
          <mesh position={[0, -2.1, -0.45]} castShadow>
            <boxGeometry args={[1.5, 0.22, 1.5]} />
            <meshStandardMaterial color={color} roughness={0.3} />
          </mesh>
          <mesh position={[0, 2.1, -0.45]} castShadow>
            <boxGeometry args={[1.5, 0.22, 1.5]} />
            <meshStandardMaterial color={color} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.35]} castShadow>
            <boxGeometry args={[1.9, 5.8, 0.24]} />
            <meshStandardMaterial color="#090d16" roughness={0.45} />
          </mesh>
        </group>

        {/* 4 Racing Wheels */}
        <group position={[3.6, -2.85, 0.65]}>
          <mesh ref={frontLeftWheelRef} castShadow>
            <cylinderGeometry args={[1.3, 1.3, 1.3, 12]} />
            <meshStandardMaterial color="#09090b" roughness={0.85} />
          </mesh>
        </group>
        <group position={[3.6, 2.85, 0.65]}>
          <mesh ref={frontRightWheelRef} castShadow>
            <cylinderGeometry args={[1.3, 1.3, 1.3, 12]} />
            <meshStandardMaterial color="#09090b" roughness={0.85} />
          </mesh>
        </group>
        <group position={[-3.6, -2.85, 0.65]}>
          <mesh ref={rearLeftWheelRef} castShadow>
            <cylinderGeometry args={[1.4, 1.4, 1.4, 12]} />
            <meshStandardMaterial color="#09090b" roughness={0.85} />
          </mesh>
        </group>
        <group position={[-3.6, 2.85, 0.65]}>
          <mesh ref={rearRightWheelRef} castShadow>
            <cylinderGeometry args={[1.4, 1.4, 1.4, 12]} />
            <meshStandardMaterial color="#09090b" roughness={0.85} />
          </mesh>
        </group>

        {/* Headlights & Subtle Beams */}
        <group position={[5.6, 0, 1.05]}>
          <mesh position={[0, -1.7, 0]}>
            <sphereGeometry args={[0.35, 6, 6]} />
            <meshBasicMaterial color="#fef08a" />
          </mesh>
          <mesh position={[0, 1.7, 0]}>
            <sphereGeometry args={[0.35, 6, 6]} />
            <meshBasicMaterial color="#fef08a" />
          </mesh>
        </group>

        {/* Red Brake & Drift Taillights */}
        <group position={[-5.65, 0, 1.1]}>
          <mesh position={[0, -1.6, 0]}>
            <boxGeometry args={[0.24, 0.9, 0.38]} />
            <meshStandardMaterial
              color={isBraking || isDrifting ? '#f43f5e' : '#7f1d1d'}
              emissive="#f43f5e"
              emissiveIntensity={isBraking || isDrifting ? 4.0 : 0.2}
            />
          </mesh>
          <mesh position={[0, 1.6, 0]}>
            <boxGeometry args={[0.24, 0.9, 0.38]} />
            <meshStandardMaterial
              color={isBraking || isDrifting ? '#f43f5e' : '#7f1d1d'}
              emissive="#f43f5e"
              emissiveIntensity={isBraking || isDrifting ? 4.0 : 0.2}
            />
          </mesh>
        </group>
      </group>

      {/* Compact Optional Driver Badge */}
      {showLabel && (
        <Html distanceFactor={140} position={[0, 0, 4.8]} center style={{ pointerEvents: 'none' }}>
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
