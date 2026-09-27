"use client";

import { Canvas } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { useMemo } from "react";

type MemoryNode = { id: string; label: string; kind: string; x: number; y: number; active?: boolean };
type MemoryEdge = { source: string; target: string; label: string };
const colors: Record<string, string> = { agent: "#52e5da", person: "#c6ef78", place: "#b8a3ff", task: "#f2b66d", memory: "#6e9695" };

export default function MemoryScene({ nodes, edges, selected, onSelect }: { nodes: MemoryNode[]; edges: MemoryEdge[]; selected: string; onSelect: (id: string) => void }) {
  const positions = useMemo(() => new Map(nodes.map((node, index) => [node.id, [(node.x - 50) / 8, (50 - node.y) / 8, ((index % 3) - 1) * 0.9] as [number, number, number]])), [nodes]);
  return <Canvas camera={{ position: [0, 0, 9], fov: 45 }} dpr={[1, 2]} gl={{ antialias: true }}>
    <color attach="background" args={["#0a1718"]} /><ambientLight intensity={1.3} /><pointLight position={[0, 2, 5]} intensity={12} color="#52e5da" />
    <gridHelper args={[14, 14, "#1d3838", "#112526"]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -1.2]} />
    {edges.map((edge) => { const from = positions.get(edge.source); const to = positions.get(edge.target); return from && to ? <Line key={`${edge.source}-${edge.target}`} points={[from, to]} color="#397170" transparent opacity={0.65} lineWidth={1} /> : null; })}
    {nodes.map((node) => { const position = positions.get(node.id) ?? [0, 0, 0]; const active = selected === node.id || node.active; return <group key={node.id} position={position} onClick={(event) => { event.stopPropagation(); onSelect(node.id); }}>
      <mesh><sphereGeometry args={[active ? 0.34 : 0.22, 24, 24]} /><meshStandardMaterial color={colors[node.kind] ?? colors.memory} emissive={colors[node.kind] ?? colors.memory} emissiveIntensity={active ? 1.7 : 0.35} roughness={0.25} /></mesh>
      <mesh scale={active ? 1.45 : 1}><sphereGeometry args={[0.42, 24, 24]} /><meshBasicMaterial color={colors[node.kind] ?? colors.memory} transparent opacity={active ? 0.13 : 0.04} wireframe /></mesh>
      <Html distanceFactor={10} position={[0.42, 0.12, 0]} style={{ pointerEvents: "none", whiteSpace: "nowrap" }}><span className="scene-label"><strong>{node.label}</strong><small>{node.kind}</small></span></Html>
    </group>; })}
    <OrbitControls enablePan enableZoom minDistance={4} maxDistance={16} makeDefault />
  </Canvas>;
}
