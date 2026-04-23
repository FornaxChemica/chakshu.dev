"use client";

import { FormEvent, useMemo, useState } from "react";

import styles from "./admin.module.css";

type PhotoDraft = {
  id: string;
  file: File;
  caption: string;
  elevation: string;
  at: string;
  lat: string;
  lon: string;
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

  function updatePhoto(id: string, patch: Partial<PhotoDraft>) {
    setPhotos((prev) =>
      prev.map((photo) => (photo.id === id ? { ...photo, ...patch } : photo))
    );
  }

  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((photo) => photo.id !== id));
  }

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
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Trail Admin</h1>
        <p className={styles.subtitle}>
          Signed in as <span>{adminEmail}</span>
        </p>
      </header>

      <form className={styles.form} onSubmit={onSubmit}>
        <section className={styles.panel}>
          <h2>Hike Details</h2>
          <div className={styles.grid}>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Peekaboo Canyon" required />
            </label>
            <label>
              ID
              <input value={hikeId} onChange={(e) => setHikeId(e.target.value)} placeholder={computedId || "auto-generated"} />
            </label>
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
              <input value={difficulty} onChange={(e) => setDifficulty(e.target.value)} />
            </label>
            <label>
              AllTrails URL
              <input value={allTrailsUrl} onChange={(e) => setAllTrailsUrl(e.target.value)} placeholder="https://..." />
            </label>
            <label>
              Distance (optional override)
              <input value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="8.2 mi" />
            </label>
            <label>
              Elevation Gain (optional override)
              <input value={elevationGain} onChange={(e) => setElevationGain(e.target.value)} placeholder="1,420 ft" />
            </label>
            <label>
              High Point (optional override)
              <input value={highPoint} onChange={(e) => setHighPoint(e.target.value)} placeholder="7,664 ft" />
            </label>
            <label>
              Sort Order
              <input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" />
            </label>
          </div>
        </section>

        <section className={styles.panel}>
          <h2>Upload Files</h2>
          <div className={styles.uploadRow}>
            <label className={styles.fileField}>
              GPX file
              <input
                type="file"
                accept=".gpx,application/gpx+xml,application/xml,text/xml"
                onChange={(e) => setGpxFile(e.currentTarget.files?.[0] ?? null)}
                required
              />
            </label>
            <label className={styles.fileField}>
              Photos
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handlePhotosAdd(e.currentTarget.files)}
              />
            </label>
          </div>
          <p className={styles.helper}>
            Photos are uploaded at original quality. For each photo, provide either `at` (0 to 1) or `lat/lon` to auto-place on trail.
          </p>
        </section>

        {photos.length > 0 ? (
          <section className={styles.panel}>
            <h2>Photo Placement</h2>
            <div className={styles.photoList}>
              {photos.map((photo) => (
                <article key={photo.id} className={styles.photoCard}>
                  <div className={styles.photoName}>{photo.file.name}</div>
                  <div className={styles.photoGrid}>
                    <label>
                      Caption
                      <input value={photo.caption} onChange={(e) => updatePhoto(photo.id, { caption: e.target.value })} />
                    </label>
                    <label>
                      Elevation
                      <input value={photo.elevation} onChange={(e) => updatePhoto(photo.id, { elevation: e.target.value })} placeholder="7,100 ft" />
                    </label>
                    <label>
                      At (0..1)
                      <input value={photo.at} onChange={(e) => updatePhoto(photo.id, { at: e.target.value })} placeholder="0.42" />
                    </label>
                    <label>
                      Latitude (optional)
                      <input value={photo.lat} onChange={(e) => updatePhoto(photo.id, { lat: e.target.value })} placeholder="36.5892" />
                    </label>
                    <label>
                      Longitude (optional)
                      <input value={photo.lon} onChange={(e) => updatePhoto(photo.id, { lon: e.target.value })} placeholder="-112.0872" />
                    </label>
                  </div>
                  <button type="button" className={styles.removeBtn} onClick={() => removePhoto(photo.id)}>
                    Remove
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <div className={styles.actions}>
          <button type="submit" className={styles.publishBtn} disabled={submitState.status === "loading"}>
            {submitState.status === "loading" ? "Publishing..." : "Publish Hike"}
          </button>
          <p className={styles.status} data-status={submitState.status}>
            {submitState.message}
          </p>
        </div>
      </form>
    </div>
  );
}
