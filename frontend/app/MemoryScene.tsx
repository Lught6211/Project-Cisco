"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, Html, Line, OrbitControls, Text } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";
import type { Group, Mesh } from "three";

type MemoryNode = { id: string; label: string; kind: string; x: number; y: number; detail?: string; active?: boolean };
type MemoryEdge = { source: string; target: string; label: string };

const nodeTypeColors: Record<string, string> = {
  agent: "#00f0ff",   // Cyber Cyan
  person: "#10b981",  // Emerald Green
  place: "#a855f7",   // Neon Violet
  task: "#f59e0b",    // Solar Amber
  memory: "#06b6d4"   // Matrix Cyan
};

const stateColors: Record<string, string> = {
  idle: "#00f0ff",      // Cyan
  listening: "#f59e0b", // Amber
  thinking: "#a855f7",  // Purple
  speaking: "#10b981"   // Emerald
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
    [(node.x - 50) / 7, (50 - node.y) / 7, ((index % 3) - 1) * 1.2] as [number, number, number]
  ])), [safeNodes]);

  const relationshipLevels = useMemo(() => new Map(safeNodes.map((node) => [
    node.id, 
    safeEdges.filter((edge) => edge.source === node.id || edge.target === node.id).length
  ])), [safeNodes, safeEdges]);

  // Sci-Fi Particle Starfield Grid
  const spaceDots = useMemo(() => {
    const values = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      values[i * 3] = ((i * 17) % 160 - 80) / 8;
      values[i * 3 + 1] = ((i * 29) % 120 - 60) / 8;
      values[i * 3 + 2] = ((i * 43) % 100 - 50) / 8;
    }
    return values;
  }, []);

  return (
    <Canvas camera={{ position: [0, 0, 9.5], fov: 42 }} dpr={[1, 2]} performance={{ min: 0.6 }} gl={{ antialias: true, powerPreference: "high-performance" }}>
      <color attach="background" args={["#030712"]} />
      <ambientLight intensity={1.5} />
      <pointLight position={[0, 4, 6]} intensity={18} color="#00f0ff" />
      <pointLight position={[-6, -4, -4]} intensity={10} color="#a855f7" />

      {/* Particle Cloud Background */}
      <points>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[spaceDots, 3]} /></bufferGeometry>
        <pointsMaterial size={0.038} color="#00f0ff" transparent opacity={0.45} sizeAttenuation />
      </points>

      {/* Futuristic Line Connections */}
      {safeEdges.map((edge) => {
        const from = positions.get(edge.source);
        const to = positions.get(edge.target);
        const level = Math.max(1, Math.min(relationshipLevels.get(edge.source) ?? 1, 4));
        return from && to ? (
          <Line
            key={`${edge.source}-${edge.target}`}
            points={[from, to]}
            color={level > 2 ? "#00f0ff" : level > 1 ? "#3b82f6" : "#1e293b"}
            transparent
            opacity={0.45 + level * 0.12}
            lineWidth={level * 0.75}
            dashed={level === 1}
            dashSize={0.18}
            gapSize={0.08}
          />
        ) : null;
      })}

      {/* Holographic Nodes */}
      {safeNodes.map((node) => (
        <AdvancedNodeVisual
          key={node.id}
          node={node}
          position={positions.get(node.id) ?? [0, 0, 0]}
          level={relationshipLevels.get(node.id) ?? 0}
          active={selected === node.id || node.active === true}
          voiceState={voiceState}
          onSelect={onSelect}
        />
      ))}

      <SceneControls selectedPosition={positions.get(selected)} />
    </Canvas>
  );
}

