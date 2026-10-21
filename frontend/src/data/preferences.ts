import type { SourceName } from "./dataSource.ts";

const SOURCE_KEY = "arasaka.dataSource";
const LATENCY_KEY = "arasaka.simulatedLatency";
const LATENCY_RANGE_KEY = "arasaka.simulatedLatencyRange";

export const LATENCY_RANGES = ["30-40", "100-150", "300-400"] as const;

export type LatencyRange = (typeof LATENCY_RANGES)[number];

export const savedSource = (): SourceName => (localStorage.getItem(SOURCE_KEY) === "indexeddb" ? "indexeddb" : "server");

export const saveSource = (source: SourceName) => localStorage.setItem(SOURCE_KEY, source);

export const savedSimulatedLatency = () => localStorage.getItem(LATENCY_KEY) !== "off";

export const saveSimulatedLatency = (enabled: boolean) => localStorage.setItem(LATENCY_KEY, enabled ? "on" : "off");

export const savedLatencyRange = (): LatencyRange =>
  LATENCY_RANGES.find((range) => range === localStorage.getItem(LATENCY_RANGE_KEY)) ?? LATENCY_RANGES[0];

export const saveLatencyRange = (range: LatencyRange) => localStorage.setItem(LATENCY_RANGE_KEY, range);
