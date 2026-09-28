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
  idle: "#58a6ff",      // Blue
  listening: "#f2d84b", // Yellow
  thinking: "#b8a3ff",  // Purple
  speaking: "#10b981"   // Green
};

export default function MemoryScene({
  nodes = [],
  edges = [],
  selected,
  voiceState,
  speechLevel,
  onSelect
}: {
  nodes?: MemoryNode[];
  edges?: MemoryEdge[];
  selected: string;
  voiceState: "idle" | "listening" | "thinking" | "speaking";
  speechLevel: number;
  onSelect: (id: string) => void;
}) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeEdges = Array.isArray(edges) ? edges : [];

  const positions = useMemo(() => {
    // Arrange nodes in stable semantic sectors instead of trusting the old
    // modulo-generated x/y coordinates, which caused collisions and tangles.
    const sectors: Record<string, number> = { person: -Math.PI / 2, place: -Math.PI / 4, task: Math.PI, memory: Math.PI / 4 };
    const grouped = new Map<string, MemoryNode[]>();
    safeNodes.filter((node) => node.kind !== "agent").forEach((node) => {
      const group = grouped.get(node.kind) ?? [];
      group.push(node);
      grouped.set(node.kind, group);
    });
    const result = new Map<string, [number, number, number]>();
    const agent = safeNodes.find((node) => node.kind === "agent");
    if (agent) result.set(agent.id, [0, 0, 0]);
    for (const [kind, group] of grouped) {
      group.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
      const center = sectors[kind] ?? -Math.PI / 2;
      const spread = Math.min(Math.PI * 0.62, 0.72 + group.length * 0.19);
      group.forEach((node, index) => {
        const ring = Math.floor(index / 5);
        const slot = index % 5;
        const ringCount = Math.min(5, group.length - ring * 5);
        const angle = center + (slot - (ringCount - 1) / 2) * (spread / Math.max(ringCount - 1, 1));
        const radius = 2.7 + ring * 1.15;
        const depth = ((index % 3) - 1) * 0.58 + (kind === "place" ? -0.45 : kind === "memory" ? 0.45 : 0);
        result.set(node.id, [Math.cos(angle) * radius, Math.sin(angle) * radius, depth]);
      });
    }
    return result;
  }, [safeNodes]);

  const relationshipLevels = useMemo(() => new Map(safeNodes.map((node) => [
    node.id, 
    safeEdges.filter((edge) => edge.source === node.id || edge.target === node.id).length
  ])), [safeNodes, safeEdges]);

  const spaceExtent = useMemo(() => {
    let extent = 1;
    for (const position of positions.values()) {
      extent = Math.max(extent, Math.hypot(position[0], position[1], position[2]));
    }
    return extent;
  }, [positions]);

  return (
    <Canvas 
      camera={{ position: [0, 0, 9.2], fov: 42 }} 
      dpr={[1, 2]} 
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#081011"]} />
      <ambientLight intensity={2.0} />
      <pointLight position={[0, 0, 10]} intensity={25} color="#52e5da" />

      <VectorSpaceGrid extent={spaceExtent} voiceState={voiceState} speechLevel={speechLevel} />

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
          speechLevel={speechLevel}
          onSelect={onSelect}
        />
      ))}

      <SceneControls selectedId={selected} selectedPosition={positions.get(selected)} />
    </Canvas>
  );
}

function VectorSpaceGrid({ extent, voiceState, speechLevel }: { extent: number; voiceState: string; speechLevel: number }) {
  const ref = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const geometry = useMemo(() => {
    const divisions = 14;
    const halfSize = 7;
    const points: number[] = [];
    for (let x = 0; x <= divisions; x++) {
      for (let y = 0; y <= divisions; y++) {
        for (let z = 0; z <= divisions; z++) {
          points.push(
            -halfSize + (2 * halfSize * x) / divisions,
            -halfSize + (2 * halfSize * y) / divisions,
            -halfSize + (2 * halfSize * z) / divisions,
          );
        }
      }
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return result;
  }, []);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const speaking = voiceState === "speaking";
    const target = 0.72 + Math.min(extent / 8, 0.95) + (speaking ? speechLevel * 0.16 : 0);
    const scale = THREE.MathUtils.damp(ref.current.scale.x, target, 1.8, delta);
    ref.current.scale.setScalar(scale);
    if (materialRef.current) materialRef.current.opacity = speaking ? 0.34 + speechLevel * 0.35 : 0.34;
  });

  return (
    <points ref={ref} geometry={geometry} renderOrder={0}>
      <pointsMaterial ref={materialRef} color="#368d91" size={2.2} sizeAttenuation={false} transparent opacity={0.34} depthWrite={false} />
    </points>
  );
}

