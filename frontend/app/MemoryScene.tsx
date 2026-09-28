"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, Html, Line, OrbitControls, Text } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import * as THREE from "three";
import type { Group, Mesh } from "three";

type MemoryNode = { 
  id: string; 
  label: string; 
  kind: string; 
  x: number; 
  y: number; 
  confidence?: number;
  relationship_count?: number;
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
  corruption = 0,
  onSelect
}: {
  nodes?: MemoryNode[];
  edges?: MemoryEdge[];
  selected: string;
  voiceState: "idle" | "listening" | "thinking" | "speaking";
  speechLevel: number;
  corruption?: number;
  onSelect: (id: string) => void;
}) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeEdges = Array.isArray(edges) ? edges : [];

  const layout = useMemo(() => {
    const byId = new Map<string, MemoryNode>();
    const adjacency = new Map<string, Set<string>>();
    for (const node of safeNodes) {
      byId.set(node.id, node);
      adjacency.set(node.id, new Set());
    }
    for (const edge of safeEdges) {
      if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
      adjacency.get(edge.source)?.add(edge.target);
      adjacency.get(edge.target)?.add(edge.source);
    }

    const compareNodes = (a: string, b: string) =>
      (byId.get(a)?.label ?? a).localeCompare(byId.get(b)?.label ?? b) || a.localeCompare(b);
    const root = safeNodes.find((node) => node.kind === "agent")?.id ?? safeNodes[0]?.id;
    const parentByNode = new Map<string, string>();
    const depthByNode = new Map<string, number>();
    const children = new Map<string, string[]>();
    if (root) {
      depthByNode.set(root, 0);
      const queue = [root];
      const discover = (parent: string, child: string) => {
        if (depthByNode.has(child)) return;
        parentByNode.set(child, parent);
        depthByNode.set(child, (depthByNode.get(parent) ?? 0) + 1);
        const siblings = children.get(parent) ?? [];
        siblings.push(child);
        children.set(parent, siblings);
        queue.push(child);
      };
      while (queue.length || safeNodes.some((node) => !depthByNode.has(node.id))) {
        while (queue.length) {
          const parent = queue.shift()!;
          [...(adjacency.get(parent) ?? [])].sort(compareNodes).forEach((child) => discover(parent, child));
        }
        const orphan = safeNodes.filter((node) => !depthByNode.has(node.id)).sort((a, b) => compareNodes(a.id, b.id))[0];
        if (orphan) discover(root, orphan.id);
      }
    }

    const positions = new Map<string, [number, number, number]>();
    if (root) positions.set(root, [0, 0, 0]);
    const fibonacciDirection = (index: number, count: number): THREE.Vector3 => {
      const y = 1 - 2 * (index + 0.5) / count;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    };
    const rootChildren = children.get(root ?? "") ?? [];
    const rootRadius = 2.9 + Math.max(0, rootChildren.length - 8) * 0.075;
    for (const [parent, childIds] of children) {
      childIds.sort(compareNodes);
      const parentPosition = new THREE.Vector3(...(positions.get(parent) ?? [0, 0, 0]));
      const parentDirection = parentPosition.lengthSq() > 0
        ? parentPosition.clone().normalize()
        : new THREE.Vector3(0, 1, 0);
      const tangent = new THREE.Vector3(0, 0, 1);
      if (Math.abs(parentDirection.dot(tangent)) > 0.92) tangent.set(1, 0, 0);
      const side = new THREE.Vector3().crossVectors(parentDirection, tangent).normalize();
      tangent.crossVectors(side, parentDirection).normalize();
      childIds.forEach((childId, index) => {
        const depth = depthByNode.get(childId) ?? 1;
        let direction: THREE.Vector3;
        if (parent === root) {
          direction = fibonacciDirection(index, childIds.length);
          const screenRadius = Math.hypot(direction.x, direction.y);
          if (screenRadius < 0.52) {
            // Keep a planet from lining up over the core from the initial view.
            const angle = index * Math.PI * (3 - Math.sqrt(5));
            const depth = Math.sign(direction.z || 1) * Math.sqrt(1 - 0.52 ** 2);
            direction.set(0.52 * Math.cos(angle), 0.52 * Math.sin(angle), depth);
          }
        } else {
          // Keep each descendant near its parent's direction, like a moon in
          // the same solar-system branch, while spacing siblings around it.
          const count = childIds.length;
          const cone = Math.min(0.92, 0.24 + Math.sqrt(count) * 0.14);
          const theta = cone * Math.sqrt((index + 0.5) / count);
          const angle = index * Math.PI * (3 - Math.sqrt(5));
          direction = parentDirection.clone().multiplyScalar(Math.cos(theta))
            .addScaledVector(tangent, Math.sin(theta) * Math.cos(angle))
            .addScaledVector(side, Math.sin(theta) * Math.sin(angle)).normalize();
        }
        const radius = rootRadius + (depth - 1) * 2.15;
        const position = direction.multiplyScalar(radius);
        positions.set(childId, [position.x, position.y, position.z]);
      });
    }
    return { positions, parentByNode };
  }, [safeNodes, safeEdges]);
  const { positions, parentByNode } = layout;
  const orbitRef = useRef<Group>(null);
  const knownNodeIds = useRef(new Set(safeNodes.map((node) => node.id)));
  const [spawnOrigins, setSpawnOrigins] = useState<Map<string, [number, number, number]>>(() => new Map());

  useEffect(() => {
    const additions = new Map<string, [number, number, number]>();
    for (const node of safeNodes) {
      if (knownNodeIds.current.has(node.id)) continue;
      const parent = parentByNode.get(node.id);
      additions.set(node.id, parent ? positions.get(parent) ?? [0, 0, 0] : [0, 0, 0]);
      knownNodeIds.current.add(node.id);
    }
    if (additions.size) {
      setSpawnOrigins((previous) => new Map([...previous, ...additions]));
    }
  }, [safeNodes, positions, parentByNode]);

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
      camera={{ position: [0, 0, Math.max(9.2, spaceExtent * 2.15)], fov: 42 }}
      dpr={[1, 2]} 
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#081011"]} />
      <ambientLight intensity={2.0} />
      <pointLight position={[0, 0, 10]} intensity={25} color="#52e5da" />

      <VectorSpaceGrid extent={spaceExtent} voiceState={voiceState} speechLevel={speechLevel} corruption={corruption} />

      <OrbitalDrift orbitRef={orbitRef}>
        {/* Parent links glow clearly; secondary relationships stay in the background. */}
        {safeEdges.map((edge) => {
          const from = positions.get(edge.source);
          const to = positions.get(edge.target);
          const parentLink = parentByNode.get(edge.source) === edge.target || parentByNode.get(edge.target) === edge.source;
          return from && to ? (
            <Line
              key={`${edge.source}-${edge.target}`}
              points={[from, to]}
              color={new THREE.Color(parentLink ? "#52e5da" : "#368d91").lerp(new THREE.Color("#ff263f"), corruption * 0.88)}
              transparent
              opacity={parentLink ? 0.42 : 0.09}
              lineWidth={parentLink ? 1.2 : 0.6}
            />
          ) : null;
        })}

        {safeNodes.map((node) => (
          <JarvisNodeVisual
            key={node.id}
            node={node}
            position={positions.get(node.id) ?? [0, 0, 0]}
            spawnFrom={spawnOrigins.get(node.id)}
            level={relationshipLevels.get(node.id) ?? 1}
            active={selected === node.id || node.active === true}
            focused={selected === node.id}
            voiceState={voiceState}
            speechLevel={speechLevel}
            corruption={corruption}
            onSelect={onSelect}
          />
        ))}
      </OrbitalDrift>

      <SceneControls selectedId={selected} selectedPosition={positions.get(selected)} orbitRef={orbitRef} />
    </Canvas>
  );
}

