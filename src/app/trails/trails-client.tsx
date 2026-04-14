"use client";

import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type SyntheticEvent,
} from "react";

import type { ParsedHike, Snapshot } from "../../../types/hikes";
import styles from "./trails.module.css";

type TrailsClientProps = {
  hikes: ParsedHike[];
};

type TrailPoint = { lat: number; lon: number; ele: number };

type GeoJsonFeature = {
  type: "Feature";
  geometry:
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "Point"; coordinates: [number, number] };
  properties: Record<string, never>;
};

type MapSource = {
  setData: (data: GeoJsonFeature) => void;
};

type MapInstance = {
  on: (event: "load", handler: () => void) => void;
  addSource: (id: string, source: { type: "geojson"; data: GeoJsonFeature }) => void;
  getSource: (id: string) => MapSource | undefined;
  addLayer: (layer: Record<string, unknown>) => void;
  getLayer: (id: string) => unknown;
  addControl: (control: unknown, position?: string) => void;
  fitBounds: (
    bounds: [[number, number], [number, number]],
    options: { padding: { top: number; bottom: number; left: number; right: number }; duration: number }
  ) => void;
  resize: () => void;
  remove: () => void;
};

type MarkerInstance = {
  setLngLat: (lngLat: [number, number]) => MarkerInstance;
  addTo: (map: MapInstance) => MarkerInstance;
  remove: () => void;
};

type MapboxGlobal = {
  accessToken: string;
  Map: new (options: Record<string, unknown>) => MapInstance;
  Marker: new (options: { element: HTMLElement }) => MarkerInstance;
  NavigationControl: new (options?: { showCompass?: boolean; showZoom?: boolean }) => unknown;
  AttributionControl: new (options?: { compact?: boolean }) => unknown;
};

type MarkerMeta = {
  marker: MarkerInstance;
  element: HTMLDivElement;
  at: number;
  index: number;
};

declare global {
  interface Window {
    mapboxgl?: MapboxGlobal;
  }
}

const DRAW_DURATION = 1500;
const SNAP_WINDOW = 0.06;
const SNAPSHOT_CLOSE_MS = 210;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function easeInOut(value: number): number {
  return 0.5 * (1 - Math.cos(Math.PI * value));
}

function formatFeet(value: number): string {
  return `${Math.round(value).toLocaleString()} ft`;
}

function coordAtProgress(rawPoints: TrailPoint[], progress: number): TrailPoint | null {
  if (rawPoints.length === 0) return null;
  const maxIndex = rawPoints.length - 1;
  const index = Math.min(maxIndex, Math.max(0, Math.floor(progress * maxIndex)));
  return rawPoints[index];
}

function walkedCoordinates(rawPoints: TrailPoint[], progress: number): [number, number][] {
  if (rawPoints.length === 0) return [];
  const maxIndex = rawPoints.length - 1;
  const index = Math.min(maxIndex, Math.max(0, Math.floor(progress * maxIndex)));
  return rawPoints.slice(0, index + 1).map((point) => [point.lon, point.lat]);
}

function lineFeature(coords: [number, number][]): GeoJsonFeature {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: {},
  };
}

function pointFeature(point: [number, number]): GeoJsonFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: point },
    properties: {},
  };
}

function contextLabel(progress: number, snapshots: Snapshot[]): string {
  if (snapshots.length === 0) return "route overview";
  const ordered = snapshots.slice().sort((a, b) => a.at - b.at);
  if (progress < ordered[0].at) return "trail start";

  for (let i = 0; i < ordered.length; i += 1) {
    if (progress < ordered[i].at) {
      return `toward ${ordered[i].caption}`;
    }
  }

  return `past ${ordered[ordered.length - 1].caption}`;
}

function snapshotCardStyle(ratio: number | null): CSSProperties {
  if (ratio !== null && ratio < 0.85) {
    return {
      "--photo-panel-width": "196px",
      "--photo-media-height": "248px",
    } as CSSProperties;
  }

  if (ratio !== null && ratio > 1.35) {
    return {
      "--photo-panel-width": "272px",
      "--photo-media-height": "176px",
    } as CSSProperties;
  }

  return {
    "--photo-panel-width": "240px",
    "--photo-media-height": "190px",
  } as CSSProperties;
}

