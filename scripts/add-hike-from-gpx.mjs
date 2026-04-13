#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hikesPath = path.join(root, "data", "hikes.json");
const hikesPublicDir = path.join(root, "public", "hikes");

function usage() {
  console.log(`Usage:\n  npm run hike:add -- --gpx <file.gpx> [--name "Trail Name"] [--id trail-id] [--location "City, State"] [--date "TBD"] [--difficulty "Moderate"] [--alltrails-url "https://..."] [--prepend]`);
}

function parseArgs(argv) {
  const out = { prepend: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--prepend") {
      out.prepend = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const val = argv[i + 1];
    if (!val || val.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    out[key] = val;
    i += 1;
  }
  return out;
}

function toTitleFromFileName(fileName) {
  return fileName
    .replace(/\.gpx$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseGpx(gpxText) {
  const metaName = gpxText.match(/<metadata>[\s\S]*?<name>([^<]+)<\/name>/i)?.[1]?.trim();
  const trkName = gpxText.match(/<trk>[\s\S]*?<name>([^<]+)<\/name>/i)?.[1]?.trim();

  const points = [];
  const trkptRegex = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi;
  for (const match of gpxText.matchAll(trkptRegex)) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const latMatch = attrs.match(/lat\s*=\s*"([^"]+)"/i);
    const lonMatch = attrs.match(/lon\s*=\s*"([^"]+)"/i);
    if (!latMatch || !lonMatch) continue;

    const eleMatch = body.match(/<ele>([^<]+)<\/ele>/i);
    const lat = Number(latMatch[1]);
    const lon = Number(lonMatch[1]);
    const ele = eleMatch ? Number(eleMatch[1]) : 0;
    if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(ele)) {
      points.push({ lat, lon, ele });
    }
  }

  return { name: metaName || trkName || null, points };
}

function computeStats(points) {
  if (points.length < 2) {
    throw new Error("GPX has insufficient track points.");
  }

  let distMeters = 0;
  let gainMeters = 0;
  let highMeters = Number.NEGATIVE_INFINITY;

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    distMeters += haversineMeters(prev.lat, prev.lon, cur.lat, cur.lon);

    const delta = cur.ele - prev.ele;
    if (delta > 0) gainMeters += delta;
  }

  for (const p of points) {
    if (p.ele > highMeters) highMeters = p.ele;
  }

  return {
    distanceMi: distMeters / 1609.344,
    elevationGainFt: gainMeters * 3.28084,
    highPointFt: highMeters * 3.28084,
  };
}

function formatMiles(miles) {
  const fixed = miles.toFixed(2);
  const compact = fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return `${compact} mi`;
}

function formatFeet(feet) {
  return `${Math.round(feet).toLocaleString("en-US")} ft`;
}

function resolveGpxFile(gpxArg) {
  if (!gpxArg) throw new Error("--gpx is required");

  const fromArg = gpxArg.replace(/^\/+/, "");
  let rel = fromArg;

  if (rel.startsWith("public/")) {
    rel = rel.slice("public/".length);
  }
  if (!rel.startsWith("hikes/")) {
    rel = path.posix.join("hikes", path.basename(rel));
  }

  if (!rel.toLowerCase().endsWith(".gpx")) {
    throw new Error("--gpx must point to a .gpx file");
  }

  const abs = path.join(root, "public", rel);
  if (!fs.existsSync(abs)) {
    throw new Error(`GPX file not found: ${abs}`);
  }

  return { abs, publicPath: `/${rel}` };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.gpx) {
      usage();
      process.exit(1);
    }

    if (!fs.existsSync(hikesPath)) {
      throw new Error("Could not find data/hikes.json");
    }

    const hikes = JSON.parse(fs.readFileSync(hikesPath, "utf8"));
    if (!Array.isArray(hikes)) {
      throw new Error("data/hikes.json must be an array");
    }

    const { abs: gpxAbs, publicPath: gpxPublicPath } = resolveGpxFile(args.gpx);
    const gpxText = fs.readFileSync(gpxAbs, "utf8");
    const parsed = parseGpx(gpxText);
    const fileBase = path.basename(gpxAbs);

    const name = args.name || parsed.name || toTitleFromFileName(fileBase);
    const id = args.id || slugify(name);

    const stats = computeStats(parsed.points);

    const entry = {
      id,
      name,
      ...(args["alltrails-url"] ? { alltrails_url: args["alltrails-url"] } : {}),
      location: args.location || "TBD",
      date: args.date || "TBD",
      distance: formatMiles(stats.distanceMi),
      elevation_gain: formatFeet(stats.elevationGainFt),
      high_point: formatFeet(stats.highPointFt),
      difficulty: args.difficulty || "Moderate",
      gpx: gpxPublicPath,
      snapshots: [],
    };

    const existingById = hikes.find((h) => h.id === id);
    if (existingById) {
      throw new Error(`A hike with id '${id}' already exists.`);
    }

    const existingByGpx = hikes.find((h) => h.gpx === gpxPublicPath);
    if (existingByGpx) {
      throw new Error(`A hike already references GPX '${gpxPublicPath}' (id: ${existingByGpx.id}).`);
    }

    if (args.prepend) {
      hikes.unshift(entry);
    } else {
      hikes.push(entry);
    }

    fs.writeFileSync(hikesPath, `${JSON.stringify(hikes, null, 2)}\n`, "utf8");

    console.log(`Added hike '${name}' to data/hikes.json`);
    console.log(`id: ${id}`);
    console.log(`gpx: ${gpxPublicPath}`);
    console.log(`distance: ${entry.distance}`);
    console.log(`elevation_gain: ${entry.elevation_gain}`);
    console.log(`high_point: ${entry.high_point}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
