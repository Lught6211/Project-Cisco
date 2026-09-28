"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, Line, OrbitControls, Text } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Group, Mesh } from "three";

type MemoryNode = { 
  id: string; 
  label: string; 
  kind: string; 
  x: number; 
  y: number; 
  confidence?: string; 
  detail?: string; 
  active?: boolean 
};
type MemoryEdge = { source: string; target: string; label: string };

const nodeTypeColors: Record<string, string> = {
  agent: "#52e5da",   // Bright Cyan
  person: "#c6ef78",  // Emerald Green
  place: "#b8a3ff",   // Lavender Purple
  task: "#f2b66d",    // Solar Amber
  memory: "#6e9695"   // Muted Slate Teal
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

  const relationshipLevels = useMemo(() => new Map(safeNodes.map((node) => [
    node.id, 
    safeEdges.filter((edge) => edge.source === node.id || edge.target === node.id).length
  ])), [safeNodes, safeEdges]);

  return (
    <Canvas 
      camera={{ position: [0, 0, 9.2], fov: 42 }} 
      dpr={[1, 2]} 
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#081011"]} />
      <ambientLight intensity={2.0} />
      <pointLight position={[0, 0, 10]} intensity={25} color="#52e5da" />

      {/* High-Tech Vector Grid Background */}
      <gridHelper args={[40, 40, "#294e50", "#122628"]} position={[0, -4, -3]} rotation={[Math.PI / 3, 0, 0]} />

      {/* Vector Laser Connection Lines */}
      {safeEdges.map((edge) => {
        const from = positions.get(edge.source);
        const to = positions.get(edge.target);
        return from && to ? (
          <group key={`${edge.source}-${edge.target}`}>
            <Line
              points={[from, to]}
              color="#52e5da"
              transparent
              opacity={0.4}
              lineWidth={1.2}
            />
          </group>
        ) : null;
      })}

      {/* High-Poly Nodes */}
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

function JarvisNodeVisual({ 
  node, 
  position, 
  level, 
  active, 
  voiceState, 
  onSelect 
}: { 
  node: MemoryNode; 
  position: [number, number, number]; 
  level: number; 
  active: boolean; 
  voiceState: "idle" | "listening" | "thinking" | "speaking"; 
  onSelect: (id: string) => void 
}) {
  const groupRef = useRef<Group>(null);
  const ring1Ref = useRef<Mesh>(null);
  const ring2Ref = useRef<Mesh>(null);
  
  const isAgent = node.kind === "agent";
  const color = isAgent 
    ? (stateColors[voiceState] || "#52e5da") 
    : (nodeTypeColors[node.kind] || "#6e9695");

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const time = clock.getElapsedTime();

    groupRef.current.rotation.y += delta * (isAgent ? 0.35 : 0.12);
    if (ring1Ref.current) ring1Ref.current.rotation.x += delta * (isAgent ? 0.5 : 0.2);
    if (ring2Ref.current) ring2Ref.current.rotation.z -= delta * (isAgent ? 0.7 : 0.3);

    const pulse = isAgent 
      ? Math.sin(time * (voiceState === "speaking" ? 14 : voiceState === "listening" ? 8 : 2)) * 0.05 
      : Math.sin(time * 1.5 + level) * 0.03;
      
    groupRef.current.scale.setScalar((active ? 1.22 : 1.0) + pulse);
  });

  return (
    <group ref={groupRef} position={position} onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}>
      {isAgent ? (
        /* CISCO CORE: Ultra-High Poly Smooth Sphere (64x64 segments) + 48x48 Wireframe Sphere */
        <>
          <mesh>
            <sphereGeometry args={[0.48, 64, 64]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} roughness={0.05} metalness={0.8} />
          </mesh>
          <mesh ref={ring1Ref}>
            <sphereGeometry args={[0.82, 48, 48]} />
            <meshBasicMaterial color={color} wireframe transparent opacity={0.35} />
          </mesh>
        </>
      ) : (
        /* MEMORY NODES: Geometry Polygon Density Directly Dictated by Relationship Level */
        <mesh ref={ring1Ref}>
          {level >= 4 ? (
            /* Level 4+: Ultra High-Poly Geodesic Icosahedron */
            <icosahedronGeometry args={[0.3, 3]} />
          ) : level === 3 ? (
            /* Level 3: Subdivided Icosahedron */
            <icosahedronGeometry args={[0.27, 1]} />
          ) : level === 2 ? (
            /* Level 2: Dodecahedron */
            <dodecahedronGeometry args={[0.24, 0]} />
          ) : (
            /* Level 1: Octahedron */
            <octahedronGeometry args={[0.22, 0]} />
          )}
          <meshBasicMaterial color={color} wireframe transparent opacity={active ? 0.95 : 0.75} />
        </mesh>
      )}

      {/* Multi-Ring Orbital Reticles */}
      <mesh ref={ring2Ref} rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[isAgent ? 0.92 : 0.42, isAgent ? 0.015 : 0.008, 16, 64]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.9 : 0.5} />
      </mesh>
      {isAgent && (
        <mesh rotation={[0, Math.PI / 4, Math.PI / 3]}>
          <torusGeometry args={[1.08, 0.009, 12, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.35} />
        </mesh>
      )}

      {/* Text Billboard */}
      <Billboard follow>
        <Text position={[isAgent ? 0.95 : 0.52, 0.18, 0]} fontSize={isAgent ? 0.22 : 0.13} color="#ffffff" anchorX="left" anchorY="middle" outlineWidth={0.015} outlineColor="#081011">
          {node.label}
        </Text>
        <Text position={[isAgent ? 0.95 : 0.52, -0.02, 0]} fontSize={0.08} color={color} anchorX="left" anchorY="middle" letterSpacing={0.1}>
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