export default function TrailsClient({ hikes }: TrailsClientProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [openSnapshotIndex, setOpenSnapshotIndex] = useState<number | null>(null);
  const [renderedSnapshotIndex, setRenderedSnapshotIndex] = useState<number | null>(null);
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [snapshotAspectRatios, setSnapshotAspectRatios] = useState<Record<string, number>>({});
  const [mapReady, setMapReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [scrollThumbTop, setScrollThumbTop] = useState(8);
  const [scrollThumbHeight, setScrollThumbHeight] = useState(40);
  const [mobileThumbLeft, setMobileThumbLeft] = useState(0);
  const [mobileThumbWidth, setMobileThumbWidth] = useState(60);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const desktopProfileCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mobileProfileCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const shelfRef = useRef<HTMLDivElement>(null);
  const mobileShelfRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markerRef = useRef<MarkerMeta[]>([]);
  const pollTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const dragCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const progressRef = useRef(0);
  const snapshotCloseTimerRef = useRef<number | null>(null);

  const activeHike = hikes[activeIndex] ?? null;
  const profileHeights = activeHike?.gpxData.elevationFt ?? [];
  const currentElevation = useMemo(() => {
    if (!profileHeights.length) return 0;
    const maxIndex = profileHeights.length - 1;
    const idx = Math.min(maxIndex, Math.max(0, Math.floor(progress * maxIndex)));
    return profileHeights[idx];
  }, [profileHeights, progress]);

  const applyProgress = useCallback(
    (value: number) => {
      const next = clamp01(value);
      progressRef.current = next;

      let autoSnap: number | null = null;
      if (activeHike) {
        for (let i = 0; i < activeHike.snapshots.length; i += 1) {
          const snapshot = activeHike.snapshots[i];
          if (next >= snapshot.at && next < snapshot.at + SNAP_WINDOW) {
            autoSnap = i;
            break;
          }
        }
      }

      setOpenSnapshotIndex(autoSnap);
      setProgress(next);
    },
    [activeHike]
  );

  const startTrailAnimation = useCallback(() => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const start = performance.now();
    const animate = (now: number) => {
      const t = clamp01((now - start) / DRAW_DURATION);
      applyProgress(easeInOut(t));
      if (t < 1) {
        rafRef.current = window.requestAnimationFrame(animate);
      }
    };

    applyProgress(0);
    rafRef.current = window.requestAnimationFrame(animate);
  }, [applyProgress]);

  useEffect(() => {
    const existing = document.getElementById("mapbox-gl-css");
    if (existing) return;

    const link = document.createElement("link");
    link.id = "mapbox-gl-css";
    link.rel = "stylesheet";
    link.href = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    let resizeObserver: ResizeObserver | null = null;

    const waitForMapbox = () => {
      if (!window.mapboxgl) return;
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      if (!mapContainerRef.current || mapRef.current) return;

      window.mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
      const map = new window.mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/outdoors-v12",
        dragRotate: false,
        attributionControl: false,
        logoPosition: "bottom-left",
      });
      setTimeout(() => {
        map.resize();
      }, 100);
      resizeObserver = new ResizeObserver(() => {
        map.resize();
      });
      if (mapContainerRef.current) {
        resizeObserver.observe(mapContainerRef.current);
      }
      map.addControl(new window.mapboxgl.AttributionControl({ compact: true }), "bottom-left");
      map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
      mapRef.current = map;
      map.on("load", () => {
        // Add dark overlay to darken map tiles without affecting GL layers
        (map as any).addLayer({
          id: "dark-overlay",
          type: "background",
          paint: {
            "background-color": "#000000",
            "background-opacity": 0.45,
          },
        });
        setMapReady(true);
      });
    };

    waitForMapbox();
    if (!mapRef.current) {
      pollTimerRef.current = window.setInterval(waitForMapbox, 120);
    }

    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
      }
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
      markerRef.current.forEach((meta) => meta.marker.remove());
      markerRef.current = [];
      resizeObserver?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const syncMarkerStates = useCallback(
    (value: number) => {
      markerRef.current.forEach((meta) => {
        const active = value >= meta.at;
        meta.element.classList.toggle(styles.snapshotMarkerActive, active);
      });
    },
    []
  );

  const updateMapProgress = useCallback(
    (value: number) => {
      if (!activeHike || !mapRef.current) return;

      const walked = walkedCoordinates(activeHike.gpxData.rawPoints, value);
      const walkedSource = mapRef.current.getSource("trail-walked");
      if (walkedSource) {
        walkedSource.setData(lineFeature(walked));
      }

      const point = coordAtProgress(activeHike.gpxData.rawPoints, value);
      const pointSource = mapRef.current.getSource("trail-position");
      if (pointSource && point) {
        pointSource.setData(pointFeature([point.lon, point.lat]));
      }

      syncMarkerStates(value);
    },
    [activeHike, syncMarkerStates]
  );

  useEffect(() => {
    updateMapProgress(progress);
  }, [progress, updateMapProgress]);

  useEffect(() => {
    if (!mapReady || !activeHike || !mapRef.current) return;

    const fullCoords = activeHike.gpxData.rawPoints.map((point) => [point.lon, point.lat] as [number, number]);
    const firstPoint = activeHike.gpxData.rawPoints[0];
    if (!firstPoint) return;

    const fullFeature = lineFeature(fullCoords);
    const walkedFeature = lineFeature([[firstPoint.lon, firstPoint.lat]]);
    const positionFeature = pointFeature([firstPoint.lon, firstPoint.lat]);

    const addOrUpdateSource = (id: string, data: GeoJsonFeature) => {
      const source = mapRef.current?.getSource(id);
      if (source) {
        source.setData(data);
      } else {
        mapRef.current?.addSource(id, { type: "geojson", data });
      }
    };

    addOrUpdateSource("trail-full", fullFeature);
    addOrUpdateSource("trail-walked", walkedFeature);
    addOrUpdateSource("trail-position", positionFeature);

    if (!mapRef.current.getLayer("trail-full-line")) {
      mapRef.current.addLayer({
        id: "trail-full-line",
        type: "line",
        source: "trail-full",
        paint: {
          "line-color": "rgba(255,255,255,0.12)",
          "line-width": 2,
          "line-dasharray": [2, 4],
        },
        layout: {},
      });
    }

    if (!mapRef.current.getLayer("trail-walked-line")) {
      mapRef.current.addLayer({
        id: "trail-walked-line",
        type: "line",
        source: "trail-walked",
        paint: {
          "line-color": "#00e5ff",
          "line-width": 3,
        },
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
      });
    }

    if (!mapRef.current.getLayer("trail-position-dot")) {
      mapRef.current.addLayer({
        id: "trail-position-dot",
        type: "circle",
        source: "trail-position",
        paint: {
          "circle-color": "#00e5ff",
          "circle-radius": 5,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
    }

    const bounds = activeHike.gpxData.bounds;
    mapRef.current.fitBounds(
      [
        [bounds.minLon, bounds.minLat],
        [bounds.maxLon, bounds.maxLat],
      ],
      {
        padding: { top: 60, bottom: 100, left: 40, right: 60 },
        duration: 850,
      }
    );

    markerRef.current.forEach((entry) => entry.marker.remove());
    markerRef.current = [];

    if (window.mapboxgl) {
      activeHike.snapshots.forEach((snapshot, index) => {
        const point = coordAtProgress(activeHike.gpxData.rawPoints, snapshot.at);
        if (!point || !mapRef.current || !window.mapboxgl) return;

        const markerEl = document.createElement("div");
        markerEl.className = styles.snapshotMarker;

        const marker = new window.mapboxgl.Marker({ element: markerEl })
          .setLngLat([point.lon, point.lat])
          .addTo(mapRef.current);

        markerRef.current.push({ marker, element: markerEl, at: snapshot.at, index });
      });
    }

    setOpenSnapshotIndex(null);
    startTrailAnimation();
  }, [activeHike, mapReady, startTrailAnimation, styles.snapshotMarker]);

  const drawProfile = useCallback(
    (currentProgress: number) => {
      if (!activeHike) return;
      const values = activeHike.gpxData.elevationFt;

      const drawOnCanvas = (canvas: HTMLCanvasElement | null) => {
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        const ctx = canvas.getContext("2d");
        if (!ctx || values.length < 2) return;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const width = rect.width;
        const height = rect.height;
        const paddingX = 8;
        const paddingY = 10;

        const min = activeHike.gpxData.elevationMin;
        const max = activeHike.gpxData.elevationMax;
        const span = Math.max(max - min, 1);

        const project = (idx: number): [number, number] => {
          const x = paddingX + (idx / (values.length - 1)) * (width - paddingX * 2);
          const y = paddingY + (1 - (values[idx] - min) / span) * (height - paddingY * 2);
          return [x, y];
        };

        ctx.clearRect(0, 0, width, height);

        ctx.beginPath();
        values.forEach((_, idx) => {
          const [x, y] = project(idx);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.lineTo(width - paddingX, height - paddingY);
        ctx.lineTo(paddingX, height - paddingY);
        ctx.closePath();
        ctx.fillStyle = "rgba(29,158,117,0.08)";
        ctx.fill();

        ctx.beginPath();
        values.forEach((_, idx) => {
          const [x, y] = project(idx);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = "rgba(29,158,117,0.25)";
        ctx.lineWidth = 1;
        ctx.stroke();

        const walkedIndex = Math.max(1, Math.floor(currentProgress * (values.length - 1)));
        ctx.beginPath();
        for (let i = 0; i <= walkedIndex; i += 1) {
          const [x, y] = project(i);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineTo(project(walkedIndex)[0], height - paddingY);
        ctx.lineTo(paddingX, height - paddingY);
        ctx.closePath();
        ctx.fillStyle = "rgba(29,158,117,0.3)";
        ctx.fill();

        ctx.beginPath();
        for (let i = 0; i <= walkedIndex; i += 1) {
          const [x, y] = project(i);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "#1D9E75";
        ctx.lineWidth = 2;
        ctx.stroke();

        activeHike.snapshots.forEach((snapshot) => {
          const idx = Math.min(values.length - 1, Math.floor(clamp01(snapshot.at) * (values.length - 1)));
          const [x, y] = project(idx);
          const active = currentProgress >= snapshot.at;
          ctx.fillStyle = active ? "#EF9F27" : "rgba(239,159,39,0.3)";
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        });

        const handleIdx = Math.max(0, Math.min(values.length - 1, Math.floor(currentProgress * (values.length - 1))));
        const [handleX, handleY] = project(handleIdx);

        ctx.strokeStyle = "rgba(29,158,117,0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(handleX, 3);
        ctx.lineTo(handleX, height - 3);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(handleX, handleY, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#1D9E75";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(handleX, handleY, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "#0d0f12";
        ctx.fill();
      };

      drawOnCanvas(desktopProfileCanvasRef.current);
      drawOnCanvas(mobileProfileCanvasRef.current);
    },
    [activeHike]
  );

  useEffect(() => {
    drawProfile(progress);
    const onResize = () => drawProfile(progress);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [drawProfile, progress]);

  const updateFromEvent = useCallback(
    (clientX: number, sourceCanvas?: HTMLCanvasElement | null) => {
      const canvasCandidates = [
        sourceCanvas,
        dragCanvasRef.current,
        desktopProfileCanvasRef.current,
        mobileProfileCanvasRef.current,
      ];
      const canvas = canvasCandidates.find((candidate) => {
        if (!candidate) return false;
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = clamp01((clientX - rect.left) / rect.width);
      applyProgress(ratio);
    },
    [applyProgress]
  );

  const drawSparkline = useCallback((canvas: HTMLCanvasElement, data: number[], active: boolean) => {
    const W = canvas.offsetWidth || 150;
    const H = 24;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx || data.length < 2) return;
    ctx.scale(dpr, dpr);
    const mn = Math.min(...data), mx = Math.max(...data), span = Math.max(mx - mn, 1);
    const proj = (i: number): [number, number] => [
      2 + (i / (data.length - 1)) * (W - 4),
      3 + (1 - (data[i] - mn) / span) * (H - 6),
    ];
    ctx.beginPath();
    data.forEach((_, i) => { const [x, y] = proj(i); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.lineTo(W - 2, H - 3); ctx.lineTo(2, H - 3); ctx.closePath();
    ctx.fillStyle = active ? "rgba(0,229,255,0.1)" : "rgba(255,255,255,0.04)";
    ctx.fill();
    ctx.beginPath();
    data.forEach((_, i) => { const [x, y] = proj(i); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.strokeStyle = active ? "#00e5ff" : "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, []);

  useEffect(() => {
    const onMove = (event: MouseEvent | TouchEvent) => {
      if (!draggingRef.current) return;
      if (event instanceof TouchEvent) {
        const touch = event.touches[0];
        if (!touch) return;
        updateFromEvent(touch.clientX);
        event.preventDefault();
        return;
      }
      updateFromEvent(event.clientX);
    };

    const onUp = () => {
      draggingRef.current = false;
      dragCanvasRef.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [updateFromEvent]);

  useEffect(() => {
    const shelf = shelfRef.current;
    if (!shelf) return;
    const update = () => {
      const trackH = shelf.offsetHeight - 16;
      const visibleRatio = shelf.offsetHeight / Math.max(1, shelf.scrollHeight);
      const scrollRatio = shelf.scrollTop / Math.max(1, shelf.scrollHeight - shelf.offsetHeight);
      const thumbH = Math.max(24, Math.floor(visibleRatio * trackH));
      const thumbTop = 8 + Math.floor(scrollRatio * (trackH - thumbH));
      setScrollThumbHeight(thumbH);
      setScrollThumbTop(thumbTop);
    };
    update();
    shelf.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      shelf.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const shelf = mobileShelfRef.current;
    if (!shelf) return;
    const update = () => {
      const trackW = shelf.offsetWidth;
      const visibleRatio = shelf.offsetWidth / Math.max(1, shelf.scrollWidth);
      const scrollRatio = shelf.scrollLeft / Math.max(1, shelf.scrollWidth - shelf.offsetWidth);
      const thumbW = Math.max(32, Math.floor(visibleRatio * trackW));
      const thumbLeft = Math.floor(scrollRatio * (trackW - thumbW));
      setMobileThumbWidth(thumbW);
      setMobileThumbLeft(thumbLeft);
    };
    update();
    shelf.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      shelf.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    if (snapshotCloseTimerRef.current !== null) {
      window.clearTimeout(snapshotCloseTimerRef.current);
      snapshotCloseTimerRef.current = null;
    }

    if (openSnapshotIndex !== null) {
      setRenderedSnapshotIndex(openSnapshotIndex);
      return;
    }

    if (renderedSnapshotIndex === null) return;

    snapshotCloseTimerRef.current = window.setTimeout(() => {
      setRenderedSnapshotIndex(null);
      snapshotCloseTimerRef.current = null;
    }, SNAPSHOT_CLOSE_MS);
  }, [openSnapshotIndex, renderedSnapshotIndex]);

  useEffect(() => {
    return () => {
      if (snapshotCloseTimerRef.current !== null) {
        window.clearTimeout(snapshotCloseTimerRef.current);
      }
    };
  }, []);

  const openSnapshot = activeHike && renderedSnapshotIndex !== null ? activeHike.snapshots[renderedSnapshotIndex] : null;
  const isSnapshotPanelOpen = openSnapshotIndex !== null;

  useEffect(() => {
    if (openSnapshotIndex !== null) return;
    setIsPhotoViewerOpen(false);
  }, [openSnapshotIndex]);

  useEffect(() => {
    if (!isPhotoViewerOpen) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPhotoViewerOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isPhotoViewerOpen]);

  const handleCloseSnapshot = useCallback((event?: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
    event?.preventDefault();
    setOpenSnapshotIndex(null);
  }, []);

  const handleSnapshotImageLoad = useCallback((src: string, event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (!naturalWidth || !naturalHeight) return;

    const ratio = naturalWidth / naturalHeight;
    setSnapshotAspectRatios((current) => {
      if (current[src] === ratio) return current;
      return { ...current, [src]: ratio };
    });
  }, []);

  if (!activeHike) {
    return (
      <div className={styles.emptyWrap}>
        <div className={styles.emptyText}>No trails available yet.</div>
      </div>
    );
  }

  const openSnapshotRatio = openSnapshot ? snapshotAspectRatios[openSnapshot.src] ?? null : null;
  const openSnapshotPanelStyle = snapshotCardStyle(openSnapshotRatio);

  return (
    <>
      <Script src="https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js" strategy="afterInteractive" />
      <nav className={styles.trailsNav}>
        <div className={styles.trailsNavTitle}>/trails</div>
        <Link href="/" className={styles.trailsNavBack}>← back to chakshu.dev</Link>
      </nav>
      <div className={styles.root}>
        <div className={styles.mainRow}>
          <div className={styles.scrollTrack} aria-hidden="true">
            <div
              className={styles.scrollThumb}
              style={{ top: `${scrollThumbTop}px`, height: `${scrollThumbHeight}px` }}
            />
          </div>
          <aside className={styles.shelf} ref={shelfRef}>
            <div className={styles.shelfHead}>trails</div>
            {hikes.map((hike, idx) => (
              <button
                key={hike.id}
                type="button"
                className={`${styles.shelfCard} ${idx === activeIndex ? styles.shelfCardActive : ""}`}
                onClick={() => {
                  if (idx === activeIndex) return;
                  setActiveIndex(idx);
                  setOpenSnapshotIndex(null);
                }}
              >
                <div className={styles.shelfCardName}>{hike.name}</div>
                <div className={styles.shelfCardLoc}>{hike.location}</div>
                <canvas
                  className={styles.shelfSparkline}
                  ref={el => { if (el) drawSparkline(el, hike.gpxData.elevationFt, idx === activeIndex); }}
                />
                <div className={styles.shelfCardStats}>
                  <div className={styles.shelfStat}>
                    <span className={styles.shelfStatVal}>{hike.distance}</span>
                    <span className={styles.shelfStatKey}>dist</span>
                  </div>
                  <div className={styles.shelfStat}>
                    <span className={styles.shelfStatVal}>{hike.elevation_gain}</span>
                    <span className={styles.shelfStatKey}>gain</span>
                  </div>
                  <div className={styles.shelfStat}>
                    <span className={styles.shelfStatVal}>{hike.date}</span>
                    <span className={styles.shelfStatKey}>date</span>
                  </div>
                </div>
              </button>
            ))}
          </aside>

          <section className={styles.mapPane}>
            <div className={styles.trailNameBadge}>
              <div className={styles.trailNameDot} />
              <span className={styles.trailNameText}>{activeHike.name}</span>
              {activeHike.alltrails_url ? (
                <a
                  href={activeHike.alltrails_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.allTrailsLink}
                  aria-label={`Open ${activeHike.name} on AllTrails`}
                >
                  <svg className={styles.allTrailsIcon} viewBox="0 0 62 48" aria-hidden="true" focusable="false">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M50.265 14.825c-1.688-3.224-2.993-4.761-4.687-4.761-1.891 0-2.724 1-3.865 2.79-.92 1.2-1.809 2.843-3.289 2.68-1.562-.165-2.466-3.857-3.645-6.947C33.162 4.376 32.23 0 29.544 0c-1.532 0-2.872 1.395-4.95 4.515L3.13 37.428C.664 41.549-1.4 44.42 1.212 47.12c3.07 2.953 10.278-2.215 15.212-5.333 4.933-3.118 9.976-6.153 17.102-5.99 9.593.22 14.253 9.846 20.063 11.678 3.947 1.258 7.565-.191 8.333-4.266.452-2.24-.332-4.414-1.415-6.733L50.265 14.825Zm-.658 19.305c-1.946 1.449-4.66-.876-6.414-1.86-1.863-1.04-5.015-3.528-10.661-3.446-4.605.055-7.1 1.778-9.84 3.637-5.948 4.048-11.32 8.752-12.855 6.318-.986-1.56 1.672-4.677 7.921-14.412 4.44-6.92 7.568-12.444 9.785-12.444 2.45 0 2.588 2.404 2.96 4.868.705 3.925 2.623 5.968 5.115 6.29 2.793.378 5.207-1.966 7.126-1.941 1.792.038 2.971 2.633 4.451 5.34 1.875 3.364 3.832 6.583 2.412 7.65Z"
                    />
                  </svg>
                </a>
              ) : null}
            </div>
            {!isMobile && <div className={styles.mapCanvas} ref={mapContainerRef} />}
            <div className={styles.statsToggleWrap}>
              <button
                type="button"
                className={styles.statsToggleBtn}
                onClick={() => setStatsOpen(prev => !prev)}
                aria-label="Toggle trail stats"
              >
                <span className={`${styles.hamLine} ${statsOpen ? styles.hamLine1Open : ""}`} />
                <span className={`${styles.hamLine} ${statsOpen ? styles.hamLine2Open : ""}`} />
                <span className={`${styles.hamLine} ${statsOpen ? styles.hamLine3Open : ""}`} />
              </button>
              <div className={`${styles.statsPanel} ${statsOpen ? styles.statsPanelOpen : ""}`}>
                <div className={styles.statRow}>
                  <span className={styles.statKey}>distance</span>
                  <span className={styles.statValue}>{activeHike.distance}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statKey}>elevation_gain</span>
                  <span className={styles.statValue}>{activeHike.elevation_gain}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statKey}>high_point</span>
                  <span className={styles.statValue}>{activeHike.high_point}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statKey}>difficulty</span>
                  <span className={styles.statValue}>{activeHike.difficulty}</span>
                </div>
              </div>
            </div>

            <aside
              className={`${styles.photoPanel} ${isSnapshotPanelOpen ? styles.photoPanelOpen : ""}`}
              style={openSnapshot ? openSnapshotPanelStyle : undefined}
            >
              {openSnapshot ? (
                <>
                  <button
                    type="button"
                    className={styles.photoClose}
                    onClick={handleCloseSnapshot}
                    onPointerDown={handleCloseSnapshot}
                    aria-label="Close snapshot"
                  >
                    ×
                  </button>
                  <button
                    type="button"
                    className={styles.photoMedia}
                    onClick={() => setIsPhotoViewerOpen(true)}
                    aria-label={`Open full-size photo of ${openSnapshot.caption}`}
                  >
                    <span className={styles.photoMediaFrame}>
                      <Image
                        src={openSnapshot.src}
                        alt={openSnapshot.caption}
                        fill
                        sizes="(max-width: 768px) calc(100vw - 52px), 272px"
                        style={{ objectFit: "contain" }}
                        onLoad={(event) => handleSnapshotImageLoad(openSnapshot.src, event)}
                      />
                    </span>
                    <span className={styles.photoExpandHint}>tap for full view</span>
                  </button>
                  <div className={styles.photoMeta}>
                    <div className={styles.photoCaption}>{openSnapshot.caption}</div>
                    <div className={styles.photoElevation}>{openSnapshot.elevation}</div>
                    <div className={styles.photoProgress}>{Math.round(openSnapshot.at * 100)}% into the trail</div>
                  </div>
                </>
              ) : null}
            </aside>
          </section>
        </div>

        <div className={styles.scrubber}>
          <div className={styles.scrubberLabels}>
            <div>{formatFeet(currentElevation)}</div>
            <div
              className={styles.dragHint}
              style={{ opacity: hasInteracted ? 0 : 1 }}
            >
              — drag to walk the trail —
            </div>
            <div>{contextLabel(progress, activeHike.snapshots)}</div>
          </div>
          <canvas
            ref={desktopProfileCanvasRef}
            className={styles.profileCanvas}
            onMouseDown={(event) => {
              dragCanvasRef.current = event.currentTarget;
              draggingRef.current = true;
              if (!hasInteracted) setHasInteracted(true);
              updateFromEvent(event.clientX, event.currentTarget);
            }}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (!touch) return;
              dragCanvasRef.current = event.currentTarget;
              draggingRef.current = true;
              if (!hasInteracted) setHasInteracted(true);
              updateFromEvent(touch.clientX, event.currentTarget);
            }}
            onClick={(event) => {
              if (!hasInteracted) setHasInteracted(true);
              updateFromEvent(event.clientX, event.currentTarget);
            }}
          />
        </div>
      </div>

      <div className={styles.mobileRoot}>
        <div className={styles.mobileScrollTrack}>
          <div
            className={styles.mobileScrollThumb}
            style={{ left: `${mobileThumbLeft}px`, width: `${mobileThumbWidth}px` }}
          />
        </div>

        <div className={styles.mobileShelf} ref={mobileShelfRef}>
          {hikes.map((hike, idx) => (
            <button
              key={hike.id}
              type="button"
              className={`${styles.mobileCard} ${idx === activeIndex ? styles.mobileCardActive : ""}`}
              onClick={() => {
                if (idx === activeIndex) return;
                setActiveIndex(idx);
                setOpenSnapshotIndex(null);
              }}
            >
              <div className={styles.mobileCardName}>{hike.name}</div>
              <div className={styles.mobileCardLoc}>{hike.location}</div>
              <canvas
                className={styles.mobileCardSparkline}
                ref={el => { if (el) drawSparkline(el, hike.gpxData.elevationFt, idx === activeIndex); }}
              />
              <div className={styles.mobileCardStats}>
                <div className={styles.mobileStatItem}>
                  <span className={styles.mobileStatVal}>{hike.distance}</span>
                  <span className={styles.mobileStatKey}>dist</span>
                </div>
                <div className={styles.mobileStatItem}>
                  <span className={styles.mobileStatVal}>{hike.elevation_gain}</span>
                  <span className={styles.mobileStatKey}>gain</span>
                </div>
                <div className={styles.mobileStatItem}>
                  <span className={styles.mobileStatVal}>{hike.date}</span>
                  <span className={styles.mobileStatKey}>date</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className={styles.mobileActiveInfo}>
          <div className={styles.mobileActiveDot} />
          <div className={styles.mobileActiveName}>{activeHike.name}</div>
          <div className={styles.mobileActiveLoc}>{activeHike.location}</div>
        </div>

        <div className={styles.mobileMapWrap}>
          {isMobile && <div className={styles.mobileMapCanvas} ref={mapContainerRef} />}
          <div className={styles.statsToggleWrap}>
            <button
              type="button"
              className={styles.statsToggleBtn}
              onClick={() => setStatsOpen(prev => !prev)}
              aria-label="Toggle trail stats"
            >
              <span className={`${styles.hamLine} ${statsOpen ? styles.hamLine1Open : ""}`} />
              <span className={`${styles.hamLine} ${statsOpen ? styles.hamLine2Open : ""}`} />
              <span className={`${styles.hamLine} ${statsOpen ? styles.hamLine3Open : ""}`} />
            </button>
            <div className={`${styles.statsPanel} ${statsOpen ? styles.statsPanelOpen : ""}`}>
              <div className={styles.statRow}>
                <span className={styles.statKey}>distance</span>
                <span className={styles.statValue}>{activeHike.distance}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statKey}>elevation_gain</span>
                <span className={styles.statValue}>{activeHike.elevation_gain}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statKey}>high_point</span>
                <span className={styles.statValue}>{activeHike.high_point}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statKey}>difficulty</span>
                <span className={styles.statValue}>{activeHike.difficulty}</span>
              </div>
            </div>
          </div>
          {openSnapshot ? (
            <aside
              className={`${styles.photoPanel} ${isSnapshotPanelOpen ? styles.photoPanelOpen : ""}`}
              style={openSnapshotPanelStyle}
            >
              <button
                type="button"
                className={styles.photoClose}
                onClick={handleCloseSnapshot}
                onPointerDown={handleCloseSnapshot}
                aria-label="Close snapshot"
              >
                ×
              </button>
              <button
                type="button"
                className={styles.photoMedia}
                onClick={() => setIsPhotoViewerOpen(true)}
                aria-label={`Open full-size photo of ${openSnapshot.caption}`}
              >
                <span className={styles.photoMediaFrame}>
                  <Image
                    src={openSnapshot.src}
                    alt={openSnapshot.caption}
                    fill
                    sizes="(max-width: 768px) calc(100vw - 52px), 272px"
                    style={{ objectFit: "contain" }}
                    onLoad={(event) => handleSnapshotImageLoad(openSnapshot.src, event)}
                  />
                </span>
                <span className={styles.photoExpandHint}>tap for full view</span>
              </button>
              <div className={styles.photoMeta}>
                <div className={styles.photoCaption}>{openSnapshot.caption}</div>
                <div className={styles.photoElevation}>{openSnapshot.elevation}</div>
                <div className={styles.photoProgress}>{Math.round(openSnapshot.at * 100)}% into the trail</div>
              </div>
            </aside>
          ) : null}
        </div>

        <div className={styles.mobileScrubber}>
          <div className={styles.scrubberLabels}>
            <div>{formatFeet(currentElevation)}</div>
            <div className={styles.dragHint} style={{ opacity: hasInteracted ? 0 : 1 }}>
              — drag to walk —
            </div>
            <div>{contextLabel(progress, activeHike.snapshots)}</div>
          </div>
          <canvas
            ref={mobileProfileCanvasRef}
            className={styles.mobileProfileCanvas}
            onMouseDown={(event) => {
              dragCanvasRef.current = event.currentTarget;
              draggingRef.current = true;
              if (!hasInteracted) setHasInteracted(true);
              updateFromEvent(event.clientX, event.currentTarget);
            }}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              if (!touch) return;
              dragCanvasRef.current = event.currentTarget;
              draggingRef.current = true;
              if (!hasInteracted) setHasInteracted(true);
              updateFromEvent(touch.clientX, event.currentTarget);
            }}
            onClick={(event) => {
              if (!hasInteracted) setHasInteracted(true);
              updateFromEvent(event.clientX, event.currentTarget);
            }}
          />
        </div>

        <div className={styles.mobileHomeBar} />
      </div>
      {isPhotoViewerOpen && openSnapshot ? (
        <div
          className={styles.photoViewerBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={`Full view of ${openSnapshot.caption}`}
          onClick={() => setIsPhotoViewerOpen(false)}
        >
          <div className={styles.photoViewerDialog} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={styles.photoViewerClose}
              onClick={() => setIsPhotoViewerOpen(false)}
              aria-label="Close full-size photo"
            >
              ×
            </button>
            <div className={styles.photoViewerFrame}>
              <Image
                src={openSnapshot.src}
                alt={openSnapshot.caption}
                fill
                priority
                sizes="(max-width: 768px) 100vw, 90vw"
                style={{ objectFit: "contain" }}
              />
            </div>
            <div className={styles.photoViewerMeta}>
              <div className={styles.photoCaption}>{openSnapshot.caption}</div>
              <div className={styles.photoElevation}>{openSnapshot.elevation}</div>
              <div className={styles.photoProgress}>{Math.round(openSnapshot.at * 100)}% into the trail</div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
