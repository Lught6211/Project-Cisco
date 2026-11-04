"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraDevice = { id: string; label: string };

/** Live camera and screen-share streams that become blocks on the dashboard. */
export function useMedia() {
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState("");
  const cameraRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((device) => device.kind === "videoinput").map((device, index) => ({ id: device.deviceId, label: device.label || `CAMERA ${index + 1}` })));
    } catch { /* leave the list as it was */ }
  }, []);

  const stopCamera = useCallback(() => {
    cameraRef.current?.getTracks().forEach((track) => track.stop());
    cameraRef.current = null;
    setCamera(null);
  }, []);

  const startCamera = useCallback(async (id?: string): Promise<MediaStream | null> => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("CAMERA UNAVAILABLE - NEEDS HTTPS OR LOCALHOST");
      return null;
    }
    try {
      cameraRef.current?.getTracks().forEach((track) => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: id ? { deviceId: { exact: id } } : true, audio: false });
      cameraRef.current = stream;
      setCamera(stream);
      await refreshDevices();
      return stream;
    } catch (cause) {
      const denied = cause instanceof DOMException && cause.name === "NotAllowedError";
      setError(denied ? "CAMERA BLOCKED - ALLOW ACCESS" : "NO CAMERA FOUND");
      cameraRef.current = null;
      setCamera(null);
      return null;
    }
  }, [refreshDevices]);

  const stopScreen = useCallback(() => {
    screenRef.current?.getTracks().forEach((track) => track.stop());
    screenRef.current = null;
    setScreen(null);
  }, []);

  const startScreen = useCallback(async (): Promise<MediaStream | null> => {
    setError("");
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("SCREEN SHARE NOT SUPPORTED HERE");
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      stream.getVideoTracks()[0]?.addEventListener("ended", () => { screenRef.current = null; setScreen(null); });
      screenRef.current = stream;
      setScreen(stream);
      return stream;
    } catch {
      setError("SCREEN SHARE CANCELLED");
      return null;
    }
  }, []);

  const chooseDevice = useCallback((id: string) => {
    setDeviceId(id);
    if (cameraRef.current) void startCamera(id || undefined);
  }, [startCamera]);

  useEffect(() => {
    void refreshDevices();
    return () => {
      cameraRef.current?.getTracks().forEach((track) => track.stop());
      screenRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [refreshDevices]);

  return { camera, screen, devices, deviceId, error, startCamera: () => startCamera(deviceId || undefined), stopCamera, startScreen, stopScreen, chooseDevice, liveCamera: () => cameraRef.current, liveScreen: () => screenRef.current };
}
