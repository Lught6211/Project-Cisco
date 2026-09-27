"use client";

import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { useMemo } from "react";

type MemoryNode = { id: string; label: string; kind: string; x: number; y: number; active?: boolean };
type MemoryEdge = { source: string; target: string; label: string };
const colors: Record<string, string> = { agent: "#52e5da", person: "#c6ef78", place: "#b8a3ff", task: "#f2b66d", memory: "#6e9695" };

export default function MemoryScene({ nodes, edges, selected, onSelect }: { nodes: MemoryNode[]; edges: MemoryEdge[]; selected: string; onSelect: (id: string) => void }) {
  const positions = useMemo(() => new Map(nodes.map((node, index) => [node.id, [(node.x - 50) / 8, (50 - node.y) / 8, ((index % 3) - 1) * 0.9] as [number, number, number]])), [nodes]);
  const spaceDots = useMemo(() => {
    const values = new Float32Array(420 * 3);
    for (let index = 0; index < 420; index += 1) {
      values[index * 3] = ((index * 17) % 140 - 70) / 10;
      values[index * 3 + 1] = ((index * 29) % 100 - 50) / 10;
      values[index * 3 + 2] = ((index * 43) % 90 - 45) / 10;
    }
    return values;
  }, []);
  return <Canvas camera={{ position: [0, 0, 9], fov: 45 }} dpr={[1, 2]} gl={{ antialias: true }}>
    <color attach="background" args={["#0a1718"]} /><ambientLight intensity={1.3} /><pointLight position={[0, 2, 5]} intensity={12} color="#52e5da" />
    <points>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[spaceDots, 3]} /></bufferGeometry>
      <pointsMaterial size={0.035} color="#4a9290" transparent opacity={0.72} sizeAttenuation />
    </points>
    {edges.map((edge) => { const from = positions.get(edge.source); const to = positions.get(edge.target); return from && to ? <Line key={`${edge.source}-${edge.target}`} points={[from, to]} color="#397170" transparent opacity={0.65} lineWidth={1} /> : null; })}
    {nodes.map((node) => { const position = positions.get(node.id) ?? [0, 0, 0]; const active = selected === node.id || node.active; const color = colors[node.kind] ?? colors.memory; return <group key={node.id} position={position} onClick={(event) => { event.stopPropagation(); onSelect(node.id); }}>
      <mesh><sphereGeometry args={[active ? 0.34 : 0.22, 32, 32]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 2.2 : 0.55} roughness={0.18} metalness={0.4} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} scale={active ? 1.35 : 1}><torusGeometry args={[0.36, 0.018, 10, 48]} /><meshBasicMaterial color={color} transparent opacity={active ? 0.9 : 0.48} /></mesh>
      <mesh rotation={[0, Math.PI / 3, 0]} scale={active ? 1.15 : 0.92}><torusGeometry args={[0.49, 0.009, 8, 48]} /><meshBasicMaterial color={color} transparent opacity={active ? 0.5 : 0.2} /></mesh>
      <mesh scale={active ? 1.5 : 1}><sphereGeometry args={[0.42, 24, 24]} /><meshBasicMaterial color={color} transparent opacity={active ? 0.1 : 0.035} wireframe /></mesh>
    </group>; })}
    <OrbitControls enablePan enableZoom minDistance={4} maxDistance={16} makeDefault />
  </Canvas>;
}
