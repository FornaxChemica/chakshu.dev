import { NextRequest, NextResponse } from "next/server";

import { auth } from "../../../../../../lib/auth";
import {
  formatFeet,
  formatMiles,
  parseGpxForIngest,
} from "../../../../../../lib/gpx-ingest";

export const runtime = "nodejs";

type D1ResultSet<T> = {
  results?: T[];
};

type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  run: () => Promise<unknown>;
  all: <T>() => Promise<D1ResultSet<T>>;
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

type HikeRow = {
  id: string;
  sort_order: number | string;
  published: number | string;
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

function isAllowedAdmin(email: string | null): boolean {
  if (!email) return false;
  const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.length === 0 || allowlist.includes(email);
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

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth.api.getSession({ headers: request.headers });
  const email = session?.user?.email?.toLowerCase() ?? null;
  if (!isAllowedAdmin(email)) {
    return NextResponse.json({ error: "Unauthorized admin account." }, { status: 401 });
  }

  const { id: hikeId } = await context.params;
  if (!hikeId?.trim()) {
    return NextResponse.json({ error: "Missing hike id." }, { status: 400 });
  }

  const env = await getCloudflareEnv();
  const db = env?.HIKES_DB;
  if (!db) {
    return NextResponse.json({ error: "Missing D1 binding: HIKES_DB" }, { status: 500 });
  }

  const existingRows =
    (
      await db
        .prepare(
          `
          SELECT
            id, sort_order, published, name, alltrails_url, location, date, distance,
            elevation_gain, high_point, difficulty, gpx_path, trail_json, elevation_ft_json,
            raw_points_json, bounds_json, elevation_min, elevation_max
          FROM hikes
          WHERE id = ?
          `
        )
        .bind(hikeId)
        .all<HikeRow>()
    ).results ?? [];

  const existing = existingRows[0];
  if (!existing) {
    return NextResponse.json({ error: `Hike not found: ${hikeId}` }, { status: 404 });
  }

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim() || existing.name;
  const location = String(formData.get("location") ?? "").trim() || existing.location;
  const date = String(formData.get("date") ?? "").trim() || existing.date;
  const difficulty = String(formData.get("difficulty") ?? "").trim() || existing.difficulty;
  const alltrailsUrlRaw = String(formData.get("alltrails_url") ?? "").trim();
  const distanceRaw = String(formData.get("distance") ?? "").trim();
  const elevationGainRaw = String(formData.get("elevation_gain") ?? "").trim();
  const highPointRaw = String(formData.get("high_point") ?? "").trim();
  const sortOrderRaw = String(formData.get("sort_order") ?? "").trim();
  const publishedRaw = String(formData.get("published") ?? "").trim();
  const gpxInput = formData.get("gpx");

  const alltrailsUrl =
    formData.has("alltrails_url")
      ? alltrailsUrlRaw || null
      : existing.alltrails_url;
  const sortOrder = Number.isFinite(Number(sortOrderRaw))
    ? Number(sortOrderRaw)
    : Number(existing.sort_order) || 0;
  const published = publishedRaw
    ? publishedRaw === "1" || publishedRaw.toLowerCase() === "true"
    : Number(existing.published) === 1;

  let gpxPath = existing.gpx_path;
  let trailJson = existing.trail_json;
  let elevationFtJson = existing.elevation_ft_json;
  let rawPointsJson = existing.raw_points_json;
  let boundsJson = existing.bounds_json;
  let elevationMin = Number(existing.elevation_min) || 0;
  let elevationMax = Number(existing.elevation_max) || 0;
  let distance = distanceRaw || existing.distance;
  let elevationGain = elevationGainRaw || existing.elevation_gain;
  let highPoint = highPointRaw || existing.high_point;
  let gpxReplaced = false;

  if (gpxInput instanceof File && gpxInput.size > 0) {
    const bucket = env?.HIKES_ASSETS;
    if (!bucket) {
      return NextResponse.json({ error: "Missing R2 binding: HIKES_ASSETS" }, { status: 500 });
    }

    const gpxText = await gpxInput.text();
    const { gpxData, stats } = parseGpxForIngest(gpxText);
    if (!gpxData.rawPoints.length) {
      return NextResponse.json({ error: "GPX has no track points" }, { status: 400 });
    }

    gpxPath = `hikes/${hikeId}/${hikeId}.gpx`;
    await bucket.put(gpxPath, gpxText, {
      httpMetadata: { contentType: "application/gpx+xml" },
    });

    trailJson = JSON.stringify(gpxData.trail);
    elevationFtJson = JSON.stringify(gpxData.elevationFt);
    rawPointsJson = JSON.stringify(gpxData.rawPoints);
    boundsJson = JSON.stringify(gpxData.bounds);
    elevationMin = gpxData.elevationMin;
    elevationMax = gpxData.elevationMax;

    if (!distanceRaw) distance = formatMiles(stats.distanceMiles);
    if (!elevationGainRaw) elevationGain = formatFeet(stats.elevationGainFeet);
    if (!highPointRaw) highPoint = formatFeet(stats.highPointFeet);
    gpxReplaced = true;
  }

  await db
    .prepare(
      `
      UPDATE hikes SET
        sort_order = ?,
        published = ?,
        name = ?,
        alltrails_url = ?,
        location = ?,
        date = ?,
        distance = ?,
        elevation_gain = ?,
        high_point = ?,
        difficulty = ?,
        gpx_path = ?,
        trail_json = ?,
        elevation_ft_json = ?,
        raw_points_json = ?,
        bounds_json = ?,
        elevation_min = ?,
        elevation_max = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    )
    .bind(
      sortOrder,
      published ? 1 : 0,
      name,
      alltrailsUrl,
      location,
      date,
      distance,
      elevationGain,
      highPoint,
      difficulty,
      gpxPath,
      trailJson,
      elevationFtJson,
      rawPointsJson,
      boundsJson,
      elevationMin,
      elevationMax,
      hikeId
    )
    .run();

  return NextResponse.json({
    message: gpxReplaced
      ? `Updated ${name} (${hikeId}) and replaced GPX. Snapshots unchanged.`
      : `Updated ${name} (${hikeId}) metadata. Snapshots unchanged.`,
    hike: {
      id: hikeId,
      sortOrder,
      published,
      name,
      alltrailsUrl,
      location,
      date,
      distance,
      elevationGain,
      highPoint,
      difficulty,
      gpxPath,
      gpxReplaced,
    },
  });
}
