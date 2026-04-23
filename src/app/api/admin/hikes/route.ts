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
  const photos = formData.getAll("photos").filter((item): item is File => item instanceof File);

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

  const snapshotRows: Array<{
    sortOrder: number;
    at: number;
    srcPath: string;
    caption: string;
    elevation: string;
  }> = [];

  for (let i = 0; i < photos.length; i += 1) {
    const file = photos[i];
    const meta = snapshotMeta.find((entry) => entry.index === i) ?? null;

    const safeName = sanitizeKeyPart(file.name || `photo-${i + 1}.jpg`);
    const photoKey = `hikes/${hikeId}/photos/${Date.now()}-${i + 1}-${safeName}`;
    const bytes = await file.arrayBuffer();
    await bucket.put(photoKey, new Uint8Array(bytes), {
      httpMetadata: {
        contentType: file.type || "application/octet-stream",
      },
    });

    const atProvided = parseFloatOrNull(meta?.at);
    const lat = parseFloatOrNull(meta?.lat);
    const lon = parseFloatOrNull(meta?.lon);
    const inferredFromLatLon =
      lat != null && lon != null
        ? progressFromLatLon(gpxData.rawPoints, lat, lon)
        : null;

    let at = atProvided != null ? clamp01(atProvided) : inferredFromLatLon ?? -1;
    if (at < 0) {
      at = clamp01((i + 1) / (photos.length + 1));
    }

    snapshotRows.push({
      sortOrder: i,
      at,
      srcPath: photoKey,
      caption: meta?.caption?.trim() || file.name.replace(/\.[a-z0-9]+$/i, ""),
      elevation: meta?.elevation?.trim() || "",
    });
  }

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
    message: `Published ${name} (${hikeId}) with ${snapshotRows.length} photo(s).`,
    hikeId,
    gpxKey,
    photosUploaded: snapshotRows.length,
  });
}
