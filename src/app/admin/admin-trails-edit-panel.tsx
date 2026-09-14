"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "./admin.module.css";

export type AdminHikeListItem = {
  id: string;
  sortOrder: number;
  published: boolean;
  name: string;
  alltrailsUrl: string | null;
  location: string;
  date: string;
  distance: string;
  elevationGain: string;
  highPoint: string;
  difficulty: string;
  gpxPath: string;
  snapshotCount: number;
};

type LoadState =
  | { status: "loading"; message: string }
  | { status: "ready"; message: string }
  | { status: "error"; message: string };

type SaveState =
  | { status: "idle"; message: string }
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type GpxPreview = {
  trackpoints: number;
  parseMs: number;
  distance: string;
  gain: string;
  highPoint: string;
};

function isTbd(value: string | null | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return !v || v === "tbd";
}

function formatMiles(miles: number): string {
  return `${miles.toFixed(2).replace(/\.00$/, "")} mi`;
}

function formatFeet(feet: number): string {
  return `${Math.round(feet).toLocaleString("en-US")} ft`;
}

function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function parseGpxPreview(file: File): Promise<GpxPreview | null> {
  const start = performance.now();
  const xml = await file.text();
  const trkptRegex = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi;
  const points: Array<{ lat: number; lon: number; ele: number }> = [];

  let match: RegExpExecArray | null = trkptRegex.exec(xml);
  while (match) {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const latMatch = /lat="([^"]+)"/i.exec(attrs);
    const lonMatch = /lon="([^"]+)"/i.exec(attrs);
    if (latMatch && lonMatch) {
      const lat = Number(latMatch[1]);
      const lon = Number(lonMatch[1]);
      const eleMatch = /<ele>([^<]+)<\/ele>/i.exec(body);
      const ele = eleMatch ? Number(eleMatch[1]) : 0;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        points.push({ lat, lon, ele: Number.isFinite(ele) ? ele : 0 });
      }
    }
    match = trkptRegex.exec(xml);
  }

  if (points.length < 2) return null;

  let distanceMeters = 0;
  let gainMeters = 0;
  let highPointMeters = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (i > 0) {
      const prev = points[i - 1];
      distanceMeters += haversineMeters(prev.lat, prev.lon, p.lat, p.lon);
      const delta = p.ele - prev.ele;
      if (delta > 0) gainMeters += delta;
    }
    if (p.ele > highPointMeters) highPointMeters = p.ele;
  }

  return {
    trackpoints: points.length,
    parseMs: Number.parseFloat((performance.now() - start).toFixed(1)),
    distance: formatMiles(distanceMeters / 1609.344),
    gain: formatFeet(gainMeters * 3.28084),
    highPoint: formatFeet(highPointMeters * 3.28084),
  };
}

