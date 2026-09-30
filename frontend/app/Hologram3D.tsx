"use client";

import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useState } from "react";
import * as THREE from "three";

type Props = { title: string; archetype: string };
const cyan = "#70fff1";

function HoloMaterial({ color = cyan, opacity = 0.34, wireframe = false }: { color?: string; opacity?: number; wireframe?: boolean }) {
  return <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} transparent opacity={opacity} wireframe={wireframe} metalness={0.45} roughness={0.28} />;
}

function Car({ hood, trunk, doors, engine }: { hood: boolean; trunk: boolean; doors: boolean; engine: boolean }) {
  const glass = "#a8fff8";
  return <group position={[0, -0.35, 0]} scale={0.78}>
    {/* chassis and sculpted body */}
    <mesh position={[0, 0, 0]}><boxGeometry args={[4.4, 0.62, 1.9]} /><HoloMaterial opacity={0.24} /></mesh>
    <mesh position={[0, 0.28, 0]}><boxGeometry args={[3.65, 0.32, 1.75]} /><HoloMaterial opacity={0.17} /></mesh>
    <mesh position={[-0.28, 0.73, 0]}><boxGeometry args={[2.05, 0.76, 1.48]} /><HoloMaterial color={glass} opacity={0.1} /></mesh>
    {/* bright contour lines make the silhouette legible */}
    <mesh position={[0, 0.02, 0]}><boxGeometry args={[4.48, 0.64, 1.98]} /><meshBasicMaterial color={cyan} wireframe transparent opacity={0.95} /></mesh>
    <mesh position={[-0.28, 0.74, 0]}><boxGeometry args={[2.12, 0.8, 1.55]} /><meshBasicMaterial color={cyan} wireframe transparent opacity={0.8} /></mesh>
    {/* front hood is hinged and rotates open */}
    <group position={[1.58, 0.34, 0]} rotation={[0, 0, hood ? -0.9 : 0]}>
      <mesh position={[0.52, 0.08, 0]}><boxGeometry args={[1.28, 0.16, 1.78]} /><HoloMaterial opacity={0.32} /></mesh>
      <mesh position={[0.52, 0.09, 0]}><boxGeometry args={[1.31, 0.18, 1.81]} /><meshBasicMaterial color={cyan} wireframe transparent opacity={0.9} /></mesh>
    </group>
    {/* boot lid opens from its rear hinge */}
    <group position={[-2.03, 0.36, 0]} rotation={[0, 0, trunk ? 0.85 : 0]}>
      <mesh position={[-0.42, 0.04, 0]}><boxGeometry args={[0.82, 0.15, 1.77]} /><HoloMaterial opacity={0.36} /></mesh>
      <mesh position={[-0.42, 0.05, 0]}><boxGeometry args={[0.85, 0.17, 1.8]} /><meshBasicMaterial color={cyan} wireframe transparent opacity={0.9} /></mesh>
    </group>
    {/* side doors swing outward; hinges sit at the B pillars */}
    {[-1, 1].map((side) => <group key={side} position={[0.05, 0.28, side * 0.91]} rotation={[doors ? side * 0.7 : 0, 0, 0]}>
      <mesh position={[-0.1, 0.1, side * 0.38]}><boxGeometry args={[1.55, 0.48, 0.08]} /><HoloMaterial opacity={0.26} /></mesh>
      <mesh position={[-0.1, 0.1, side * 0.43]}><boxGeometry args={[1.6, 0.52, 0.05]} /><meshBasicMaterial color={cyan} wireframe transparent opacity={0.9} /></mesh>
    </group>)}
    {/* engine components appear above the bay when the hood opens */}
    {engine && hood && <group position={[1.12, 0.48, 0]}>
      <mesh><boxGeometry args={[0.95, 0.42, 1.05]} /><HoloMaterial color="#ffc36e" opacity={0.52} /></mesh>
      <mesh position={[0, 0.08, 0]}><boxGeometry args={[0.98, 0.45, 1.08]} /><meshBasicMaterial color="#ffd08a" wireframe transparent opacity={0.95} /></mesh>
      {[-0.3, 0, 0.3].map((z) => <mesh key={z} position={[0, 0.29, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.09, 0.09, 0.6, 12]} /><meshStandardMaterial color="#ffc36e" emissive="#ff9c38" emissiveIntensity={1.8} /></mesh>)}
      <mesh position={[-0.3, -0.28, 0]}><cylinderGeometry args={[0.28, 0.28, 0.12, 20]} /><HoloMaterial color="#ffd08a" opacity={0.65} /></mesh>
    </group>}
    {/* wheels, hubs, and brake discs */}
    {[-1.45, 1.45].flatMap((x) => [-1, 1].map((side) => <group key={`${x}-${side}`} position={[x, -0.39, side * 0.96]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh><cylinderGeometry args={[0.48, 0.48, 0.22, 32]} /><meshStandardMaterial color="#07171b" metalness={0.85} roughness={0.24} /></mesh>
      <mesh position={[0, side * 0.12, 0]}><cylinderGeometry args={[0.28, 0.28, 0.035, 24]} /><HoloMaterial opacity={0.68} /></mesh>
      <mesh position={[0, side * 0.145, 0]}><torusGeometry args={[0.46, 0.025, 6, 32]} /><meshBasicMaterial color={cyan} /></mesh>
    </group>))}
    <mesh position={[2.25, 0.1, 0]}><boxGeometry args={[0.08, 0.18, 1.3]} /><meshStandardMaterial color="#d8ffff" emissive="#bfffff" emissiveIntensity={4} /></mesh>
    <mesh position={[-2.25, 0.1, 0]}><boxGeometry args={[0.08, 0.16, 1.3]} /><meshStandardMaterial color="#ff6477" emissive="#ff203d" emissiveIntensity={2} /></mesh>
  </group>;
}

function SubjectModel({ archetype, title }: Props) {
  switch (archetype) {
    case "car": return null;
    case "planet": return <group><mesh><sphereGeometry args={[1.35, 48, 32]} /><HoloMaterial opacity={0.58} /></mesh><mesh><sphereGeometry args={[1.38, 24, 16]} /><meshBasicMaterial color={cyan} wireframe transparent opacity={0.38} /></mesh><mesh rotation={[0.5, 0.2, -0.25]}><torusGeometry args={[2.0, 0.035, 8, 120]} /><meshBasicMaterial color="#c8a5ff" /></mesh><mesh rotation={[0.5, 0.2, -0.25]}><torusGeometry args={[2.15, 0.018, 8, 120]} /><meshBasicMaterial color={cyan} transparent opacity={0.5} /></mesh></group>;
    case "human": return <group><mesh position={[0, 1.22, 0]}><sphereGeometry args={[0.42, 24, 18]} /><HoloMaterial opacity={0.52} /></mesh><mesh position={[0, 0.1, 0]}><capsuleGeometry args={[0.42, 1.45, 8, 16]} /><HoloMaterial opacity={0.28} /></mesh>{[-1, 1].map((s) => <group key={s}><mesh position={[s * 0.68, 0.17, 0]} rotation={[0, 0, s * -0.16]}><capsuleGeometry args={[0.14, 1.25, 6, 12]} /><HoloMaterial opacity={0.46} /></mesh><mesh position={[s * 0.24, -1.22, 0]}><capsuleGeometry args={[0.17, 1.05, 6, 12]} /><HoloMaterial opacity={0.46} /></mesh></group>)}</group>;
    case "animal": return <group><mesh position={[0, 0.08, 0]} scale={[1.3, 0.68, 0.62]}><sphereGeometry args={[0.7, 24, 16]} /><HoloMaterial color="#adccff" opacity={0.45} /></mesh><mesh position={[0.95, 0.48, 0]}><sphereGeometry args={[0.43, 24, 16]} /><HoloMaterial color="#adccff" opacity={0.5} /></mesh>{[-0.62, 0.58].flatMap((x) => [-0.32, 0.32].map((z) => <mesh key={`${x}-${z}`} position={[x, -0.62, z]}><capsuleGeometry args={[0.12, 0.75, 5, 10]} /><HoloMaterial color="#adccff" opacity={0.55} /></mesh>))}<mesh position={[-1.08, 0.27, 0]} rotation={[0, 0, -0.8]}><capsuleGeometry args={[0.08, 0.68, 5, 10]} /><HoloMaterial color="#adccff" opacity={0.48} /></mesh></group>;
    case "engine": return <group><mesh><boxGeometry args={[1.8, 1.15, 1.25]} /><HoloMaterial color="#ffc36e" opacity={0.46} /></mesh><mesh><boxGeometry args={[1.83, 1.18, 1.28]} /><meshBasicMaterial color="#ffd08a" wireframe transparent opacity={0.9} /></mesh>{[-0.48, -0.16, 0.16, 0.48].map((x) => <mesh key={x} position={[x, 0.74, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.13, 0.13, 0.7, 16]} /><HoloMaterial color="#ffb74f" opacity={0.7} /></mesh>)}</group>;
    case "molecule": return <group>{[[0, 0, 0], [1, 0.7, 0], [-1, 0.7, 0], [0, -0.9, 0.6], [0, -0.9, -0.6]].map((p, i) => <mesh key={i} position={p as [number, number, number]}><sphereGeometry args={[i ? 0.36 : 0.55, 24, 16]} /><HoloMaterial color={i ? "#9dbbff" : "#ff777c"} opacity={0.65} /></mesh>)}<mesh><icosahedronGeometry args={[0.9, 1]} /><meshBasicMaterial color={cyan} wireframe transparent opacity={0.25} /></mesh></group>;
    case "building": return <group><mesh position={[0, -0.3, 0]}><boxGeometry args={[1.8, 2.4, 1.5]} /><HoloMaterial opacity={0.22} /></mesh><mesh position={[0, 1.0, 0]}><coneGeometry args={[1.45, 1.2, 4]} /><HoloMaterial color="#a8c7ff" opacity={0.35} /></mesh>{[-0.55, 0, 0.55].flatMap((x) => [-0.48, 0.1, 0.68].map((y) => <mesh key={`${x}-${y}`} position={[x, y, 0.77]}><boxGeometry args={[0.23, 0.31, 0.04]} /><meshStandardMaterial color={cyan} emissive={cyan} emissiveIntensity={1.5} /></mesh>))}</group>;
    case "aircraft": return <group><mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.28, 0.38, 3.2, 24]} /><HoloMaterial opacity={0.45} /></mesh><mesh rotation={[0, 0, Math.PI / 2]}><boxGeometry args={[0.2, 4.3, 0.9]} /><HoloMaterial opacity={0.28} /></mesh><mesh position={[-1.3, 0, 0]} rotation={[0, 0, Math.PI / 2]}><boxGeometry args={[0.15, 1.5, 0.48]} /><HoloMaterial opacity={0.4} /></mesh></group>;
    case "tree": return <group><mesh position={[0, -0.7, 0]}><cylinderGeometry args={[0.2, 0.35, 1.6, 12]} /><HoloMaterial color="#d2a875" opacity={0.55} /></mesh>{[[0, 0.35, 0], [-0.48, 0.1, 0.2], [0.43, 0.04, -0.12], [0, 0.72, 0.1]].map((p, i) => <mesh key={i} position={p as [number, number, number]}><icosahedronGeometry args={[0.75 - i * 0.08, 2]} /><HoloMaterial color="#93ffa9" opacity={0.35} /></mesh>)}</group>;
    default: return <group><mesh><dodecahedronGeometry args={[1.3, 1]} /><HoloMaterial opacity={0.22} /></mesh><mesh><dodecahedronGeometry args={[1.32, 1]} /><meshBasicMaterial color={cyan} wireframe transparent opacity={0.86} /></mesh><mesh rotation={[0.5, 0.3, 0]}><torusGeometry args={[1.8, 0.018, 8, 96]} /><meshBasicMaterial color="#bfacff" /></mesh><Html position={[0, -2, 0]} center><span className="holo-model-label">{title.toUpperCase()} · CONCEPT MODEL</span></Html></group>;
  }
}

