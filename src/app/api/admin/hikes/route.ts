import { NextRequest, NextResponse } from "next/server";

import {
  getAccessAuthenticatedEmailFromHeaders,
  getAllowedAdminEmails,
  isAdminEmail,
} from "../../../../../lib/admin-auth";
import {
  formatFeet,
  formatMiles,
  parseGpxForIngest,
  progressFromLatLon,
} from "../../../../../lib/gpx-ingest";
import { extractMediaMetadata } from "../../../../../lib/media-metadata";

export const runtime = "nodejs";

type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  run: () => Promise<unknown>;
};

type D1DatabaseLike = {
  prepare: (query: string) => D1Statement;
};

type R2BucketLike = {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    options?: {
      httpMetadata?: {
        contentType?: string;
      };
    }
  ) => Promise<unknown>;
};

type CloudflareEnvLike = {
  HIKES_DB?: D1DatabaseLike;
  HIKES_ASSETS?: R2BucketLike;
};

type SnapshotMetaInput = {
  index: number;
  fileName: string;
  caption?: string;
  elevation?: string;
  at?: string;
  lat?: string;
  lon?: string;
};

type SnapshotDraft = {
  sortOrder: number;
  at: number | null;
  srcPath: string;
  caption: string;
  elevation: string;
  capturedAtMs: number | null;
  placementSource:
    | "manual_at"
    | "manual_latlon"
    | "auto_exif_gps"
    | "auto_video_gps"
    | "timestamp_interpolation"
    | "neighbor_interpolation"
    | "even_distribution";
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function sanitizeKeyPart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseFloatOrNull(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function getDefaultDateISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function resolveMissingSnapshotPositions(drafts: SnapshotDraft[]): SnapshotDraft[] {
  const output = drafts.map((draft) => ({ ...draft }));

  const timedKnown = output
    .filter((item) => item.at != null && item.capturedAtMs != null)
    .sort((a, b) => (a.capturedAtMs ?? 0) - (b.capturedAtMs ?? 0));

  for (const item of output) {
    if (item.at != null || item.capturedAtMs == null || timedKnown.length === 0) continue;
    const t = item.capturedAtMs;
    const prev = [...timedKnown].reverse().find((known) => (known.capturedAtMs ?? 0) <= t);
    const next = timedKnown.find((known) => (known.capturedAtMs ?? 0) >= t);

    if (prev && next && prev !== next && prev.at != null && next.at != null && (next.capturedAtMs ?? 0) > (prev.capturedAtMs ?? 0)) {
      const ratio = ((t ?? 0) - (prev.capturedAtMs ?? 0)) / ((next.capturedAtMs ?? 0) - (prev.capturedAtMs ?? 0));
      item.at = clamp01(prev.at + (next.at - prev.at) * ratio);
      item.placementSource = "timestamp_interpolation";
      continue;
    }
    if (prev?.at != null) {
      item.at = clamp01(prev.at);
      item.placementSource = "timestamp_interpolation";
      continue;
    }
    if (next?.at != null) {
      item.at = clamp01(next.at);
      item.placementSource = "timestamp_interpolation";
    }
  }

  for (let i = 0; i < output.length; i += 1) {
    if (output[i].at != null) continue;

    let prevIndex = -1;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (output[j].at != null) {
        prevIndex = j;
        break;
      }
    }
    let nextIndex = -1;
    for (let j = i + 1; j < output.length; j += 1) {
      if (output[j].at != null) {
        nextIndex = j;
        break;
      }
    }

    if (prevIndex >= 0 && nextIndex >= 0 && output[prevIndex].at != null && output[nextIndex].at != null) {
      const span = nextIndex - prevIndex;
      const ratio = (i - prevIndex) / span;
      output[i].at = clamp01((output[prevIndex].at as number) + ((output[nextIndex].at as number) - (output[prevIndex].at as number)) * ratio);
      output[i].placementSource = "neighbor_interpolation";
      continue;
    }

    if (prevIndex >= 0 && output[prevIndex].at != null) {
      output[i].at = clamp01(output[prevIndex].at as number);
      output[i].placementSource = "neighbor_interpolation";
      continue;
    }

    if (nextIndex >= 0 && output[nextIndex].at != null) {
      output[i].at = clamp01(output[nextIndex].at as number);
      output[i].placementSource = "neighbor_interpolation";
    }
  }

  const remaining = output.filter((item) => item.at == null);
  if (remaining.length > 0) {
    for (let i = 0; i < output.length; i += 1) {
      if (output[i].at != null) continue;
      output[i].at = clamp01((i + 1) / (output.length + 1));
      output[i].placementSource = "even_distribution";
    }
  }

  return output;
}

function spreadDuplicatePositions(drafts: SnapshotDraft[]): SnapshotDraft[] {
  const output = drafts.map((draft) => ({ ...draft }));
  const groups = new Map<number, SnapshotDraft[]>();

  for (const item of output) {
    const at = item.at ?? 0;
    const key = Math.round(at * 1000);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const anchor = clamp01(group[0].at ?? 0);
    const step = 0.003;
    const center = (group.length - 1) / 2;

    for (let i = 0; i < group.length; i += 1) {
      const shifted = anchor + (i - center) * step;
      group[i].at = clamp01(shifted);
    }
  }

  return output;
}

async function getCloudflareEnv(): Promise<CloudflareEnvLike | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    return (context?.env as CloudflareEnvLike) ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const email = getAccessAuthenticatedEmailFromHeaders(request.headers);
  if (!isAdminEmail(email)) {
    return NextResponse.json(
      {
        error: `Unauthorized. Allowed: ${getAllowedAdminEmails().join(", ")}`,
      },
      { status: 401 }
    );
  }

  const env = await getCloudflareEnv();
  const db = env?.HIKES_DB;
  const bucket = env?.HIKES_ASSETS;

  if (!db) {
    return NextResponse.json(
      { error: "Missing D1 binding: HIKES_DB" },
      { status: 500 }
    );
  }

  if (!bucket) {
    return NextResponse.json(
      { error: "Missing R2 binding: HIKES_ASSETS" },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim() || "TBD";
  const date = String(formData.get("date") ?? "").trim() || getDefaultDateISO();
  const difficulty = String(formData.get("difficulty") ?? "").trim() || "Moderate";
  const alltrailsUrlRaw = String(formData.get("alltrails_url") ?? "").trim();
  const distanceRaw = String(formData.get("distance") ?? "").trim();
  const elevationGainRaw = String(formData.get("elevation_gain") ?? "").trim();
  const highPointRaw = String(formData.get("high_point") ?? "").trim();
  const sortOrderRaw = String(formData.get("sort_order") ?? "0").trim();
  const requestedId = String(formData.get("id") ?? "").trim();
  const gpxInput = formData.get("gpx");
  const mediaFiles = formData.getAll("photos").filter((item): item is File => item instanceof File);

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!(gpxInput instanceof File)) {
    return NextResponse.json({ error: "gpx file is required" }, { status: 400 });
  }

  const hikeId = slugify(requestedId || name);
  if (!hikeId) {
    return NextResponse.json({ error: "unable to resolve hike id" }, { status: 400 });
  }

  let snapshotMeta: SnapshotMetaInput[] = [];
  const snapshotMetaRaw = String(formData.get("snapshot_meta") ?? "").trim();
  if (snapshotMetaRaw) {
    try {
      const parsed = JSON.parse(snapshotMetaRaw) as SnapshotMetaInput[];
      if (Array.isArray(parsed)) snapshotMeta = parsed;
    } catch {
      return NextResponse.json({ error: "snapshot_meta must be valid JSON array" }, { status: 400 });
    }
  }

  const gpxText = await gpxInput.text();
  const { gpxData, stats } = parseGpxForIngest(gpxText);
  if (!gpxData.rawPoints.length) {
    return NextResponse.json({ error: "GPX has no track points" }, { status: 400 });
  }

  const gpxKey = `hikes/${hikeId}/${hikeId}.gpx`;
  await bucket.put(gpxKey, gpxText, {
    httpMetadata: { contentType: "application/gpx+xml" },
  });

  const snapshotDrafts: SnapshotDraft[] = [];

  for (let i = 0; i < mediaFiles.length; i += 1) {
    const file = mediaFiles[i];
    const meta = snapshotMeta.find((entry) => entry.index === i) ?? null;

    const safeName = sanitizeKeyPart(file.name || `media-${i + 1}`);
    const mediaKey = `hikes/${hikeId}/photos/${Date.now()}-${i + 1}-${safeName}`;
    const bytes = await file.arrayBuffer();
    const mediaBytes = new Uint8Array(bytes);
    await bucket.put(mediaKey, mediaBytes, {
      httpMetadata: {
        contentType: file.type || "application/octet-stream",
      },
    });

    const atProvided = parseFloatOrNull(meta?.at);
    const latManual = parseFloatOrNull(meta?.lat);
    const lonManual = parseFloatOrNull(meta?.lon);
    const inferredFromManualLatLon =
      latManual != null && lonManual != null
        ? progressFromLatLon(gpxData.rawPoints, latManual, lonManual)
        : null;

    const metadata = extractMediaMetadata(file.name, file.type, mediaBytes);
    const inferredFromMetadataGps =
      metadata.lat != null && metadata.lon != null
        ? progressFromLatLon(gpxData.rawPoints, metadata.lat, metadata.lon)
        : null;

    let at: number | null = null;
    let placementSource: SnapshotDraft["placementSource"] = "even_distribution";

    if (atProvided != null) {
      at = clamp01(atProvided);
      placementSource = "manual_at";
    } else if (inferredFromManualLatLon != null) {
      at = clamp01(inferredFromManualLatLon);
      placementSource = "manual_latlon";
    } else if (inferredFromMetadataGps != null) {
      at = clamp01(inferredFromMetadataGps);
      placementSource = metadata.source === "quicktime_iso6709" ? "auto_video_gps" : "auto_exif_gps";
    }

    snapshotDrafts.push({
      sortOrder: i,
      at,
      srcPath: mediaKey,
      caption: meta?.caption?.trim() || file.name.replace(/\.[a-z0-9]+$/i, ""),
      elevation: meta?.elevation?.trim() || "",
      capturedAtMs: metadata.capturedAtMs,
      placementSource,
    });
  }

  const positioned = spreadDuplicatePositions(resolveMissingSnapshotPositions(snapshotDrafts));
  const snapshotRows = positioned.map((row) => ({
    sortOrder: row.sortOrder,
    at: clamp01(row.at ?? 0),
    srcPath: row.srcPath,
    caption: row.caption,
    elevation: row.elevation,
    placementSource: row.placementSource,
  }));

  const distance = distanceRaw || formatMiles(stats.distanceMiles);
  const elevationGain = elevationGainRaw || formatFeet(stats.elevationGainFeet);
  const highPoint = highPointRaw || formatFeet(stats.highPointFeet);
  const alltrailsUrl = alltrailsUrlRaw || null;
  const sortOrder = Number.isFinite(Number(sortOrderRaw)) ? Number(sortOrderRaw) : 0;

  await db
    .prepare(
      `
      INSERT INTO hikes (
        id, sort_order, published, name, alltrails_url, location, date, distance, elevation_gain, high_point, difficulty,
        gpx_path, trail_json, elevation_ft_json, raw_points_json, bounds_json, elevation_min, elevation_max, updated_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        sort_order = excluded.sort_order,
        published = excluded.published,
        name = excluded.name,
        alltrails_url = excluded.alltrails_url,
        location = excluded.location,
        date = excluded.date,
        distance = excluded.distance,
        elevation_gain = excluded.elevation_gain,
        high_point = excluded.high_point,
        difficulty = excluded.difficulty,
        gpx_path = excluded.gpx_path,
        trail_json = excluded.trail_json,
        elevation_ft_json = excluded.elevation_ft_json,
        raw_points_json = excluded.raw_points_json,
        bounds_json = excluded.bounds_json,
        elevation_min = excluded.elevation_min,
        elevation_max = excluded.elevation_max,
        updated_at = CURRENT_TIMESTAMP
      `
    )
    .bind(
      hikeId,
      sortOrder,
      name,
      alltrailsUrl,
      location,
      date,
      distance,
      elevationGain,
      highPoint,
      difficulty,
      gpxKey,
      JSON.stringify(gpxData.trail),
      JSON.stringify(gpxData.elevationFt),
      JSON.stringify(gpxData.rawPoints),
      JSON.stringify(gpxData.bounds),
      gpxData.elevationMin,
      gpxData.elevationMax
    )
    .run();

  await db.prepare("DELETE FROM snapshots WHERE hike_id = ?").bind(hikeId).run();

  for (const snapshot of snapshotRows) {
    await db
      .prepare(
        `
        INSERT INTO snapshots (hike_id, sort_order, at, src_path, caption, elevation)
        VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .bind(
        hikeId,
        snapshot.sortOrder,
        snapshot.at,
        snapshot.srcPath,
        snapshot.caption,
        snapshot.elevation
      )
      .run();
  }

  return NextResponse.json({
    message: `Published ${name} (${hikeId}) with ${snapshotRows.length} media file(s).`,
    hikeId,
    gpxKey,
    mediaUploaded: snapshotRows.length,
    placementBreakdown: snapshotRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.placementSource] = (acc[row.placementSource] ?? 0) + 1;
      return acc;
    }, {}),
  });
}
