"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, Html, Line, OrbitControls, Text } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Group, Mesh } from "three";

type MemoryNode = { id: string; label: string; kind: string; x: number; y: number; detail?: string; active?: boolean };
type MemoryEdge = { source: string; target: string; label: string };

// Distinct Neon Cyberpunk Colors for Every Node Type
const nodeTypeColors: Record<string, string> = {
  agent: "#00f0ff",   // Cyber Cyan
  person: "#10b981",  // Emerald Green
  place: "#a855f7",   // Neon Violet
  task: "#f59e0b",    // Solar Amber
  memory: "#3b82f6"   // Electric Blue
};

const stateColors: Record<string, string> = {
  idle: "#00f0ff",      // Cyan
  listening: "#f59e0b", // Amber
  thinking: "#a855f7",  // Purple
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
    [(node.x - 50) / 7, (50 - node.y) / 7, ((index % 3) - 1) * 1.2] as [number, number, number]
  ])), [safeNodes]);

  const relationshipLevels = useMemo(() => new Map(safeNodes.map((node) => [
    node.id, 
    safeEdges.filter((edge) => edge.source === node.id || edge.target === node.id).length
  ])), [safeNodes, safeEdges]);

  // Deep Space Particle Grid
  const spaceDots = useMemo(() => {
    const values = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) {
      values[i * 3] = ((i * 19) % 180 - 90) / 8;
      values[i * 3 + 1] = ((i * 31) % 140 - 70) / 8;
      values[i * 3 + 2] = ((i * 47) % 110 - 55) / 8;
    }
    return values;
  }, []);

  return (
    <Canvas 
      camera={{ position: [0, 0, 9.5], fov: 42 }} 
      dpr={[1, 2]} 
      performance={{ min: 0.6 }} 
      gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping }}
    >
      <color attach="background" args={["#030712"]} />
      <ambientLight intensity={2.0} />
      <pointLight position={[0, 0, 8]} intensity={25} color="#00f0ff" />
      <pointLight position={[-8, -5, -4]} intensity={15} color="#a855f7" />

      {/* Deep Space Background Particles */}
      <points>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[spaceDots, 3]} /></bufferGeometry>
        <pointsMaterial size={0.042} color="#00f0ff" transparent opacity={0.5} sizeAttenuation blending={THREE.AdditiveBlending} />
      </points>

      {/* Holographic Glowing Beam Connections */}
      {safeEdges.map((edge) => {
        const from = positions.get(edge.source);
        const to = positions.get(edge.target);
        const level = Math.max(1, Math.min(relationshipLevels.get(edge.source) ?? 1, 4));
        const edgeColor = level > 2 ? "#00f0ff" : level > 1 ? "#a855f7" : "#1e293b";
        return from && to ? (
          <g key={`${edge.source}-${edge.target}`}>
            {/* Core Laser Line */}
            <Line
              points={[from, to]}
              color={edgeColor}
              transparent
              opacity={0.7}
              lineWidth={level * 1.2}
            />
            {/* Outer Blurry Laser Glow */}
            <Line
              points={[from, to]}
              color={edgeColor}
              transparent
              opacity={0.25}
              lineWidth={level * 3.5}
            />
          </g>
        ) : null;
      })}

      {/* Nodes */}
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
  const ring1Ref = useRef<Mesh>(null);
  const ring2Ref = useRef<Mesh>(null);
  
  const isAgent = node.kind === "agent";
  const baseColor = nodeTypeColors[node.kind] ?? nodeTypeColors.memory;
  const agentColor = stateColors[voiceState] ?? nodeTypeColors.agent;
  const color = isAgent ? agentColor : baseColor;

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const time = clock.getElapsedTime();

    // Multi-axis counter-rotations
    groupRef.current.rotation.y += delta * (isAgent ? 0.35 : 0.12);
    if (ring1Ref.current) ring1Ref.current.rotation.x += delta * (isAgent ? 0.6 : 0.2);
    if (ring2Ref.current) ring2Ref.current.rotation.z -= delta * (isAgent ? 0.8 : 0.3);

    // Pulse effects
    const pulseFreq = voiceState === "speaking" ? 14 : voiceState === "listening" ? 9 : voiceState === "thinking" ? 6 : 2;
    const statePulse = isAgent ? Math.sin(time * pulseFreq) * 0.08 : Math.sin(time * 1.8 + level) * 0.04;
    
    groupRef.current.scale.setScalar((active ? 1.25 : 1.0) + statePulse);
  });

  const knowledgeSize = 0.24 + Math.min(level, 4) * 0.035;

  return (
    <group ref={groupRef} position={position} onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}>
      {/* 1. Intense Inner Glowing Plasma Sphere */}
      <mesh>
        <sphereGeometry args={[isAgent ? 0.42 : knowledgeSize, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.95 : 0.85} />
      </mesh>

      {/* 2. Additive Halo Light Glow Shell */}
      <mesh scale={1.4}>
        <sphereGeometry args={[isAgent ? 0.45 : knowledgeSize, 24, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* 3. Outer Geometric Wireframe Matrix */}
      <mesh ref={ring1Ref}>
        {isAgent ? <icosahedronGeometry args={[0.65, 2]} /> : <octahedronGeometry args={[knowledgeSize * 1.5, 1]} />}
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3.5} wireframe transparent opacity={0.6} />
      </mesh>

      {/* 4. Dual Counter-Rotating Orbital Rings */}
      <mesh ref={ring2Ref} rotation={[Math.PI / 3, 0, 0]}>
        <torusGeometry args={[isAgent ? 0.88 : 0.45, 0.015, 16, 64]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.9 : 0.6} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh rotation={[0, Math.PI / 4, Math.PI / 3]}>
        <torusGeometry args={[isAgent ? 1.08 : 0.58, 0.009, 12, 64]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.6 : 0.3} blending={THREE.AdditiveBlending} />
      </mesh>

      {/* Holographic Text Billboard */}
      <Billboard follow>
        <Text position={[isAgent ? 0.98 : 0.62, 0.24, 0]} fontSize={isAgent ? 0.24 : 0.15} color="#ffffff" anchorX="left" anchorY="middle" outlineWidth={0.018} outlineColor="#020617">
          {node.label}
        </Text>
        <Text position={[isAgent ? 0.98 : 0.62, -0.02, 0]} fontSize={0.09} color={color} anchorX="left" anchorY="middle" letterSpacing={0.12}>
          {`// ${node.kind.toUpperCase()}`}
        </Text>
      </Billboard>

      {/* 3D Spatial HUD Card on Node Select */}
      {active && (
        <Html distanceFactor={10} position={[isAgent ? 1.3 : 0.85, -0.4, 0]}>
          <div style={{
            width: "210px",
            padding: "10px 14px",
            background: "rgba(3, 7, 18, 0.92)",
            border: `1px solid ${color}`,
            borderRadius: "6px",
            color: "#ffffff",
            fontFamily: "monospace",
            boxShadow: `0 0 20px ${color}55`,
            pointerEvents: "none"
          }}>
            <div style={{ fontSize: "9px", color, letterSpacing: "1px", marginBottom: "3px" }}>NODE_INSPECT // {node.kind.toUpperCase()}</div>
            <div style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "4px" }}>{node.label}</div>
            <div style={{ fontSize: "10px", color: "#94a3b8", marginBottom: "8px", lineHeight: "1.3" }}>{node.detail || "Active node in CISCO graph."}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", borderTop: "1px dashed rgba(255,255,255,0.15)", paddingTop: "6px" }}>
              <span>STATUS: <strong style={{ color: "#10b981" }}>ONLINE</strong></span>
              <span>LINK: <strong style={{ color }}>98.4%</strong></span>
            </div>
          </div>
        </Html>
      )}
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