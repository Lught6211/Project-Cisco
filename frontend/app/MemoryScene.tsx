"use client";

import { Canvas } from "@react-three/fiber";
import { Billboard, Line, OrbitControls, Text } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import type { Group } from "three";

type MemoryNode = { id: string; label: string; kind: string; x: number; y: number; active?: boolean };
type MemoryEdge = { source: string; target: string; label: string };
const colors: Record<string, string> = { agent: "#52e5da", person: "#c6ef78", place: "#b8a3ff", task: "#f2b66d", memory: "#6e9695" };

export default function MemoryScene({ nodes, edges, selected, speaking, onSelect }: { nodes: MemoryNode[]; edges: MemoryEdge[]; selected: string; speaking: boolean; onSelect: (id: string) => void }) {
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
    {nodes.map((node) => <MemoryNodeVisual key={node.id} node={node} position={positions.get(node.id) ?? [0, 0, 0]} active={selected === node.id || node.active === true} speaking={speaking} onSelect={onSelect} />)}
    <SceneControls selectedPosition={positions.get(selected)} />
  </Canvas>;
}

function MemoryNodeVisual({ node, position, active, speaking, onSelect }: { node: MemoryNode; position: [number, number, number]; active: boolean; speaking: boolean; onSelect: (id: string) => void }) {
  const groupRef = useRef<Group>(null);
  const color = colors[node.kind] ?? colors.memory;
  const isAgent = node.kind === "agent";
  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * (isAgent ? 0.2 : 0.07);
    groupRef.current.rotation.z = Math.sin(clock.getElapsedTime() * (isAgent ? 1.5 : 0.8)) * (isAgent ? 0.04 : 0.02);
    if (isAgent && speaking) groupRef.current.scale.setScalar((active ? 1.12 : 1) + Math.sin(clock.getElapsedTime() * 14) * 0.11);
  });
  useEffect(() => {
    if (groupRef.current && !speaking) groupRef.current.scale.setScalar(active ? 1.12 : 1);
  }, [active, speaking]);
  return <group ref={groupRef} position={position} onClick={(event) => { event.stopPropagation(); onSelect(node.id); }}>
    <mesh rotation={[0.2, 0.4, 0]}><icosahedronGeometry args={[isAgent ? 0.48 : 0.25, isAgent ? 2 : 1]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 2.5 : 0.6} roughness={0.14} metalness={0.55} wireframe={!isAgent} /></mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[isAgent ? 0.62 : 0.33, isAgent ? 0.025 : 0.014, 12, 64]} /><meshBasicMaterial color={color} transparent opacity={active ? 0.95 : 0.58} /></mesh>
    <mesh rotation={[0, Math.PI / 3, 0]}><torusGeometry args={[isAgent ? 0.76 : 0.43, isAgent ? 0.014 : 0.008, 10, 64]} /><meshBasicMaterial color={color} transparent opacity={active ? 0.62 : 0.24} /></mesh>
    <mesh scale={active ? 1.5 : 1}><sphereGeometry args={[isAgent ? 0.68 : 0.36, 24, 24]} /><meshBasicMaterial color={color} transparent opacity={active ? 0.1 : 0.035} wireframe /></mesh>
    <Billboard follow><Text position={[isAgent ? 0.78 : 0.48, 0.16, 0]} fontSize={isAgent ? 0.19 : 0.12} color="#e9f2f2" anchorX="left" anchorY="middle" outlineWidth={0.012} outlineColor="#081011">{node.label}</Text><Text position={[isAgent ? 0.78 : 0.48, -0.02, 0]} fontSize={0.075} color={color} anchorX="left" anchorY="middle" letterSpacing={0.08}>{node.kind.toUpperCase()}</Text></Billboard>
  </group>;
}

function SceneControls({ selectedPosition }: { selectedPosition?: [number, number, number] }) {
  const controlsRef = useRef<any>(null);
  const focusTarget = useRef(new Vector3());
  const focusPosition = useRef(new Vector3());
  const focusing = useRef(false);
  useEffect(() => {
    if (!selectedPosition || !controlsRef.current) return;
    focusTarget.current.set(...selectedPosition);
    focusPosition.current.set(selectedPosition[0], selectedPosition[1], selectedPosition[2] + 3.8);
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
  return <OrbitControls ref={controlsRef} enablePan enableZoom zoomToCursor minDistance={2.5} maxDistance={22} enableDamping dampingFactor={0.08} minAzimuthAngle={-Infinity} maxAzimuthAngle={Infinity} makeDefault />;
}
