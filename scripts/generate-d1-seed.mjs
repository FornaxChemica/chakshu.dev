import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function sqlQuote(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function main() {
  const hikesPath = path.join(rootDir, "data", "hikes.json");
  const gpxDataPath = path.join(rootDir, "data", "gpx-data.json");
  const outputDir = path.join(rootDir, "db");
  const outputPath = path.join(outputDir, "seed.sql");

  const hikes = JSON.parse(await readFile(hikesPath, "utf8"));
  const gpxById = JSON.parse(await readFile(gpxDataPath, "utf8"));

  const lines = [];
  lines.push("PRAGMA foreign_keys = ON;");
  lines.push("BEGIN TRANSACTION;");
  lines.push("DELETE FROM snapshots;");
  lines.push("DELETE FROM hikes;");

  hikes.forEach((hike, index) => {
    const gpxData = gpxById[hike.id] ?? {
      trail: [],
      elevationFt: [],
      rawPoints: [],
      bounds: { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 },
      elevationMin: 0,
      elevationMax: 0,
    };

    lines.push(`
INSERT INTO hikes (
  id, sort_order, published, name, alltrails_url, location, date, distance, elevation_gain, high_point, difficulty,
  gpx_path, trail_json, elevation_ft_json, raw_points_json, bounds_json, elevation_min, elevation_max
) VALUES (
  ${sqlQuote(hike.id)},
  ${index},
  1,
  ${sqlQuote(hike.name)},
  ${sqlQuote(hike.alltrails_url ?? null)},
  ${sqlQuote(hike.location)},
  ${sqlQuote(hike.date)},
  ${sqlQuote(hike.distance)},
  ${sqlQuote(hike.elevation_gain)},
  ${sqlQuote(hike.high_point)},
  ${sqlQuote(hike.difficulty)},
  ${sqlQuote(hike.gpx)},
  ${sqlQuote(JSON.stringify(gpxData.trail ?? []))},
  ${sqlQuote(JSON.stringify(gpxData.elevationFt ?? []))},
  ${sqlQuote(JSON.stringify(gpxData.rawPoints ?? []))},
  ${sqlQuote(JSON.stringify(gpxData.bounds ?? { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 }))},
  ${Number(gpxData.elevationMin ?? 0)},
  ${Number(gpxData.elevationMax ?? 0)}
);`.trim());

    (hike.snapshots ?? []).forEach((snapshot, snapshotIndex) => {
      lines.push(`
INSERT INTO snapshots (
  hike_id, sort_order, at, src_path, caption, elevation
) VALUES (
  ${sqlQuote(hike.id)},
  ${snapshotIndex},
  ${Number(snapshot.at ?? 0)},
  ${sqlQuote(snapshot.src)},
  ${sqlQuote(snapshot.caption)},
  ${sqlQuote(snapshot.elevation)}
);`.trim());
    });
  });

  lines.push("COMMIT;");
  lines.push("");

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, lines.join("\n"), "utf8");

  console.log(`Wrote ${outputPath}`);
  console.log(`Hikes: ${hikes.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
