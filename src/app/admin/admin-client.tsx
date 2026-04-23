"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { authClient } from "../../../lib/auth-client";
import styles from "./admin.module.css";

type PhotoDraft = {
  id: string;
  file: File;
  caption: string;
  elevation: string;
  at: string;
  lat: string;
  lon: string;
  order: string;
  hasGpsHint: boolean;
};

type SubmitState =
  | { status: "idle"; message: string }
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type AdminClientProps = {
  adminEmail: string;
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

function createPhotoDraft(file: File): PhotoDraft {
  return {
    id: crypto.randomUUID(),
    file,
    caption: file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " "),
    elevation: "",
    at: "",
    lat: "",
    lon: "",
    order: "",
    hasGpsHint: false,
  };
}

type GpxPreview = {
  trackpoints: number;
  parseMs: number;
  trailName: string;
  distance: string;
  gain: string;
  highPoint: string;
  bounds: string;
};

function decodeXmlText(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .trim();
}

function extractTrailName(xml: string): string {
  const trkName = /<trk\b[\s\S]*?<name>([^<]+)<\/name>/i.exec(xml)?.[1];
  if (trkName) return decodeXmlText(trkName);

  const trkDesc = /<trk\b[\s\S]*?<desc>([^<]+)<\/desc>/i.exec(xml)?.[1];
  if (trkDesc) return decodeXmlText(trkDesc);

  const metadataName = /<metadata\b[\s\S]*?<name>([^<]+)<\/name>/i.exec(xml)?.[1];
  if (metadataName) return decodeXmlText(metadataName);

  return "";
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

function formatMiles(miles: number): string {
  return `${miles.toFixed(2).replace(/\.00$/, "")} mi`;
}

function formatFeet(feet: number): string {
  return `${Math.round(feet).toLocaleString("en-US")} ft`;
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
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (i > 0) {
      const prev = points[i - 1];
      distanceMeters += haversineMeters(prev.lat, prev.lon, p.lat, p.lon);
      const delta = p.ele - prev.ele;
      if (delta > 0) gainMeters += delta;
    }
    if (p.ele > highPointMeters) highPointMeters = p.ele;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  const parseMs = performance.now() - start;
  return {
    trackpoints: points.length,
    parseMs: Number.parseFloat(parseMs.toFixed(1)),
    trailName: extractTrailName(xml),
    distance: formatMiles(distanceMeters / 1609.344),
    gain: formatFeet(gainMeters * 3.28084),
    highPoint: formatFeet(highPointMeters * 3.28084),
    bounds: `${minLat.toFixed(3)}, ${minLon.toFixed(3)} → ${maxLat.toFixed(3)}, ${maxLon.toFixed(3)}`,
  };
}

export default function AdminClient({ adminEmail }: AdminClientProps) {
  const [name, setName] = useState("");
  const [hikeId, setHikeId] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [difficulty, setDifficulty] = useState("Moderate");
  const [allTrailsUrl, setAllTrailsUrl] = useState("");
  const [distance, setDistance] = useState("");
  const [elevationGain, setElevationGain] = useState("");
  const [highPoint, setHighPoint] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [gpxPreview, setGpxPreview] = useState<GpxPreview | null>(null);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "idle", message: "" });

  const computedId = useMemo(() => {
    if (hikeId.trim()) return hikeId.trim();
    return slugify(name);
  }, [hikeId, name]);

  function handlePhotosAdd(fileList: FileList | null) {
    if (!fileList) return;
    const additions = Array.from(fileList).map(createPhotoDraft);
    setPhotos((prev) => [...prev, ...additions]);
  }

  async function handleGpxSelect(file: File | null) {
    setGpxFile(file);
    if (!file) {
      setGpxPreview(null);
      return;
    }

    const preview = await parseGpxPreview(file);
    setGpxPreview(preview);
    if (!preview) return;

    if (preview.trailName) {
      setName((current) => (current.trim() ? current : preview.trailName));
    }
    if (!distance.trim()) setDistance(preview.distance);
    if (!elevationGain.trim()) setElevationGain(preview.gain);
    if (!highPoint.trim()) setHighPoint(preview.highPoint);
  }

  function updatePhoto(id: string, patch: Partial<PhotoDraft>) {
    setPhotos((prev) =>
      prev.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo))
    );
  }

  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((photo) => photo.id !== id));
  }

  useEffect(() => {
    setPhotos((current) =>
      current.map((photo, index) => ({
        ...photo,
        order: photo.order || String(index),
      }))
    );
  }, []);

  const photoPreviews = useMemo(() => {
    return photos.map((photo) => ({
      id: photo.id,
      url: URL.createObjectURL(photo.file),
    }));
  }, [photos]);

  useEffect(() => {
    return () => {
      for (const preview of photoPreviews) URL.revokeObjectURL(preview.url);
    };
  }, [photoPreviews]);

  const gpxParsed = !!gpxPreview;
  const initials = (adminEmail.split("@")[0] || "cj")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 2)
    .toUpperCase();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!gpxFile) {
      setSubmitState({ status: "error", message: "GPX file is required." });
      return;
    }
    if (!name.trim()) {
      setSubmitState({ status: "error", message: "Hike name is required." });
      return;
    }
    if (!computedId) {
      setSubmitState({ status: "error", message: "Could not generate hike id." });
      return;
    }

    setSubmitState({ status: "loading", message: "Uploading files and publishing hike..." });

    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("id", computedId);
    formData.append("location", location.trim());
    formData.append("date", date.trim());
    formData.append("difficulty", difficulty.trim());
    formData.append("alltrails_url", allTrailsUrl.trim());
    formData.append("distance", distance.trim());
    formData.append("elevation_gain", elevationGain.trim());
    formData.append("high_point", highPoint.trim());
    formData.append("sort_order", sortOrder.trim());
    formData.append("gpx", gpxFile);

    const snapshotMeta = photos.map((photo, index) => ({
      index,
      fileName: photo.file.name,
      caption: photo.caption.trim(),
      elevation: photo.elevation.trim(),
      at: photo.at.trim(),
      lat: photo.lat.trim(),
      lon: photo.lon.trim(),
    }));
    formData.append("snapshot_meta", JSON.stringify(snapshotMeta));

    photos.forEach((photo) => formData.append("photos", photo.file));

    try {
      const response = await fetch("/api/admin/hikes", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!response.ok) {
        setSubmitState({
          status: "error",
          message: payload.error ?? "Upload failed. Check your admin config and try again.",
        });
        return;
      }

      setSubmitState({
        status: "success",
        message: payload.message ?? "Hike published to D1 and assets uploaded to R2.",
      });
    } catch {
      setSubmitState({
        status: "error",
        message: "Network error while uploading. Please retry.",
      });
    }
  }

  return (
    <div className={styles.adminFrame}>
      <header className={styles.adminTopbar}>
        <div className={styles.breadcrumbs}>
          <span>CJ.</span>
          <span>/</span>
          <span>admin</span>
          <span>/</span>
          <span>new trail</span>
        </div>
        <div className={styles.topbarRight}>
          <div className={styles.avatar}>{initials || "CJ"}</div>
          <button
            type="button"
            className={styles.signOutBtn}
            onClick={async () => {
              await authClient.signOut();
              window.location.href = "/admin/login";
            }}
          >
            sign out
          </button>
        </div>
      </header>

      <div className={styles.adminShell}>
        <aside className={styles.adminSidebar}>
          <nav className={styles.sideNav}>
            <button type="button" className={styles.sideNavItem}>all trails</button>
            <button type="button" className={`${styles.sideNavItem} ${styles.sideNavItemActive}`}>+ new trail</button>
            <button type="button" className={styles.sideNavItem}>media library</button>
          </nav>
          <div className={styles.sidebarStats}>
            <div className={styles.sidebarStatsHead}>quick stats</div>
            <div className={styles.sidebarStatRow}><span>trails</span><span>9</span></div>
            <div className={styles.sidebarStatRow}><span>snapshots</span><span>9</span></div>
            <div className={styles.sidebarStatRow}><span>total miles</span><span>76.3</span></div>
          </div>
        </aside>

        <main className={styles.adminMain}>
          <form className={styles.form} onSubmit={onSubmit}>
            <section className={styles.panel}>
              <h2>01 — GPX File</h2>
              <label className={styles.gpxDropZone}>
                <div className={styles.gpxIcon}>⌁</div>
                <div className={styles.gpxDropText}>
                  <strong>{gpxFile ? gpxFile.name : "Drop GPX file or click to browse"}</strong>
                  <span>{gpxPreview ? `${gpxPreview.trackpoints} trackpoints · parsed in ${gpxPreview.parseMs}ms` : "GPX required"}</span>
                </div>
                <input
                  type="file"
                  accept=".gpx,application/gpx+xml,application/xml,text/xml"
                  onChange={(e) => void handleGpxSelect(e.currentTarget.files?.[0] ?? null)}
                  required
                />
              </label>

              {gpxParsed ? (
                <div className={styles.autofillStrip}>
                  <div><span>distance</span><strong>{gpxPreview.distance}</strong><em>↑ autofilled</em></div>
                  <div><span>gain</span><strong>{gpxPreview.gain}</strong><em>↑ autofilled</em></div>
                  <div><span>high point</span><strong>{gpxPreview.highPoint}</strong><em>↑ autofilled</em></div>
                  <div><span>bounds</span><strong>{gpxPreview.bounds}</strong><em>↑ autofilled</em></div>
                </div>
              ) : null}
            </section>

            <section className={styles.panel}>
              <h2>02 — Hike Details</h2>
              <div className={styles.gridFull}>
                <label>
                  Trail Name
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Peekaboo Canyon" required />
                </label>
              </div>

              <div className={styles.gridThree}>
                <label>
                  Location
                  <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Kanab, UT" />
                </label>
                <label>
                  Date
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label>
                  Difficulty
                  <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                    <option>Easy</option>
                    <option>Moderate</option>
                    <option>Hard</option>
                  </select>
                </label>
              </div>

              <div className={styles.gridThree}>
                <label>
                  Distance
                  <input className={gpxParsed ? styles.autofilled : ""} value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="8.2 mi" />
                  {gpxParsed ? <small>↑ from gpx</small> : null}
                </label>
                <label>
                  Elevation Gain
                  <input className={gpxParsed ? styles.autofilled : ""} value={elevationGain} onChange={(e) => setElevationGain(e.target.value)} placeholder="1,420 ft" />
                  {gpxParsed ? <small>↑ from gpx</small> : null}
                </label>
                <label>
                  High Point
                  <input className={gpxParsed ? styles.autofilled : ""} value={highPoint} onChange={(e) => setHighPoint(e.target.value)} placeholder="7,664 ft" />
                  {gpxParsed ? <small>↑ from gpx</small> : null}
                </label>
              </div>

              <div className={styles.gridTwo}>
                <label>
                  AllTrails URL
                  <input value={allTrailsUrl} onChange={(e) => setAllTrailsUrl(e.target.value)} placeholder="https://..." />
                </label>
                <label>
                  Hike ID
                  <input value={computedId} readOnly />
                </label>
              </div>

              <p className={styles.helper}>distance · gain · high point auto-filled from GPX — edit to override</p>
            </section>

            <section className={styles.panel}>
              <h2>03 — Media &amp; Placement</h2>
              <div className={styles.uploadRow}>
                <label className={styles.fileField}>
                  Photos / Videos
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={(e) => handlePhotosAdd(e.currentTarget.files)}
                  />
                </label>
                <label className={styles.fileField}>
                  Sort Order
                  <input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" />
                </label>
              </div>

              {photos.length > 0 ? (
                <div className={styles.photoList}>
                  {photos.map((photo, index) => {
                    const preview = photoPreviews.find((item) => item.id === photo.id)?.url ?? "";
                    const badgeText = photo.at.trim()
                      ? "manual at"
                      : photo.hasGpsHint
                        ? "EXIF GPS ✓"
                        : "no GPS · manual";
                    const badgeClass = photo.at.trim()
                      ? styles.badgeManualAt
                      : photo.hasGpsHint
                        ? styles.badgeGps
                        : styles.badgeNoGps;
                    const sliderValue = photo.at || "0.5";

                    return (
                      <article key={photo.id} className={styles.photoCard}>
                        <button type="button" className={styles.removeIconBtn} onClick={() => removePhoto(photo.id)}>✕</button>
                        <div className={styles.photoHead}>
                          {photo.file.type.startsWith("image/") && preview ? (
                            <img src={preview} alt={photo.file.name} className={styles.photoThumb} />
                          ) : (
                            <div className={styles.photoThumbFallback}>vid</div>
                          )}
                          <div className={styles.photoHeadText}>
                            <div className={styles.photoName}>{photo.file.name}</div>
                            <span className={`${styles.placementBadge} ${badgeClass}`}>{badgeText}</span>
                          </div>
                        </div>

                        <div className={styles.sliderRow}>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={sliderValue}
                            onChange={(e) => updatePhoto(photo.id, { at: e.target.value })}
                            className={`${styles.placementSlider} ${photo.hasGpsHint ? styles.placementSliderGps : ""}`}
                          />
                          <span className={styles.atValue}>at {Number(sliderValue).toFixed(2)}</span>
                        </div>

                        <div className={styles.mediaMetaGrid}>
                          <label>
                            Caption
                            <input value={photo.caption} onChange={(e) => updatePhoto(photo.id, { caption: e.target.value })} />
                          </label>
                          <label>
                            Elevation
                            <input
                              className={photo.hasGpsHint ? styles.autofilled : ""}
                              value={photo.elevation}
                              onChange={(e) => updatePhoto(photo.id, { elevation: e.target.value })}
                              placeholder="7,100 ft"
                            />
                          </label>
                          <label>
                            Sort Order
                            <input
                              value={photo.order || String(index)}
                              onChange={(e) => updatePhoto(photo.id, { order: e.target.value })}
                              inputMode="numeric"
                            />
                          </label>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </section>

            <section className={styles.panel}>
              <h2>04 — Publish</h2>
              <div className={styles.publishSummary}>
                <div><span>GPX path</span><strong>{computedId ? `hikes/${computedId}/${computedId}.gpx` : "—"}</strong></div>
                <div><span>media count</span><strong>{photos.length}</strong></div>
                <div><span>snapshot positions</span><strong>{photos.map((p) => (p.at || "0.50")).join(", ") || "—"}</strong></div>
                <div><span>D1 targets</span><strong>hikes · snapshots</strong></div>
              </div>
              <div className={styles.actions}>
                <button type="submit" className={styles.publishBtnSquare} disabled={submitState.status === "loading"}>
                  {submitState.status === "loading" ? "Publishing..." : "Publish Hike"}
                </button>
                <button
                  type="button"
                  className={styles.discardBtn}
                  onClick={() => {
                    setName("");
                    setHikeId("");
                    setLocation("");
                    setDate("");
                    setDifficulty("Moderate");
                    setAllTrailsUrl("");
                    setDistance("");
                    setElevationGain("");
                    setHighPoint("");
                    setSortOrder("0");
                    setGpxFile(null);
                    setGpxPreview(null);
                    setPhotos([]);
                    setSubmitState({ status: "idle", message: "" });
                  }}
                >
                  Discard
                </button>
              </div>
              <p className={styles.status} data-status={submitState.status}>{submitState.message}</p>
            </section>
          </form>
        </main>
      </div>
    </div>
  );
}
