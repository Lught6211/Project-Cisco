"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, Line, OrbitControls, Text } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Group, Mesh } from "three";

type MemoryNode = { id: string; label: string; kind: string; x: number; y: number; detail?: string; active?: boolean };
type MemoryEdge = { source: string; target: string; label: string };

const nodeColors: Record<string, string> = {
  agent: "#52e5da",   // Cyan / Blue
  person: "#52e5da",  // Cyan
  place: "#b8a3ff",   // Purple
  task: "#f2b66d",    // Yellow / Gold
  memory: "#6e9695"   // Muted Cyan
};

const stateColors: Record<string, string> = {
  idle: "#52e5da",      // Cyan
  listening: "#f2b66d", // Amber
  thinking: "#b8a3ff",  // Purple
  speaking: "#10b981"   // Green
};

export default function MemoryScene({
  nodes = [],
  edges = [],
  selected,
  voiceState,
  onSelect
}: {
  nodes?: MemoryNode[];
  edges?: MemoryEdge[];
  selected: string;
  voiceState: "idle" | "listening" | "thinking" | "speaking";
  onSelect: (id: string) => void;
}) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeEdges = Array.isArray(edges) ? edges : [];

  const positions = useMemo(() => new Map(safeNodes.map((node, index) => [
    node.id, 
    [(node.x - 50) / 7.2, (50 - node.y) / 7.2, ((index % 3) - 1) * 0.9] as [number, number, number]
  ])), [safeNodes]);

  const spaceDots = useMemo(() => {
    const values = new Float32Array(800 * 3);
    for (let i = 0; i < 800; i++) {
      values[i * 3] = ((i * 17) % 180 - 90) / 8;
      values[i * 3 + 1] = ((i * 29) % 140 - 70) / 8;
      values[i * 3 + 2] = ((i * 43) % 120 - 60) / 8;
    }
    return values;
  }, []);

  return (
    <Canvas 
      camera={{ position: [0, 0, 9.2], fov: 42 }} 
      dpr={[1, 2]} 
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#081011"]} />
      <ambientLight intensity={1.8} />
      <pointLight position={[0, 0, 10]} intensity={20} color="#52e5da" />

      {/* Deep Space Background Particle Cloud */}
      <points>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[spaceDots, 3]} /></bufferGeometry>
        <pointsMaterial size={0.032} color="#52e5da" transparent opacity={0.4} sizeAttenuation />
      </points>

      {/* Connecting Laser Beams */}
      {safeEdges.map((edge) => {
        const from = positions.get(edge.source);
        const to = positions.get(edge.target);
        return from && to ? (
          <group key={`${edge.source}-${edge.target}`}>
            <Line
              points={[from, to]}
              color="#52e5da"
              transparent
              opacity={0.45}
              lineWidth={1.2}
            />
            <Line
              points={[from, to]}
              color="#b8a3ff"
              transparent
              opacity={0.2}
              lineWidth={2.8}
            />
          </group>
        ) : null;
      })}

      {/* Nodes */}
      {safeNodes.map((node) => (
        <JarvisNodeVisual
          key={node.id}
          node={node}
          position={positions.get(node.id) ?? [0, 0, 0]}
          active={selected === node.id || node.active === true}
          voiceState={voiceState}
          onSelect={onSelect}
        />
      ))}

      <SceneControls selectedPosition={positions.get(selected)} />
    </Canvas>
  );
}

function JarvisNodeVisual({ node, position, active, voiceState, onSelect }: { node: MemoryNode; position: [number, number, number]; active: boolean; voiceState: "idle" | "listening" | "thinking" | "speaking"; onSelect: (id: string) => void }) {
  const groupRef = useRef<Group>(null);
  const ring1Ref = useRef<Mesh>(null);
  const ring2Ref = useRef<Mesh>(null);
  
  const isAgent = node.kind === "agent";
  const color = isAgent ? stateColors[voiceState] : (nodeColors[node.kind] || "#52e5da");

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const time = clock.getElapsedTime();

    groupRef.current.rotation.y += delta * (isAgent ? 0.3 : 0.1);
    if (ring1Ref.current) ring1Ref.current.rotation.x += delta * (isAgent ? 0.5 : 0.2);
    if (ring2Ref.current) ring2Ref.current.rotation.z -= delta * (isAgent ? 0.7 : 0.3);

    const pulse = isAgent ? Math.sin(time * (voiceState === "speaking" ? 12 : voiceState === "listening" ? 8 : 2)) * 0.06 : Math.sin(time * 1.5) * 0.03;
    groupRef.current.scale.setScalar((active ? 1.2 : 1.0) + pulse);
  });

  return (
    <group ref={groupRef} position={position} onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}>
      {/* Central Solid Glowing Sphere */}
      <mesh>
        <sphereGeometry args={[isAgent ? 0.45 : 0.22, 32, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 2.5 : 1.2} roughness={0.1} />
      </mesh>

      {/* Outer Wireframe Sphere */}
      <mesh ref={ring1Ref}>
        <icosahedronGeometry args={[isAgent ? 0.65 : 0.32, 2]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.45} />
      </mesh>

      {/* Dual Rotating Orbital Rings */}
      <mesh ref={ring2Ref} rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[isAgent ? 0.82 : 0.42, 0.012, 16, 64]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.9 : 0.5} />
      </mesh>
      <mesh rotation={[0, Math.PI / 4, Math.PI / 3]}>
        <torusGeometry args={[isAgent ? 0.98 : 0.52, 0.008, 12, 64]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.6 : 0.25} />
      </mesh>

      {/* Text Label Billboard */}
      <Billboard follow>
        <Text position={[isAgent ? 0.85 : 0.52, 0.18, 0]} fontSize={isAgent ? 0.22 : 0.13} color="#ffffff" anchorX="left" anchorY="middle" outlineWidth={0.015} outlineColor="#081011">
          {node.label}
        </Text>
        <Text position={[isAgent ? 0.85 : 0.52, -0.02, 0]} fontSize={0.08} color={color} anchorX="left" anchorY="middle" letterSpacing={0.1}>
          {`// ${node.kind.toUpperCase()}`}
        </Text>
      </Billboard>
    </group>
  );
}

function SceneControls({ selectedPosition }: { selectedPosition?: [number, number, number] }) {
  const controlsRef = useRef<any>(null);
  const focusTarget = useRef(new THREE.Vector3());
  const focusPosition = useRef(new THREE.Vector3());
  const focusing = useRef(false);

  useEffect(() => {
    if (!selectedPosition || !controlsRef.current) return;
    focusTarget.current.set(...selectedPosition);
    focusPosition.current.set(selectedPosition[0], selectedPosition[1], selectedPosition[2] + 4.0);
    focusing.current = true;
  }, [selectedPosition]);

  useFrame((_, delta) => {
    if (!focusing.current || !controlsRef.current) return;
    const easing = 1 - Math.pow(0.001, delta);
    controlsRef.current.target.lerp(focusTarget.current, easing);
    controlsRef.current.object.position.lerp(focusPosition.current, easing);
    controlsRef.current.update();
    if (controlsRef.current.object.position.distanceTo(focusPosition.current) < 0.04) focusing.current = false;
  });

  return <OrbitControls ref={controlsRef} enablePan enableZoom zoomToCursor minDistance={2.5} maxDistance={22} enableDamping dampingFactor={0.08} makeDefault />;
}