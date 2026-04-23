import hikesLocal from "../data/hikes.json";
import gpxDataLocal from "../data/gpx-data.json";
import type { GpxData, Hike, ParsedHike, Snapshot } from "../types/hikes";

type D1ResultSet<T> = {
  results?: T[];
};

type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  all: <T>() => Promise<D1ResultSet<T>>;
};

type D1DatabaseLike = {
  prepare: (query: string) => D1Statement;
};

type CloudflareEnvLike = {
  HIKES_DB?: D1DatabaseLike;
  PUBLIC_ASSETS_BASE_URL?: string;
};

type HikeRow = {
  id: string;
  name: string;
  alltrails_url: string | null;
  location: string;
  date: string;
  distance: string;
  elevation_gain: string;
  high_point: string;
  difficulty: string;
  gpx_path: string;
  trail_json: string;
  elevation_ft_json: string;
  raw_points_json: string;
  bounds_json: string;
  elevation_min: number | string;
  elevation_max: number | string;
};

type SnapshotRow = {
  hike_id: string;
  at: number | string;
  src_path: string;
  caption: string;
  elevation: string;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ensureLeadingSlash(value: string): string {
  return value.startsWith("/") ? value : `/${value}`;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveAssetPath(pathValue: string, publicBaseUrl?: string): string {
  if (!pathValue) return pathValue;
  if (pathValue.startsWith("http://") || pathValue.startsWith("https://")) return pathValue;
  if (!publicBaseUrl) return ensureLeadingSlash(pathValue);
  const cleanBase = trimTrailingSlash(publicBaseUrl);
  const cleanPath = pathValue.replace(/^\/+/, "");
  return `${cleanBase}/${cleanPath}`;
}

function parseJson<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function normalizeSnapshots(input: Snapshot[]): Snapshot[] {
  return input
    .map((snapshot) => ({
      at: toNumber(snapshot.at, 0),
      src: snapshot.src,
      caption: snapshot.caption,
      elevation: snapshot.elevation,
    }))
    .sort((a, b) => a.at - b.at);
}

function fallbackParsedHikes(): ParsedHike[] {
  const localHikes = hikesLocal as Hike[];
  const gpxById = gpxDataLocal as unknown as Record<string, GpxData>;

  return localHikes.map((hike) => ({
    ...hike,
    gpxData: gpxById[hike.id] ?? {
      trail: [],
      elevationFt: [],
      rawPoints: [],
      bounds: { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 },
      elevationMin: 0,
      elevationMax: 0,
    },
  }));
}

async function getCloudflareEnv(): Promise<CloudflareEnvLike | null> {
  if (process.env.USE_D1_HIKES !== "1") return null;

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    return (context?.env as CloudflareEnvLike) ?? null;
  } catch {
    return null;
  }
}

async function loadFromD1(): Promise<ParsedHike[] | null> {
  const env = await getCloudflareEnv();
  const db = env?.HIKES_DB;
  if (!db) return null;

  const hikesQuery = `
    SELECT
      id,
      name,
      alltrails_url,
      location,
      date,
      distance,
      elevation_gain,
      high_point,
      difficulty,
      gpx_path,
      trail_json,
      elevation_ft_json,
      raw_points_json,
      bounds_json,
      elevation_min,
      elevation_max
    FROM hikes
    WHERE published = 1
    ORDER BY sort_order ASC, name ASC
  `;

  const snapshotsQuery = `
    SELECT
      s.hike_id,
      s.at,
      s.src_path,
      s.caption,
      s.elevation
    FROM snapshots s
    JOIN hikes h ON h.id = s.hike_id
    WHERE h.published = 1
    ORDER BY h.sort_order ASC, s.sort_order ASC, s.id ASC
  `;

  const hikeRows = (await db.prepare(hikesQuery).all<HikeRow>()).results ?? [];
  if (!hikeRows.length) return [];

  const snapshotRows = (await db.prepare(snapshotsQuery).all<SnapshotRow>()).results ?? [];
  const snapshotsByHike = new Map<string, Snapshot[]>();

  for (const row of snapshotRows) {
    const list = snapshotsByHike.get(row.hike_id) ?? [];
    list.push({
      at: toNumber(row.at, 0),
      src: resolveAssetPath(row.src_path, env?.PUBLIC_ASSETS_BASE_URL),
      caption: row.caption,
      elevation: row.elevation,
    });
    snapshotsByHike.set(row.hike_id, list);
  }

  return hikeRows.map((row) => {
    const snapshots = normalizeSnapshots(snapshotsByHike.get(row.id) ?? []);

    return {
      id: row.id,
      name: row.name,
      alltrails_url: row.alltrails_url ?? undefined,
      location: row.location,
      date: row.date,
      distance: row.distance,
      elevation_gain: row.elevation_gain,
      high_point: row.high_point,
      difficulty: row.difficulty,
      gpx: resolveAssetPath(row.gpx_path, env?.PUBLIC_ASSETS_BASE_URL),
      snapshots,
      gpxData: {
        trail: parseJson<[number, number][]>(row.trail_json, []),
        elevationFt: parseJson<number[]>(row.elevation_ft_json, []),
        rawPoints: parseJson<Array<{ lat: number; lon: number; ele: number }>>(row.raw_points_json, []),
        bounds: parseJson<{ minLat: number; maxLat: number; minLon: number; maxLon: number }>(row.bounds_json, {
          minLat: 0,
          maxLat: 0,
          minLon: 0,
          maxLon: 0,
        }),
        elevationMin: toNumber(row.elevation_min, 0),
        elevationMax: toNumber(row.elevation_max, 0),
      },
    };
  });
}

export async function getParsedHikes(): Promise<ParsedHike[]> {
  const dbHikes = await loadFromD1();
  if (dbHikes && dbHikes.length) return dbHikes;
  return fallbackParsedHikes();
}
