"use client";

import { createContext } from "react";
import type { HomelabSnapshot } from "../homelab";

export type HudContextValue = {
  streams: Record<string, MediaStream | null>;
  homelab: HomelabSnapshot | null;
  homelabState: "loading" | "unconfigured" | "online" | "offline";
};

export const HudContext = createContext<HudContextValue>({ streams: {}, homelab: null, homelabState: "loading" });
