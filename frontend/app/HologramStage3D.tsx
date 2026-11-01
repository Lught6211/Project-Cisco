"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { WorldHologram } from "./Hologram3D";

export default function HologramStage3D({
  title,
  archetype,
  cameraResetToken,
  onDismiss,
}: {
  title: string;
  archetype: string;
  cameraResetToken: number;
  onDismiss: () => void;
}) {
  return (
    <div className="world-holo-stage" aria-label={`${title} interactive 3D hologram`}>
      <Canvas key={cameraResetToken} camera={{ position: [0, 0, 9.5], fov: 42 }} dpr={[0.8, 1.15]} gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}>
        <ambientLight intensity={1.8} />
        <pointLight position={[3, 4, 8]} color="#75fff1" intensity={35} />
        <HologramPointLattice />
        <WorldHologram title={title} archetype={archetype} position={[0, 0, 0]} scale={0.78} onDismiss={onDismiss} />
        <OrbitControls enableDamping dampingFactor={0.08} enablePan enableZoom minDistance={5.5} maxDistance={18} />
      </Canvas>
    </div>
  );
}

function HologramPointLattice() {
  const geometry = useMemo(() => {
    const values: number[] = [];
    for (let x = -5; x <= 5.001; x += 0.55) {
      for (let y = -3.5; y <= 3.501; y += 0.55) {
        for (let z = -1.8; z <= 1.801; z += 0.55) values.push(x, y, z);
      }
    }
    const next = new THREE.BufferGeometry();
    next.setAttribute("position", new THREE.Float32BufferAttribute(values, 3));
    return next;
  }, []);
  return <points geometry={geometry} renderOrder={0}>
    <pointsMaterial color="#36d9ec" size={0.018} sizeAttenuation transparent opacity={0.22} depthWrite={false} />
  </points>;
}