export default function Hologram3D({ title, archetype }: Props) {
  const [parts, setParts] = useState({ hood: false, trunk: false, doors: false, engine: true });
  const toggle = (part: keyof typeof parts) => setParts((current) => ({ ...current, [part]: !current[part] }));
  return <div className="holo-3d-shell">
    <div className="holo-3d-canvas" aria-label={`Interactive 3D ${title} model`}>
      <Canvas camera={{ position: [5.8, 3.2, 7], fov: 38 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={1.5} /><pointLight position={[4, 6, 5]} color="#8cfff4" intensity={48} /><pointLight position={[-5, 2, -4]} color="#819bff" intensity={20} />
        <gridHelper args={[12, 24, "#2bbeb6", "#164149"]} position={[0, -1.55, 0]} />
        {archetype === "car" ? <Car {...parts} /> : <SubjectModel archetype={archetype} title={title} />}
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={3.2} maxDistance={12} target={[0, 0, 0]} />
      </Canvas>
      <div className="holo-3d-crosshair" aria-hidden="true">⌖</div>
    </div>
    {archetype === "car" ? <div className="holo-part-controls" aria-label="Car model controls">
      <button className={parts.doors ? "selected" : ""} onClick={() => toggle("doors")}>{parts.doors ? "CLOSE" : "OPEN"} DOORS</button>
      <button className={parts.trunk ? "selected" : ""} onClick={() => toggle("trunk")}>{parts.trunk ? "CLOSE" : "OPEN"} TRUNK</button>
      <button className={parts.hood ? "selected" : ""} onClick={() => toggle("hood")}>{parts.hood ? "CLOSE" : "OPEN"} HOOD</button>
      <button className={parts.engine ? "selected" : ""} onClick={() => toggle("engine")}>{parts.engine ? "HIDE" : "SHOW"} ENGINE</button>
    </div> : <p className="holo-3d-hint">DRAG TO ORBIT · SCROLL TO ZOOM</p>}
  </div>;
}
