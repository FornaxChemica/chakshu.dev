#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hikesPath = path.join(root, "data", "hikes.json");

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

function projectMeters(lat, lon, lat0) {
  const metersPerDegLat = 111132;
  const metersPerDegLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return { x: lon * metersPerDegLon, y: lat * metersPerDegLat };
}

function parseGpxPoints(gpxText) {
  const points = [];
  const trkptRegex = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi;
  for (const match of gpxText.matchAll(trkptRegex)) {
    const attrs = match[1] ?? "";
    const latMatch = attrs.match(/lat\s*=\s*"([^"]+)"/i);
    const lonMatch = attrs.match(/lon\s*=\s*"([^"]+)"/i);
    if (!latMatch || !lonMatch) continue;
    points.push({ lat: Number(latMatch[1]), lon: Number(lonMatch[1]) });
  }
  return points;
}

function getMdlsNumber(attr, filePath) {
  try {
    const out = execFileSync("mdls", ["-raw", "-name", attr, filePath], { encoding: "utf8" }).trim();
    if (!out || out === "(null)") return null;
    const n = Number(out);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function getPhotoLatLon(filePath) {
  const lat = getMdlsNumber("kMDItemLatitude", filePath);
  const lon = getMdlsNumber("kMDItemLongitude", filePath);
  if (lat == null || lon == null) return null;
  return { lat, lon };
}

function computeProgress(points, photoLat, photoLon) {
  if (points.length < 2) return 0;

  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    cumulative.push(cumulative[i - 1] + haversineMeters(prev.lat, prev.lon, cur.lat, cur.lon));
  }

  const total = cumulative[cumulative.length - 1] || 1;

  let best = { dist2: Number.POSITIVE_INFINITY, along: 0 };

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const lat0 = (a.lat + b.lat + photoLat) / 3;

    const pa = projectMeters(a.lat, a.lon, lat0);
    const pb = projectMeters(b.lat, b.lon, lat0);
    const pp = projectMeters(photoLat, photoLon, lat0);

    const abx = pb.x - pa.x;
    const aby = pb.y - pa.y;
    const apx = pp.x - pa.x;
    const apy = pp.y - pa.y;

    const ab2 = abx * abx + aby * aby;
    const rawT = ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2;
    const t = Math.max(0, Math.min(1, rawT));

    const qx = pa.x + t * abx;
    const qy = pa.y + t * aby;
    const dx = pp.x - qx;
    const dy = pp.y - qy;
    const dist2 = dx * dx + dy * dy;

    const segMeters = haversineMeters(a.lat, a.lon, b.lat, b.lon);
    const along = cumulative[i] + t * segMeters;

    if (dist2 < best.dist2) best = { dist2, along };
  }

  const progress = best.along / total;
  return Math.max(0, Math.min(1, progress));
}

function main() {
  if (!fs.existsSync(hikesPath)) {
    console.error("Could not find data/hikes.json");
    process.exit(1);
  }

  const hikes = JSON.parse(fs.readFileSync(hikesPath, "utf8"));
  let updated = 0;

  for (const hike of hikes) {
    const gpxPath = path.join(root, "public", String(hike.gpx || "").replace(/^\//, ""));
    if (!fs.existsSync(gpxPath)) {
      console.warn(`Skipping ${hike.name}: GPX not found at ${gpxPath}`);
      continue;
    }

    const points = parseGpxPoints(fs.readFileSync(gpxPath, "utf8"));
    if (points.length < 2) {
      console.warn(`Skipping ${hike.name}: GPX has insufficient points`);
      continue;
    }

    for (const snapshot of hike.snapshots || []) {
      const photoPath = path.join(root, "public", String(snapshot.src || "").replace(/^\//, ""));
      if (!fs.existsSync(photoPath)) {
        console.warn(`Skipping snapshot ${snapshot.src}: photo file not found`);
        continue;
      }

      const gps = getPhotoLatLon(photoPath);
      if (!gps) {
        console.warn(`Skipping snapshot ${snapshot.src}: no GPS metadata (lat/lon) found`);
        continue;
      }

      const at = computeProgress(points, gps.lat, gps.lon);
      snapshot.at = Number(at.toFixed(3));
      updated += 1;
      console.log(`${hike.name}: ${snapshot.src} -> at=${snapshot.at}`);
    }
  }

  fs.writeFileSync(hikesPath, `${JSON.stringify(hikes, null, 2)}\n`, "utf8");
  console.log(`Updated ${updated} snapshot position(s) in data/hikes.json`);
}

main();