function AdvancedNodeVisual({ node, position, level, active, voiceState, onSelect }: { node: MemoryNode; position: [number, number, number]; level: number; active: boolean; voiceState: "idle" | "listening" | "thinking" | "speaking"; onSelect: (id: string) => void }) {
  const groupRef = useRef<Group>(null);
  const outerRingRef = useRef<Mesh>(null);
  const innerCoreRef = useRef<Mesh>(null);
  
  const isAgent = node.kind === "agent";
  const baseColor = nodeTypeColors[node.kind] ?? nodeTypeColors.memory;
  const agentColor = stateColors[voiceState] ?? nodeTypeColors.agent;
  const color = isAgent ? agentColor : baseColor;

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const time = clock.getElapsedTime();

    // Multi-axis rotation loops for sci-fi reticle feel
    groupRef.current.rotation.y += delta * (isAgent ? 0.25 : 0.08 + level * 0.02);
    if (outerRingRef.current) outerRingRef.current.rotation.x += delta * (isAgent ? 0.4 : 0.15);
    if (innerCoreRef.current) innerCoreRef.current.rotation.z -= delta * (isAgent ? 0.6 : 0.2);

    // Dynamic state animation
    const pulseFreq = voiceState === "speaking" ? 12 : voiceState === "thinking" ? 6 : voiceState === "listening" ? 9 : 2;
    const statePulse = isAgent ? Math.sin(time * pulseFreq) * 0.08 : Math.sin(time * 1.5 + level) * 0.03;
    
    groupRef.current.scale.setScalar((active ? 1.18 : 1.0) + statePulse);
  });

  const knowledgeSize = 0.22 + Math.min(level, 4) * 0.03;

  return (
    <group ref={groupRef} position={position} onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}>
      {/* Central Solid Crystal Core */}
      <mesh ref={innerCoreRef}>
        {isAgent ? <icosahedronGeometry args={[0.52, 3]} /> : level >= 3 ? <dodecahedronGeometry args={[knowledgeSize, 2]} /> : <octahedronGeometry args={[knowledgeSize, 1]} />}
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 2.8 : 1.1} roughness={0.1} metalness={0.9} />
      </mesh>

      {/* Wireframe Outer Containment Field */}
      <mesh ref={outerRingRef}>
        {isAgent ? <icosahedronGeometry args={[0.68, 2]} /> : <sphereGeometry args={[knowledgeSize * 1.4, 16, 16]} />}
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 1.5 : 0.4} wireframe transparent opacity={0.35} />
      </mesh>

      {/* Dual Orbiting Tech Reticle Rings */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[isAgent ? 0.85 : 0.42, 0.012, 16, 64]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.9 : 0.5} />
      </mesh>
      <mesh rotation={[0, Math.PI / 3, Math.PI / 4]}>
        <torusGeometry args={[isAgent ? 1.05 : 0.52, 0.008, 12, 64]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.6 : 0.25} />
      </mesh>

      {/* Holographic Text Billboard Label */}
      <Billboard follow>
        <Text position={[isAgent ? 0.95 : 0.58, 0.22, 0]} fontSize={isAgent ? 0.22 : 0.14} color="#f8fafc" anchorX="left" anchorY="middle" outlineWidth={0.015} outlineColor="#020617">
          {node.label}
        </Text>
        <Text position={[isAgent ? 0.95 : 0.58, -0.02, 0]} fontSize={0.085} color={color} anchorX="left" anchorY="middle" letterSpacing={0.1}>
          {`// ${node.kind.toUpperCase()}`}
        </Text>
      </Billboard>

      {/* 3D Spatial In-Scene HUD Card on Select */}
      {active && (
        <Html distanceFactor={11} position={[isAgent ? 1.2 : 0.8, -0.5, 0]}>
          <div className="holo-hud-card">
            <div className="holo-corner top-left" />
            <div className="holo-corner top-right" />
            <div className="holo-corner bottom-left" />
            <div className="holo-corner bottom-right" />
            <div className="holo-tag" style={{ color }}>SYSTEM_NODE // {node.kind.toUpperCase()}</div>
            <div className="holo-title">{node.label}</div>
            <div className="holo-detail">{node.detail || "Active contextual memory node in CISCO runtime graph."}</div>
            <div className="holo-meta">
              <span>STATUS: <strong>ONLINE</strong></span>
              <span>LINK_STRENGTH: <strong style={{ color }}>98.4%</strong></span>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

function SceneControls({ selectedPosition }: { selectedPosition?: [number, number, number] }) {
  const controlsRef = useRef<any>(null);
  const focusTarget = useRef(new Vector3());
  const focusPosition = useRef(new Vector3());
  const focusing = useRef(false);

  useEffect(() => {
    if (!selectedPosition || !controlsRef.current) return;
    focusTarget.current.set(...selectedPosition);
    focusPosition.current.set(selectedPosition[0], selectedPosition[1], selectedPosition[2] + 4.2);
    focusing.current = true;
  }, [selectedPosition]);

  useFrame((_, delta) => {
    if (!focusing.current || !controlsRef.current) return;
    const easing = 1 - Math.pow(0.001, delta);
    controlsRef.current.target.lerp(focusTarget.current, easing);
    controlsRef.current.object.position.lerp(focusPosition.current, easing);
    controlsRef.current.update();
    if (controlsRef.current.object.position.distanceTo(focusPosition.current) < 0.05) focusing.current = false;
  });

  return <OrbitControls ref={controlsRef} enablePan enableZoom zoomToCursor minDistance={2.5} maxDistance={22} enableDamping dampingFactor={0.08} makeDefault />;
}