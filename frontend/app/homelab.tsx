"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

const STORAGE_KEY = "cisco.homelab.connection.v1";

export type HomelabConnection = { url: string; token: string };
export type HomelabService = { id: string; name: string; label: string; state: string; status: string; controls_allowed: boolean; managed_id: string | null };
export type HomelabSite = { id: string; name: string; url: string; status: "online" | "offline" | "degraded"; http_status: number | null; latency_ms: number };
export type HomelabDownload = { hash: string; name: string; progress: number; download_speed: number; upload_speed: number; eta_seconds: number | null; state: string; paused: boolean };
export type HomelabSnapshot = {
  checked_at: string;
  server: { label: string; uptime_seconds: number; cpu_percent: number; memory: { percent: number; used_bytes: number; total_bytes: number }; filesystem: { percent: number; used_bytes: number; total_bytes: number } };
  services: HomelabService[];
  sites: HomelabSite[];
  downloads: { configured: boolean; error?: string; items: HomelabDownload[] };
};
export type HomelabLinkState = "loading" | "unconfigured" | "online" | "offline";

type Controller = {
  connection: HomelabConnection;
  snapshot: HomelabSnapshot | null;
  linkState: HomelabLinkState;
  error: string;
  ready: boolean;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<HomelabSnapshot | null>;
  controlService: (serviceId: string, action: "start" | "stop" | "restart") => Promise<void>;
  controlDownload: (hash: string, action: "pause" | "resume") => Promise<void>;
};

