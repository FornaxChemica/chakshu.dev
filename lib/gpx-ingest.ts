import type { GpxData } from "../types/hikes";

const FEET_PER_METER = 3.28084;
const EARTH_RADIUS_METERS = 6371000;
const EPSILON = 1e-9;

type RawPoint = { lat: number; lon: number; ele: number };

type Bounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

type HikeStats = {
  distanceMiles: number;
  elevationGainFeet: number;
  highPointFeet: number;
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function downsampleByCount<T>(items: T[], targetCount: number): T[] {
  if (items.length <= targetCount) return items.slice();
  if (targetCount <= 1) return [items[0]];

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

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineMeters(a: RawPoint, b: RawPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
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
        points.push({
          lat,
          lon,
          ele: Number.isFinite(eleValue) ? eleValue : 0,
        });
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
  if (!points.length) return { values: [], min: 0, max: 0 };

  const sampled = downsampleByCount(points, 80);
  const values = sampled.map((point) => Math.round(toFeet(point.ele)));
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    values,
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 0,
  };
}

function buildStats(points: RawPoint[]): HikeStats {
  if (points.length < 2) {
    return { distanceMiles: 0, elevationGainFeet: 0, highPointFeet: 0 };
  }

  let totalMeters = 0;
  let gainMeters = 0;
  let highMeters = Number.NEGATIVE_INFINITY;

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const current = points[i];
    totalMeters += haversineMeters(prev, current);
    const delta = current.ele - prev.ele;
    if (delta > 0) gainMeters += delta;
  }

  for (const point of points) {
    if (point.ele > highMeters) highMeters = point.ele;
  }

  return {
    distanceMiles: totalMeters / 1609.344,
    elevationGainFeet: toFeet(gainMeters),
    highPointFeet: Number.isFinite(highMeters) ? toFeet(highMeters) : 0,
  };
}

function projectMeters(lat: number, lon: number, lat0: number): { x: number; y: number } {
  const metersPerDegLat = 111132;
  const metersPerDegLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return { x: lon * metersPerDegLon, y: lat * metersPerDegLat };
}

function cumulativeMeters(points: RawPoint[]): number[] {
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(cumulative[i - 1] + haversineMeters(points[i - 1], points[i]));
  }
  return cumulative;
}

export function formatMiles(miles: number): string {
  const fixed = miles.toFixed(2);
  const compact = fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return `${compact} mi`;
}

export function formatFeet(feet: number): string {
  return `${Math.round(feet).toLocaleString("en-US")} ft`;
}

export function parseGpxForIngest(xml: string): { gpxData: GpxData; stats: HikeStats } {
  const rawPoints = parseTrackPoints(xml);
  if (!rawPoints.length) {
    return {
      gpxData: {
        trail: [],
        elevationFt: [],
        rawPoints: [],
        bounds: { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 },
        elevationMin: 0,
        elevationMax: 0,
      },
      stats: { distanceMiles: 0, elevationGainFeet: 0, highPointFeet: 0 },
    };
  }

  const bounds = getBounds(rawPoints);
  const trail = buildNormalizedTrail(rawPoints, bounds);
  const elevation = buildElevation(rawPoints);
  const stats = buildStats(rawPoints);

  return {
    gpxData: {
      trail,
      elevationFt: elevation.values,
      rawPoints,
      bounds,
      elevationMin: elevation.min,
      elevationMax: elevation.max,
    },
    stats,
  };
}

export function progressFromLatLon(points: RawPoint[], lat: number, lon: number): number | null {
  if (points.length < 2 || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const cumulative = cumulativeMeters(points);
  const total = cumulative[cumulative.length - 1] || 1;
  let bestDist2 = Number.POSITIVE_INFINITY;
  let bestAlong = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const lat0 = (a.lat + b.lat + lat) / 3;

    const pa = projectMeters(a.lat, a.lon, lat0);
    const pb = projectMeters(b.lat, b.lon, lat0);
    const pp = projectMeters(lat, lon, lat0);

    const abx = pb.x - pa.x;
    const aby = pb.y - pa.y;
    const apx = pp.x - pa.x;
    const apy = pp.y - pa.y;
    const ab2 = abx * abx + aby * aby;
    const rawT = ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2;
    const t = clamp01(rawT);

    const qx = pa.x + t * abx;
    const qy = pa.y + t * aby;
    const dx = pp.x - qx;
    const dy = pp.y - qy;
    const dist2 = dx * dx + dy * dy;
    const segMeters = haversineMeters(a, b);
    const along = cumulative[i] + t * segMeters;

    if (dist2 < bestDist2) {
      bestDist2 = dist2;
      bestAlong = along;
    }
  }

  return clamp01(bestAlong / total);
}
