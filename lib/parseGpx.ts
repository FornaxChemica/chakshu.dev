import { promises as fs } from "node:fs";
import path from "node:path";

import type { GpxData } from "../types/hikes";

const FEET_PER_METER = 3.28084;
const EPSILON = 1e-9;

type RawPoint = { lat: number; lon: number; ele: number };

type Bounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

const emptyData: GpxData = {
  trail: [],
  elevationFt: [],
  rawPoints: [],
  bounds: { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 },
  elevationMin: 0,
  elevationMax: 0,
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function downsampleByCount<T>(items: T[], targetCount: number): T[] {
  if (items.length <= targetCount) {
    return items.slice();
  }

  if (targetCount <= 1) {
    return [items[0]];
  }

  const sampled: T[] = [];
  const lastIndex = items.length - 1;
  const step = lastIndex / (targetCount - 1);

  for (let i = 0; i < targetCount; i += 1) {
    const index = Math.round(i * step);
    sampled.push(items[Math.min(index, lastIndex)]);
  }

  return sampled;
}

function toFeet(meters: number): number {
  return meters * FEET_PER_METER;
}

function parseTrackPoints(xml: string): RawPoint[] {
  const points: RawPoint[] = [];
  const trkptRegex = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi;

  let trkptMatch: RegExpExecArray | null = trkptRegex.exec(xml);
  while (trkptMatch) {
    const attrs = trkptMatch[1];
    const body = trkptMatch[2] ?? "";

    const latMatch = /lat\s*=\s*"([^"]+)"/i.exec(attrs);
    const lonMatch = /lon\s*=\s*"([^"]+)"/i.exec(attrs);

    if (latMatch && lonMatch) {
      const lat = Number.parseFloat(latMatch[1]);
      const lon = Number.parseFloat(lonMatch[1]);

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const eleMatch = /<ele>([^<]+)<\/ele>/i.exec(body);
        const eleValue = eleMatch ? Number.parseFloat(eleMatch[1]) : 0;
        const ele = Number.isFinite(eleValue) ? eleValue : 0;

        points.push({ lat, lon, ele });
      }
    }

    trkptMatch = trkptRegex.exec(xml);
  }

  return points;
}

function getBounds(points: RawPoint[]): Bounds {
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (point.lat < minLat) minLat = point.lat;
    if (point.lat > maxLat) maxLat = point.lat;
    if (point.lon < minLon) minLon = point.lon;
    if (point.lon > maxLon) maxLon = point.lon;
  }

  if (!Number.isFinite(minLat) || !Number.isFinite(maxLat) || !Number.isFinite(minLon) || !Number.isFinite(maxLon)) {
    return { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };
  }

  return { minLat, maxLat, minLon, maxLon };
}

function buildNormalizedTrail(points: RawPoint[], bounds: Bounds): [number, number][] {
  const lonSpan = Math.max(bounds.maxLon - bounds.minLon, EPSILON);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, EPSILON);

  const normalized = points.map((point) => {
    const x = (point.lon - bounds.minLon) / lonSpan;
    const y = 1 - (point.lat - bounds.minLat) / latSpan;
    return [clamp01(x), clamp01(y)] as [number, number];
  });

  return downsampleByCount(normalized, 150);
}

function buildElevation(points: RawPoint[]): { values: number[]; min: number; max: number } {
  if (points.length === 0) {
    return { values: [], min: 0, max: 0 };
  }

  const sampled = downsampleByCount(points, 80);
  const values = sampled.map((point) => Math.round(toFeet(point.ele)));

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { values, min: 0, max: 0 };
  }

  return { values, min, max };
}

export async function parseGpx(filePath: string): Promise<GpxData> {
  try {
    const cleanRelative = filePath.replace(/^\/+/, "");
    const absolutePath = path.join(process.cwd(), "public", cleanRelative);
    const xml = await fs.readFile(absolutePath, "utf8");

    const rawPoints = parseTrackPoints(xml);
    if (rawPoints.length === 0) {
      return emptyData;
    }

    const bounds = getBounds(rawPoints);
    const trail = buildNormalizedTrail(rawPoints, bounds);
    const elevation = buildElevation(rawPoints);

    return {
      trail,
      elevationFt: elevation.values,
      rawPoints,
      bounds,
      elevationMin: elevation.min,
      elevationMax: elevation.max,
    };
  } catch {
    return emptyData;
  }
}
