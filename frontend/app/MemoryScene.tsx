"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, Line, OrbitControls, Text } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Group, Mesh } from "three";

type MemoryNode = { id: string; label: string; kind: string; x: number; y: number; detail?: string; active?: boolean };
type MemoryEdge = { source: string; target: string; label: string };

// Strictly Distinct Colors for Each Category
const nodeTypeColors: Record<string, string> = {
  agent: "#52e5da",   // Bright Cyan
  person: "#10b981",  // Emerald Green
  place: "#b8a3ff",   // Lavender Purple
  task: "#f59e0b",    // Solar Amber
  memory: "#6e9695"   // Muted Slate Teal
};

const stateColors: Record<string, string> = {
  idle: "#52e5da",      // Cyan
  listening: "#f59e0b", // Amber
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

  const relationshipLevels = useMemo(() => new Map(safeNodes.map((node) => [
    node.id, 
    safeEdges.filter((edge) => edge.source === node.id || edge.target === node.id).length
  ])), [safeNodes, safeEdges]);

  // Deep Space Particle Field
  const spaceDots = useMemo(() => {
    const values = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
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

      {/* Particle Field */}
      <points>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[spaceDots, 3]} /></bufferGeometry>
        <pointsMaterial size={0.035} color="#52e5da" transparent opacity={0.35} sizeAttenuation />
      </points>

      {/* Connection Laser Lines */}
      {safeEdges.map((edge) => {
        const from = positions.get(edge.source);
        const to = positions.get(edge.target);
        return from && to ? (
          <group key={`${edge.source}-${edge.target}`}>
            <Line
              points={[from, to]}
              color="#52e5da"
              transparent
              opacity={0.35}
              lineWidth={1.1}
            />
          </group>
        ) : null;
      })}

      {/* 3D Nodes */}
      {safeNodes.map((node) => (
        <JarvisNodeVisual
          key={node.id}
          node={node}
          position={positions.get(node.id) ?? [0, 0, 0]}
          level={relationshipLevels.get(node.id) ?? 1}
          active={selected === node.id || node.active === true}
          voiceState={voiceState}
          onSelect={onSelect}
        />
      ))}

      <SceneControls selectedId={selected} selectedPosition={positions.get(selected)} />
    </Canvas>
  );
}

function JarvisNodeVisual({ node, position, level, active, voiceState, onSelect }: { node: MemoryNode; position: [number, number, number]; level: number; active: boolean; voiceState: "idle" | "listening" | "thinking" | "speaking"; onSelect: (id: string) => void }) {
  const groupRef = useRef<Group>(null);
  const ring1Ref = useRef<Mesh>(null);
  const ring2Ref = useRef<Mesh>(null);
  
  const isAgent = node.kind === "agent";
  
  // CISCO uses dynamic state colors; other nodes strictly use category colors
  const color = isAgent 
    ? (stateColors[voiceState] || "#52e5da") 
    : (nodeTypeColors[node.kind] || "#6e9695");

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const time = clock.getElapsedTime();

    groupRef.current.rotation.y += delta * (isAgent ? 0.3 : 0.1);
    if (ring1Ref.current) ring1Ref.current.rotation.x += delta * (isAgent ? 0.5 : 0.2);
    if (ring2Ref.current) ring2Ref.current.rotation.z -= delta * (isAgent ? 0.7 : 0.3);

    const pulse = isAgent 
      ? Math.sin(time * (voiceState === "speaking" ? 12 : voiceState === "listening" ? 8 : 2)) * 0.06 
      : Math.sin(time * 1.5 + level) * 0.03;
      
    groupRef.current.scale.setScalar((active ? 1.2 : 1.0) + pulse);
  });

  return (
    <group ref={groupRef} position={position} onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}>
      {isAgent ? (
        /* CISCO ONLY: Solid glowing sphere core + wireframe shell */
        <>
          <mesh>
            <sphereGeometry args={[0.42, 32, 32]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.8} roughness={0.1} />
          </mesh>
          <mesh ref={ring1Ref}>
            <icosahedronGeometry args={[0.65, 2]} />
            <meshBasicMaterial color={color} wireframe transparent opacity={0.4} />
          </mesh>
        </>
      ) : (
        /* NON-AGENT NODES: Unique open wireframes based on relationship level */
        <mesh ref={ring1Ref}>
          {level >= 3 ? (
            <dodecahedronGeometry args={[0.26, 1]} />
          ) : level === 2 ? (
            <octahedronGeometry args={[0.24, 0]} />
          ) : (
            <tetrahedronGeometry args={[0.22, 0]} />
          )}
          <meshBasicMaterial color={color} wireframe transparent opacity={active ? 0.95 : 0.7} />
        </mesh>
      )}

      {/* Orbital Rings */}
      <mesh ref={ring2Ref} rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[isAgent ? 0.82 : 0.38, isAgent ? 0.012 : 0.007, 16, 64]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.9 : 0.45} />
      </mesh>
      {isAgent && (
        <mesh rotation={[0, Math.PI / 4, Math.PI / 3]}>
          <torusGeometry args={[0.98, 0.008, 12, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} />
        </mesh>
      )}

      {/* Billboard Text */}
      <Billboard follow>
        <Text position={[isAgent ? 0.85 : 0.48, 0.18, 0]} fontSize={isAgent ? 0.22 : 0.13} color="#ffffff" anchorX="left" anchorY="middle" outlineWidth={0.015} outlineColor="#081011">
          {node.label}
        </Text>
        <Text position={[isAgent ? 0.85 : 0.48, -0.02, 0]} fontSize={0.08} color={color} anchorX="left" anchorY="middle" letterSpacing={0.1}>
          {`// ${node.kind.toUpperCase()}`}
        </Text>
      </Billboard>
    </group>
  );
}

function SceneControls({ selectedId, selectedPosition }: { selectedId: string; selectedPosition?: [number, number, number] }) {
  const controlsRef = useRef<any>(null);
  const focusTarget = useRef(new THREE.Vector3());
  const focusPosition = useRef(new THREE.Vector3());
  const focusing = useRef(false);
  const lastSelectedId = useRef<string>(selectedId);

  useEffect(() => {
    // Only animate camera position when the user explicitly changes selected node ID
    if (!selectedPosition || !controlsRef.current) return;
    if (lastSelectedId.current !== selectedId) {
      lastSelectedId.current = selectedId;
      focusTarget.current.set(...selectedPosition);
      focusPosition.current.set(selectedPosition[0], selectedPosition[1], selectedPosition[2] + 4.0);
      focusing.current = true;
    }
  }, [selectedId, selectedPosition]);

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