function AudioWaveform({ color, voiceState, speechLevel }: { color: string; voiceState: string; speechLevel: number }) {
  const geometry = useMemo(() => {
    const sampleCount = 96;
    const vertices = new Float32Array(3 * sampleCount * 2 * 3);
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    return result;
  }, []);
  const materialRef = useRef<THREE.LineBasicMaterial>(null);

  useFrame(({ clock }) => {
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const vertices = attribute.array as Float32Array;
    const time = clock.getElapsedTime();
    const speaking = voiceState === "speaking";
    const sampleCount = 96;
    let cursor = 0;

    for (let plane = 0; plane < 3; plane++) {
      for (let i = 0; i < sampleCount; i++) {
        const angle = (i / sampleCount) * Math.PI * 2;
        const carrier = 0.5 + 0.5 * Math.sin(i * 0.43 - time * 15 + plane * 1.7);
        const ripple = speaking ? speechLevel * (0.025 + carrier * 0.23) : 0;
        const innerRadius = 1.04;
        const outerRadius = innerRadius + ripple;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const coordinates = plane === 0
          ? [[innerRadius * c, innerRadius * s, 0], [outerRadius * c, outerRadius * s, 0]]
          : plane === 1
            ? [[innerRadius * c, 0, innerRadius * s], [outerRadius * c, 0, outerRadius * s]]
            : [[0, innerRadius * c, innerRadius * s], [0, outerRadius * c, outerRadius * s]];
        for (const point of coordinates) {
          vertices[cursor++] = point[0];
          vertices[cursor++] = point[1];
          vertices[cursor++] = point[2];
        }
      }
    }
    attribute.needsUpdate = true;
    if (materialRef.current) materialRef.current.opacity = speaking ? 0.22 + speechLevel * 0.72 : 0.12;
  });

  return (
    <lineSegments geometry={geometry} renderOrder={2} frustumCulled={false}>
      <lineBasicMaterial ref={materialRef} color={color} transparent opacity={0.12} depthWrite={false} />
    </lineSegments>
  );
}

function JarvisNodeVisual({ 
  node, 
  position, 
  level, 
  active, 
  voiceState, 
  speechLevel,
  onSelect 
}: { 
  node: MemoryNode; 
  position: [number, number, number]; 
  level: number; 
  active: boolean; 
  voiceState: "idle" | "listening" | "thinking" | "speaking"; 
  speechLevel: number;
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
      ? voiceState === "speaking" ? speechLevel * 0.16 : Math.sin(time * (voiceState === "listening" ? 8 : 2)) * 0.035
      : Math.sin(time * 1.2 + level) * 0.018;
      
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
          <AudioWaveform color={color} voiceState={voiceState} speechLevel={speechLevel} />
        </>
      ) : (
        /* Memory nodes: faceted holographic shell, luminous core, and rotating reticles. */
        <group>
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
          <meshBasicMaterial color={color} wireframe transparent opacity={active ? 1 : 0.72} />
        </mesh>
        <mesh>
          <icosahedronGeometry args={[0.075, 1]} />
          <meshBasicMaterial color={color} transparent opacity={active ? 0.8 : 0.48} />
        </mesh>
        <mesh rotation={[Math.PI / 2.4, 0.25, 0]}>
          <torusGeometry args={[0.34, 0.009, 8, 48]} />
          <meshBasicMaterial color={color} transparent opacity={active ? 0.68 : 0.34} />
        </mesh>
        </group>
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
      {!isAgent && (
        <mesh rotation={[Math.PI / 3, 0.4, 0]}>
          <torusGeometry args={[0.48, 0.006, 6, 48]} />
          <meshBasicMaterial color={color} transparent opacity={active ? 0.54 : 0.26} />
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