export default function AdminTrailsEditPanel() {
  const [hikes, setHikes] = useState<AdminHikeListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    message: "Loading trails…",
  });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle", message: "" });

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [difficulty, setDifficulty] = useState("Moderate");
  const [distance, setDistance] = useState("");
  const [elevationGain, setElevationGain] = useState("");
  const [highPoint, setHighPoint] = useState("");
  const [allTrailsUrl, setAllTrailsUrl] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [published, setPublished] = useState(true);
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [gpxPreview, setGpxPreview] = useState<GpxPreview | null>(null);
  const [statsFromGpx, setStatsFromGpx] = useState(false);

  const load = useCallback(async () => {
    setLoadState({ status: "loading", message: "Loading trails…" });
    try {
      const response = await fetch("/api/admin/hikes");
      const payload = (await response.json()) as { error?: string; hikes?: AdminHikeListItem[] };
      if (!response.ok) throw new Error(payload.error ?? "Failed to load hikes.");
      const list = payload.hikes ?? [];
      setHikes(list);
      setLoadState({
        status: "ready",
        message: `${list.length} trail${list.length === 1 ? "" : "s"}`,
      });
    } catch (error) {
      setLoadState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to load hikes.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? hikes
      : hikes.filter((hike) =>
          [hike.name, hike.id, hike.location, hike.date].join(" ").toLowerCase().includes(q)
        );
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [hikes, query]);

  function selectHike(hike: AdminHikeListItem) {
    setSelectedId(hike.id);
    setName(hike.name);
    setLocation(hike.location);
    setDate(hike.date);
    setDifficulty(hike.difficulty || "Moderate");
    setDistance(hike.distance);
    setElevationGain(hike.elevationGain);
    setHighPoint(hike.highPoint);
    setAllTrailsUrl(hike.alltrailsUrl ?? "");
    setSortOrder(String(hike.sortOrder));
    setPublished(hike.published);
    setGpxFile(null);
    setGpxPreview(null);
    setStatsFromGpx(false);
    setSaveState({ status: "idle", message: "" });
  }

  async function handleGpxSelect(file: File | null) {
    setGpxFile(file);
    setGpxPreview(null);
    setStatsFromGpx(false);
    if (!file) return;
    const preview = await parseGpxPreview(file);
    setGpxPreview(preview);
    if (preview) {
      setDistance(preview.distance);
      setElevationGain(preview.gain);
      setHighPoint(preview.highPoint);
      setStatsFromGpx(true);
    }
  }

  async function save() {
    if (!selectedId) return;
    setSaveState({ status: "loading", message: "Saving…" });

    const formData = new FormData();
    formData.set("name", name);
    formData.set("location", location);
    formData.set("date", date);
    formData.set("difficulty", difficulty);
    formData.set("distance", distance);
    formData.set("elevation_gain", elevationGain);
    formData.set("high_point", highPoint);
    formData.set("alltrails_url", allTrailsUrl);
    formData.set("sort_order", sortOrder);
    formData.set("published", published ? "1" : "0");
    if (gpxFile) formData.set("gpx", gpxFile);

    try {
      const response = await fetch(`/api/admin/hikes/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        body: formData,
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        hike?: AdminHikeListItem & { gpxReplaced?: boolean; elevationGain?: string; highPoint?: string };
      };
      if (!response.ok) throw new Error(payload.error ?? "Save failed.");

      setSaveState({
        status: "success",
        message: payload.message ?? "Saved.",
      });
      await load();
      if (payload.hike) {
        setGpxFile(null);
        setGpxPreview(null);
        setStatsFromGpx(false);
      }
    } catch (error) {
      setSaveState({
        status: "error",
        message: error instanceof Error ? error.message : "Save failed.",
      });
    }
  }

  const selected = hikes.find((hike) => hike.id === selectedId) ?? null;

  return (
    <div className={styles.projectsPanel}>
      <div className={styles.formHeader}>
        <div>
          <div className={styles.kicker}>Trails</div>
          <h1 className={styles.formTitle}>Edit existing</h1>
          <p className={styles.formSubtitle}>
            Update TBD fields anytime. Optionally replace GPX — photos stay put.
          </p>
        </div>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => void save()}
          disabled={!selectedId || saveState.status === "loading"}
        >
          Save changes
        </button>
      </div>

      <div className={styles.projectsToolbar}>
        <input
          className={styles.input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter trails…"
        />
        <div className={styles.projectsStatus} data-status={loadState.status}>
          {loadState.message}
        </div>
        {saveState.message ? (
          <div className={styles.projectsStatus} data-status={saveState.status}>
            {saveState.message}
          </div>
        ) : null}
      </div>

      {loadState.status === "error" ? (
        <div className={styles.projectsEmpty}>{loadState.message}</div>
      ) : (
        <div className={styles.trailsEditLayout}>
          <div className={styles.trailsEditList}>
            {filtered.map((hike) => {
              const active = hike.id === selectedId;
              return (
                <button
                  key={hike.id}
                  type="button"
                  className={`${styles.trailPickRow} ${active ? styles.trailPickRowActive : ""}`}
                  onClick={() => selectHike(hike)}
                >
                  <div className={styles.trailPickName}>{hike.name}</div>
                  <div className={styles.trailPickMeta}>
                    <span>{hike.location || "—"}</span>
                    <span>{hike.date || "—"}</span>
                  </div>
                  <div className={styles.trailPickBadges}>
                    {isTbd(hike.date) ? <span className={styles.tbdBadge}>date TBD</span> : null}
                    {isTbd(hike.location) ? <span className={styles.tbdBadge}>loc TBD</span> : null}
                    <span className={styles.trailPickCount}>{hike.snapshotCount} photos</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className={styles.trailsEditForm}>
            {!selected ? (
              <div className={styles.projectsEmpty}>Select a trail to edit.</div>
            ) : (
              <>
                <div className={styles.helper}>
                  Hike ID <strong>{selected.id}</strong> · GPX{" "}
                  <strong>{selected.gpxPath || "—"}</strong>
                </div>

                <div className={styles.gridFull}>
                  <label>
                    Trail Name
                    <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                </div>

                <div className={styles.gridThree}>
                  <label>
                    Location
                    <input
                      className={styles.input}
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Kanab, UT"
                    />
                  </label>
                  <label>
                    Date
                    <input
                      className={styles.input}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      placeholder="2024-10-12 or Oct 2024"
                    />
                  </label>
                  <label>
                    Difficulty
                    <select
                      className={styles.input}
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                    >
                      <option>Easy</option>
                      <option>Moderate</option>
                      <option>Hard</option>
                    </select>
                  </label>
                </div>

                <div className={styles.gridThree}>
                  <label>
                    Distance
                    <input
                      className={`${styles.input} ${statsFromGpx ? styles.autofilled : ""}`}
                      value={distance}
                      onChange={(e) => {
                        setStatsFromGpx(false);
                        setDistance(e.target.value);
                      }}
                    />
                  </label>
                  <label>
                    Elevation Gain
                    <input
                      className={`${styles.input} ${statsFromGpx ? styles.autofilled : ""}`}
                      value={elevationGain}
                      onChange={(e) => {
                        setStatsFromGpx(false);
                        setElevationGain(e.target.value);
                      }}
                    />
                  </label>
                  <label>
                    High Point
                    <input
                      className={`${styles.input} ${statsFromGpx ? styles.autofilled : ""}`}
                      value={highPoint}
                      onChange={(e) => {
                        setStatsFromGpx(false);
                        setHighPoint(e.target.value);
                      }}
                    />
                  </label>
                </div>

                <div className={styles.gridTwo}>
                  <label>
                    AllTrails URL
                    <input
                      className={styles.input}
                      value={allTrailsUrl}
                      onChange={(e) => setAllTrailsUrl(e.target.value)}
                      placeholder="https://…"
                    />
                  </label>
                  <label>
                    Sort order
                    <input
                      className={styles.input}
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value)}
                    />
                  </label>
                </div>

                <label className={styles.projectFeaturedToggle}>
                  <input
                    type="checkbox"
                    checked={published}
                    onChange={(e) => setPublished(e.target.checked)}
                  />
                  Published on /trails
                </label>

                <section className={styles.panel}>
                  <h2>Replace GPX (optional)</h2>
                  <p className={styles.helper}>
                    Leave empty to keep the current track. New GPX updates geometry only — snapshots stay.
                  </p>
                  <label className={styles.gpxDropZone}>
                    <div className={styles.gpxIcon}>⌁</div>
                    <div className={styles.gpxDropText}>
                      <strong>{gpxFile ? gpxFile.name : "Drop GPX to replace track"}</strong>
                      <span>
                        {gpxPreview
                          ? `${gpxPreview.trackpoints} pts · ${gpxPreview.parseMs}ms`
                          : "optional"}
                      </span>
                    </div>
                    <input
                      type="file"
                      accept=".gpx,application/gpx+xml,application/xml,text/xml"
                      onChange={(e) => void handleGpxSelect(e.currentTarget.files?.[0] ?? null)}
                    />
                  </label>
                  {gpxPreview ? (
                    <div className={styles.autofillStrip}>
                      <div>
                        <span>distance</span>
                        <strong>{gpxPreview.distance}</strong>
                        <em>↑ from gpx</em>
                      </div>
                      <div>
                        <span>gain</span>
                        <strong>{gpxPreview.gain}</strong>
                        <em>↑ from gpx</em>
                      </div>
                      <div>
                        <span>high point</span>
                        <strong>{gpxPreview.highPoint}</strong>
                        <em>↑ from gpx</em>
                      </div>
                    </div>
                  ) : null}
                  {gpxFile ? (
                    <button
                      type="button"
                      className={styles.resetGithubBtn}
                      onClick={() => void handleGpxSelect(null)}
                    >
                      Clear GPX replacement
                    </button>
                  ) : null}
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