function OrbitalDrift({ children, orbitRef }: { children: ReactNode; orbitRef: RefObject<Group | null> }) {
  useFrame((_, delta) => {
    if (!orbitRef.current) return;
    orbitRef.current.rotation.y += delta * 0.012;
    orbitRef.current.rotation.z += delta * 0.002;
  });
  return <group ref={orbitRef}>{children}</group>;
}

function VectorSpaceGrid({ extent, voiceState, speechLevel, corruption }: { extent: number; voiceState: string; speechLevel: number; corruption: number }) {
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

  useFrame(({ clock }, delta) => {
    if (!ref.current) return;
    const time = clock.getElapsedTime();
    const cycle = Math.floor(time / 4.7);
    const seed = Math.abs(Math.sin(cycle * 37.19) * 45831.21) % 1;
    const start = 2.4 + seed * 1.9;
    const phase = time % 4.7;
    const latticeGlitch = corruption > 0.08 && seed < corruption && ((phase > start && phase < start + 0.13) || (phase > start + 0.22 && phase < start + 0.29));
    const speaking = voiceState === "speaking";
    const target = 0.72 + Math.min(extent / 8, 0.95) + (speaking ? speechLevel * 0.16 : 0);
    const glitchStrength = latticeGlitch ? corruption : 0;
    const scale = THREE.MathUtils.damp(ref.current.scale.x, target + glitchStrength * 0.09, latticeGlitch ? 18 : 1.8, delta);
    ref.current.scale.setScalar(scale);
    ref.current.position.set(latticeGlitch ? Math.sin(time * 121) * 0.06 * glitchStrength : 0, latticeGlitch ? Math.cos(time * 97) * 0.035 * glitchStrength : 0, 0);
    if (materialRef.current) materialRef.current.opacity = (speaking ? 0.34 + speechLevel * 0.35 : 0.34) + glitchStrength * 0.3;
  });

  const latticeColor = new THREE.Color("#368d91").lerp(new THREE.Color("#ff263f"), corruption * 0.88);
  return (
    <points ref={ref} geometry={geometry} renderOrder={0}>
      <pointsMaterial ref={materialRef} color={latticeColor} size={2.2} sizeAttenuation={false} transparent opacity={0.34} depthWrite={false} />
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
  spawnFrom,
  level, 
  active, 
  focused,
  voiceState, 
  speechLevel,
  corruption,
  onSelect 
}: { 
  node: MemoryNode; 
  position: [number, number, number]; 
  spawnFrom?: [number, number, number];
  level: number; 
  active: boolean; 
  focused: boolean;
  voiceState: "idle" | "listening" | "thinking" | "speaking"; 
  speechLevel: number;
  corruption: number;
  onSelect: (id: string) => void 
}) {
  const groupRef = useRef<Group>(null);
  const glitchGhostRef = useRef<Group>(null);
  const ring1Ref = useRef<Mesh>(null);
  const ring2Ref = useRef<Mesh>(null);
  const spawnProgress = useRef<number | null>(null);
  const spawnOrbRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const nodeSeed = useMemo(() => {
    let hash = 2166136261;
    for (const character of node.id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return (hash >>> 0) / 4294967295;
  }, [node.id]);

  useEffect(() => {
    if (spawnFrom) spawnProgress.current = 0;
  }, [spawnFrom]);
  
  const isAgent = node.kind === "agent";
  const nodeCorruption = isAgent ? corruption : THREE.MathUtils.clamp((corruption - nodeSeed * 0.55) / 0.45, 0, 1);
  const normalColor = isAgent ? (stateColors[voiceState] || "#52e5da") : (nodeTypeColors[node.kind] || "#6e9695");
  const color = new THREE.Color(normalColor).lerp(new THREE.Color("#ff263f"), nodeCorruption * (isAgent ? 1 : 0.88)).getStyle();
  const coreLabelColor = new THREE.Color("#ffffff").lerp(new THREE.Color("#ff263f"), nodeCorruption).getStyle();
  const coreIdentity = nodeCorruption >= 0.55 ? "ULTRON" : node.label;

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const time = clock.getElapsedTime();

    const nodeTime = time + nodeSeed * 4.7;
    const glitchCycle = Math.floor(nodeTime / 4.7);
    const glitchPhase = nodeTime % 4.7;
    const glitchSeed = Math.abs(Math.sin(glitchCycle * 91.713 + nodeSeed * 31) * 43758.5453) % 1;
    const glitchStart = 0.7 + glitchSeed * 3.4;
    const glitching = nodeCorruption > 0.08 && glitchSeed < nodeCorruption && (
      (glitchPhase >= glitchStart && glitchPhase < glitchStart + 0.12) ||
      (glitchPhase >= glitchStart + 0.19 && glitchPhase < glitchStart + 0.25)
    );

    if (nodeCorruption > 0.08 && spawnProgress.current === null) {
      const twitch = glitching ? Math.sin(time * 89) * 0.1 * nodeCorruption : 0;
      groupRef.current.position.set(position[0] + twitch, position[1] + (glitching ? Math.cos(time * 73) * 0.055 * nodeCorruption : 0), position[2]);
      groupRef.current.visible = !glitching || Math.sin(time * 103) > -0.7;
      if (glitchGhostRef.current) {
        glitchGhostRef.current.visible = glitching;
        glitchGhostRef.current.position.set(Math.sin(time * 83) * 0.18, Math.cos(time * 71) * 0.08, 0.025);
        glitchGhostRef.current.rotation.z = Math.sin(time * 37) * 0.06;
      }
    } else if (spawnProgress.current === null) {
      groupRef.current.position.set(...position);
      groupRef.current.visible = true;
      if (glitchGhostRef.current) glitchGhostRef.current.visible = false;
    }

    if (spawnProgress.current !== null) {
      spawnProgress.current = Math.min(1, spawnProgress.current + delta / 0.95);
      const t = spawnProgress.current;
      const eased = 1 - (1 - t) * (1 - t);
      if (groupRef.current && spawnFrom) {
        groupRef.current.position.set(
          THREE.MathUtils.lerp(spawnFrom[0], position[0], eased),
          THREE.MathUtils.lerp(spawnFrom[1], position[1], eased),
          THREE.MathUtils.lerp(spawnFrom[2], position[2], eased),
        );
      }
      if (spawnOrbRef.current && spawnFrom) {
        spawnOrbRef.current.position.set(
          THREE.MathUtils.lerp(spawnFrom[0], position[0], Math.min(1, t * 1.12)),
          THREE.MathUtils.lerp(spawnFrom[1], position[1], Math.min(1, t * 1.12)),
          THREE.MathUtils.lerp(spawnFrom[2], position[2], Math.min(1, t * 1.12)),
        );
        const orbScale = t < 0.78 ? 1 : Math.max(0, (1 - t) / 0.22);
        spawnOrbRef.current.scale.setScalar(orbScale);
      }
      if (t >= 1) spawnProgress.current = null;
    }

    groupRef.current.rotation.y += delta * (isAgent ? 0.35 : 0.12);
    if (ring1Ref.current) ring1Ref.current.rotation.x += delta * (isAgent ? 0.5 : 0.2);
    if (ring2Ref.current) ring2Ref.current.rotation.z -= delta * (isAgent ? 0.7 : 0.3);

    const pulse = isAgent
      ? voiceState === "speaking" ? speechLevel * 0.16 : Math.sin(time * (voiceState === "listening" ? 8 : 2)) * 0.035
      : Math.sin(time * 1.2 + level) * 0.018;
      
    const spawnScale = spawnProgress.current === null ? 1 : Math.max(0.02, 1 - (1 - spawnProgress.current) ** 2);
    groupRef.current.scale.setScalar(((active ? 1.22 : 1.0) + pulse) * spawnScale);
  });

  return (
    <>
    <group
      ref={groupRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
      onPointerEnter={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
    >
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
          {nodeCorruption > 0.08 && (
            <group ref={glitchGhostRef} visible={false}>
              <mesh>
                <sphereGeometry args={[0.5, 20, 14]} />
                <meshBasicMaterial color="#23efff" wireframe transparent opacity={0.5} depthWrite={false} />
              </mesh>
              <mesh rotation={[0, 0.12, 0.08]}>
                <torusGeometry args={[0.91, 0.022, 8, 36]} />
                <meshBasicMaterial color="#ff3154" transparent opacity={0.8} depthWrite={false} />
              </mesh>
            </group>
          )}
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
        {nodeCorruption > 0.08 && (
          <group ref={glitchGhostRef} visible={false}>
            <mesh>
              <icosahedronGeometry args={[0.32, 1]} />
              <meshBasicMaterial color="#23efff" wireframe transparent opacity={0.42} depthWrite={false} />
            </mesh>
            <mesh rotation={[0.1, 0, 0.08]}>
              <torusGeometry args={[0.43, 0.014, 8, 32]} />
              <meshBasicMaterial color="#ff3154" transparent opacity={0.72} depthWrite={false} />
            </mesh>
          </group>
        )}
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

      {isAgent ? (
        <Billboard follow>
          <Text position={[0.95, 0.18, 0]} fontSize={0.22} color={coreLabelColor} anchorX="left" anchorY="middle" outlineWidth={0.015} outlineColor="#081011">
            {coreIdentity}
          </Text>
          <Text position={[0.95, -0.02, 0]} fontSize={0.08} color={color} anchorX="left" anchorY="middle" letterSpacing={0.1}>
            {`// ${node.kind.toUpperCase()}`}
          </Text>
        </Billboard>
      ) : (
        <Html position={[0, 0.55, 0]} center distanceFactor={9} zIndexRange={focused ? [30, 0] : [10, 0]}>
          <div className={`node-label-tag${focused ? " selected" : ""}`} style={{ "--node-accent": color } as CSSProperties}>
            <i />
            <span>{node.label}</span>
            {focused && <small>{node.kind}</small>}
          </div>
        </Html>
      )}
    </group>
    {spawnFrom && (
      <group ref={spawnOrbRef} position={spawnFrom}>
        <mesh>
          <sphereGeometry args={[0.065, 20, 20]} />
          <meshBasicMaterial color={color} transparent opacity={0.92} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.14, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.22} depthWrite={false} />
        </mesh>
      </group>
    )}
    </>
  );
}

function SceneControls({ selectedId, selectedPosition, orbitRef }: { selectedId: string; selectedPosition?: [number, number, number]; orbitRef: RefObject<Group | null> }) {
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
      orbitRef.current?.localToWorld(focusTarget.current);
      focusPosition.current.copy(focusTarget.current).add(new THREE.Vector3(0, 0, 4.0));
      focusing.current = true;
    }
  }, [selectedId, selectedPosition, orbitRef]);

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
