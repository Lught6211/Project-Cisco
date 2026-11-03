"use client";

import type { CameraDevice } from "./useMedia";

type Props = {
  visible: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  historyOpen: boolean;
  logOpen: boolean;
  serverState: "loading" | "unconfigured" | "online" | "offline";
  devices: CameraDevice[];
  deviceId: string;
  onHistory: () => void;
  onTidy: () => void;
  onClear: () => void;
  onCamera: () => void;
  onDevice: (id: string) => void;
  onScreen: () => void;
  onMemory: () => void;
  onServer: () => void;
  onLog: () => void;
};

/** Outlined chip row, top right: HISTORY / TIDY / CLEAR VIEW / CAMERA / CAMERA SOURCE / SCREEN. */
export default function TopBar(props: Props) {
  return (
    <nav className={`hx-topbar${props.visible ? " on" : ""}`} aria-label="Dashboard controls">
      <div className="hx-chip-row">
        <button className={`hx-chip${props.historyOpen ? " active" : ""}`} onClick={props.onHistory} aria-pressed={props.historyOpen}>HISTORY</button>
        <button className="hx-chip" onClick={props.onTidy}>TIDY</button>
        <button className="hx-chip" onClick={props.onClear}>CLEAR VIEW</button>
        <button className={`hx-chip${props.cameraOn ? " active" : ""}`} onClick={props.onCamera} aria-pressed={props.cameraOn}>CAMERA</button>
        <label className="hx-chip-caption" htmlFor="hx-camera-source">CAMERA SOURCE</label>
        <select id="hx-camera-source" className="hx-chip hx-select" value={props.deviceId} onChange={(event) => props.onDevice(event.target.value)}>
          <option value="">DEFAULT CAMERA</option>
          {props.devices.map((device) => <option key={device.id} value={device.id}>{device.label.toUpperCase()}</option>)}
        </select>
        <button className={`hx-chip${props.screenOn ? " active" : ""}`} onClick={props.onScreen} aria-pressed={props.screenOn}>SCREEN</button>
      </div>
      <div className="hx-chip-row second">
        <button className="hx-chip" onClick={props.onMemory}>MEMORY</button>
        <button className={`hx-chip server-${props.serverState}`} onClick={props.onServer}><i className="hx-led" />SERVER</button>
        <button className={`hx-chip${props.logOpen ? " active" : ""}`} onClick={props.onLog} aria-pressed={props.logOpen}>LOG</button>
      </div>
    </nav>
  );
}