export function makeServerToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function useHomelab(): Controller {
  const [connection, setConnection] = useState<HomelabConnection>({ url: "", token: "" });
  const [snapshot, setSnapshot] = useState<HomelabSnapshot | null>(null);
  const [linkState, setLinkState] = useState<HomelabLinkState>("loading");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const value = JSON.parse(saved) as HomelabConnection;
        if (typeof value.url === "string" && typeof value.token === "string") setConnection(value);
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);

  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (!connection.url) throw new Error("Connect to your private homelab server first.");
    const response = await fetch(`${connection.url}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        ...(connection.token ? { Authorization: `Bearer ${connection.token}` } : {}),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(9000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.detail || `Server request failed (HTTP ${response.status}).`);
    return data as T;
  }, [connection]);

  const refresh = useCallback(async () => {
    if (!connection.url) {
      setLinkState("unconfigured");
      return null;
    }
    try {
      const result = await request<HomelabSnapshot>("/api/cisco/overview");
      setSnapshot(result);
      setLinkState("online");
      setError("");
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not reach the private server.";
      setLinkState("offline");
      setError(message);
      throw new Error(message);
    }
  }, [connection, request]);

  useEffect(() => {
    if (!ready) return;
    if (!connection.url || !connection.token) {
      setLinkState("unconfigured");
      return;
    }
    let active = true;
    const run = () => refresh().catch(() => undefined);
    void run();
    const timer = window.setInterval(() => { if (active) void run(); }, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [ready, connection, refresh]);

  const connect = useCallback(async (rawUrl: string, token: string) => {
    const candidate = rawUrl.trim().replace(/\/+$/, "");
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error("Enter the HTTPS address shown for the CISCO device in your Tailscale network.");
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/") {
      throw new Error("Use the device's HTTPS base address only; it must not include a path or credentials.");
    }
    if (token.trim() && token.trim().length < 32) throw new Error("If used, the CISCO server token must be at least 32 characters.");
    const next = { url: candidate, token: token.trim() };
    setLinkState("loading");
    setError("");
    try {
      const response = await fetch(`${candidate}/api/cisco/overview`, {
        headers: next.token ? { Authorization: `Bearer ${next.token}` } : {},
        cache: "no-store",
        signal: AbortSignal.timeout(9000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || `Server request failed (HTTP ${response.status}).`);
      setConnection(next);
      setSnapshot(data as HomelabSnapshot);
      setLinkState("online");
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (cause) {
      setLinkState(connection.url ? "offline" : "unconfigured");
      throw cause;
    }
  }, [connection.url]);

  const disconnect = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setConnection({ url: "", token: "" });
    setSnapshot(null);
    setError("");
    setLinkState("unconfigured");
  }, []);

  const controlService = useCallback(async (serviceId: string, action: "start" | "stop" | "restart") => {
    await request(`/api/cisco/services/${encodeURIComponent(serviceId)}/${action}`, { method: "POST" });
    await refresh();
  }, [request, refresh]);

  const controlDownload = useCallback(async (hash: string, action: "pause" | "resume") => {
    await request(`/api/cisco/downloads/${encodeURIComponent(hash)}/${action}`, { method: "POST" });
    await refresh();
  }, [request, refresh]);

  return { connection, snapshot, linkState, error, ready, connect, disconnect, refresh, controlService, controlDownload };
}

export function HomelabConsole({ open, onClose, controller }: { open: boolean; onClose: () => void; controller: Controller }) {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setUrl(controller.connection.url);
    setToken(controller.connection.token);
  }, [controller.connection.url, controller.connection.token]);

  if (!open) return null;
  const { snapshot, linkState } = controller;
  const connected = linkState === "online";
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      await controller.connect(url, token);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not connect to the server.");
    } finally {
      setSaving(false);
    }
  };
  const controlDownload = async (download: HomelabDownload) => {
    try {
      await controller.controlDownload(download.hash, download.paused ? "resume" : "pause");
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The download action failed.");
    }
  };
  const controlService = async (service: HomelabService, action: "start" | "stop" | "restart") => {
    const confirmation = action === "restart"
      ? `Restart ${service.label}? Active sessions may be interrupted.`
      : action === "stop"
        ? `Stop ${service.label}? It will become unavailable until started again.`
        : `Start ${service.label}?`;
    if (!window.confirm(confirmation)) return;
    try {
      await controller.controlService(service.managed_id || "", action);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : `Could not ${action} ${service.label}.`);
    }
  };
  const copyToken = async () => {
    if (!navigator.clipboard?.writeText) {
      setFormError("Clipboard access is unavailable; reveal the token and copy it manually.");
      return;
    }
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setFormError("");
    } catch {
      setFormError("Clipboard access is unavailable; reveal the token and copy it manually.");
    }
  };

  return (
    <aside className="homelab-console hud-panel" role="dialog" aria-label="CISCO homelab control">
      <header className="homelab-head">
        <div><span className="homelab-eyebrow">CISCO // PRIVATE SERVER LINK</span><h2>{snapshot?.server.label || "HOMELAB CONTROL"}</h2></div>
        <button className="homelab-close" onClick={onClose} aria-label="Close homelab console">×</button>
      </header>
      <div className="homelab-link-state">
        <i className={`homelab-status-dot ${connected ? "online" : linkState === "offline" ? "offline" : ""}`} />
        <strong>{linkState === "loading" ? "CONNECTING" : linkState === "online" ? "PRIVATE LINK ONLINE" : linkState === "offline" ? "SERVER UNREACHABLE" : "NOT CONNECTED"}</strong>
        {connected && <button onClick={() => controller.refresh().catch(() => undefined)} aria-label="Refresh server status">↻</button>}
        {connected && <button onClick={controller.disconnect}>DISCONNECT</button>}
      </div>

      {!connected && (
        <form className="homelab-connect-form" onSubmit={submit}>
          <p>Connect this device to Tailscale, then enter the server's private HTTPS address. A token is optional when the server trusts your Tailscale sign-in.</p>
          <label>TAILSCALE HTTPS ADDRESS<input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://your-server.your-tailnet.ts.net" autoComplete="url" /></label>
          <label>SERVER ACCESS TOKEN · OPTIONAL<div className="token-input-row"><input value={token} onChange={(event) => { setToken(event.target.value); setCopied(false); }} placeholder="Leave blank for Tailscale sign-in" type={showToken ? "text" : "password"} autoComplete="off" /><button type="button" onClick={() => { setToken(makeServerToken()); setCopied(false); }}>GENERATE</button><button type="button" onClick={() => setShowToken((visible) => !visible)}>{showToken ? "HIDE" : "SHOW"}</button><button type="button" disabled={!token} onClick={() => { void copyToken(); }}>{copied ? "COPIED" : "COPY"}</button></div></label>
          <button className="homelab-connect-button" disabled={saving || !controller.ready}>{saving ? "VERIFYING PRIVATE LINK…" : "CONNECT TO SERVER"}</button>
          <small>When a token is used, it stays in this browser session and is sent directly to your server over Tailscale HTTPS.</small>
          <small>For token mode, configure the same 32+ character token in the server's private environment settings. Tailscale identity mode needs no browser token.</small>
          {(formError || controller.error) && <div className="homelab-error" role="alert">{formError || controller.error}</div>}
        </form>
      )}

      {connected && snapshot && (
        <div className="homelab-content">
          <section className="homelab-metrics" aria-label="Server health metrics">
            <Metric label="CPU" value={`${snapshot.server.cpu_percent}%`} percent={snapshot.server.cpu_percent} />
            <Metric label="MEMORY" value={`${snapshot.server.memory.percent}%`} percent={snapshot.server.memory.percent} />
            <Metric label="FILESYSTEM" value={`${snapshot.server.filesystem.percent}%`} percent={snapshot.server.filesystem.percent} />
            <Metric label="UPTIME" value={formatUptime(snapshot.server.uptime_seconds)} />
          </section>

          <section className="homelab-section"><header><h3>CONTAINERS</h3><span>{snapshot.services.length} DETECTED</span></header>
            {snapshot.services.length ? snapshot.services.map((service) => (
              <article className="homelab-row" key={service.id}>
                <i className={`homelab-state-mark ${service.state === "running" ? "online" : "offline"}`} />
                <div className="homelab-row-copy"><strong>{service.label}</strong><small>{service.status || service.state}</small></div>
                {service.controls_allowed && <div className="homelab-service-actions">
                  {service.state === "running"
                    ? <><button onClick={() => void controlService(service, "restart")} title={`Restart ${service.label}`}>RESTART</button><button onClick={() => void controlService(service, "stop")} title={`Stop ${service.label}`}>STOP</button></>
                    : <button onClick={() => void controlService(service, "start")} title={`Start ${service.label}`}>START</button>}
                </div>}
              </article>
            )) : <p className="homelab-muted">No containers were found.</p>}
          </section>

          <section className="homelab-section"><header><h3>WEBSITE WATCH</h3><span>{snapshot.sites.length} MONITORED</span></header>
            {snapshot.sites.length ? snapshot.sites.map((site) => (
              <article className="homelab-row" key={site.id}>
                <i className={`homelab-state-mark ${site.status === "online" ? "online" : "offline"}`} />
                <div className="homelab-row-copy"><strong>{site.name}</strong><small>{site.http_status ? `HTTP ${site.http_status} · ${site.latency_ms} ms` : "No response"}</small></div>
                <span className={`homelab-status-word ${site.status}`}>{site.status.toUpperCase()}</span>
              </article>
            )) : <p className="homelab-muted">Add site checks in the Portainer stack settings.</p>}
          </section>

          <section className="homelab-section"><header><h3>DOWNLOAD QUEUE</h3><span>{snapshot.downloads.configured ? `${snapshot.downloads.items.length} ITEMS` : "QBITTORRENT OPTIONAL"}</span></header>
            {snapshot.downloads.error && <p className="homelab-muted">{snapshot.downloads.error}</p>}
            {snapshot.downloads.configured && snapshot.downloads.items.slice(0, 8).map((download) => (
              <article className="homelab-download" key={download.hash}>
                <div className="homelab-download-top"><strong title={download.name}>{download.name}</strong><span>{download.progress}%</span></div>
                <div className="download-progress"><i style={{ width: `${Math.max(0, Math.min(100, download.progress))}%` }} /></div>
                <div className="homelab-download-bottom"><small>{formatSpeed(download.download_speed)} · {download.state.replace(/([A-Z])/g, " $1").toLowerCase()}</small><button onClick={() => void controlDownload(download)}>{download.paused ? "RESUME" : "PAUSE"}</button></div>
              </article>
            ))}
            {!snapshot.downloads.configured && <p className="homelab-muted">qBittorrent connection details are optional and stay on the server.</p>}
          </section>
          {(formError || controller.error) && <div className="homelab-error" role="alert">{formError || controller.error}</div>}
          <footer className="homelab-foot">UPDATED {new Date(snapshot.checked_at).toLocaleTimeString()}</footer>
        </div>
      )}
    </aside>
  );
}

function Metric({ label, value, percent }: { label: string; value: string; percent?: number }) {
  return <div className="homelab-metric"><span>{label}</span><strong>{value}</strong>{percent !== undefined && <i><b style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></i>}</div>;
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
}

function formatSpeed(bytes: number) {
  if (!bytes) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** exponent).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
}
