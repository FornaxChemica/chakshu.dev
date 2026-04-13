"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Hike } from "../../../types/hikes";

type TrailsTeaserClientProps = {
  hike: Hike;
  trail: [number, number][];
  allHikes: { id: string; name: string }[];
  snapshotPositions: number[];
};

const DRAW_DURATION_MS = 1500;
const DOT_POP_MS = 300;

function easeInOut(value: number): number {
  return 0.5 * (1 - Math.cos(Math.PI * value));
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export default function TrailsTeaserClient({ hike, trail, allHikes, snapshotPositions }: TrailsTeaserClientProps) {
  const cardRef = useRef<HTMLAnchorElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const locationRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dotAppearedAtRef = useRef<Map<number, number>>(new Map());
  const [snapshotsSeen, setSnapshotsSeen] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [pulsePosition, setPulsePosition] = useState<{ x: number; y: number } | null>(null);

  const otherHikes = useMemo(() => allHikes.filter((entry) => entry.id !== hike.id), [allHikes, hike.id]);

  const drawFrame = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, progress: number, now: number) => {
      const padding = 18;
      const innerWidth = Math.max(width - padding * 2, 1);
      const innerHeight = Math.max(height - padding * 2, 1);

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#161b26";
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i += 1) {
        const baseY = ((i + 1) / 9) * height;
        ctx.beginPath();
        for (let x = 0; x <= width; x += 4) {
          const y = baseY + Math.sin(x / 28 + i * 0.7) * 3;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      const project = (point: [number, number]): [number, number] => {
        return [padding + point[0] * innerWidth, padding + point[1] * innerHeight];
      };

      if (trail.length > 1) {
        ctx.setLineDash([5, 6]);
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        trail.forEach((point, idx) => {
          const [x, y] = project(point);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);

        const maxIndex = trail.length - 1;
        const activeIndex = Math.max(1, Math.floor(progress * maxIndex));
        ctx.strokeStyle = "#1D9E75";
        ctx.lineWidth = 2.4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        for (let i = 0; i <= activeIndex; i += 1) {
          const [x, y] = project(trail[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const fractional = progress * maxIndex - activeIndex;
        if (activeIndex < maxIndex) {
          const [x1, y1] = project(trail[activeIndex]);
          const [x2, y2] = project(trail[activeIndex + 1]);
          ctx.lineTo(x1 + (x2 - x1) * fractional, y1 + (y2 - y1) * fractional);
        }
        ctx.stroke();

        const first = project(trail[0]);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(first[0], first[1], 5.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#1D9E75";
        ctx.beginPath();
        ctx.arc(first[0], first[1], 2.8, 0, Math.PI * 2);
        ctx.fill();

        let appearedCount = 0;
        snapshotPositions.forEach((at, idx) => {
          const pos = clamp01(at);
          if (progress >= pos) {
            appearedCount += 1;
            if (!dotAppearedAtRef.current.has(idx)) {
              dotAppearedAtRef.current.set(idx, now);
            }
          }

          const show = progress >= pos || dotAppearedAtRef.current.has(idx);
          if (!show) return;

          const pointIndex = Math.min(Math.floor(pos * maxIndex), maxIndex);
          const [dotX, dotY] = project(trail[pointIndex]);
          const appearedAt = dotAppearedAtRef.current.get(idx) ?? now;
          const elapsed = now - appearedAt;
          const popT = Math.min(1, elapsed / DOT_POP_MS);
          const scale = popT < 0.5 ? 1 + popT * 1.6 : 1.8 - (popT - 0.5) * 1.6;

          ctx.fillStyle = "#EF9F27";
          ctx.beginPath();
          ctx.arc(dotX, dotY, 3.5 * scale, 0, Math.PI * 2);
          ctx.fill();
        });

        setSnapshotsSeen((prev) => (prev === appearedCount ? prev : appearedCount));
      }
    },
    [snapshotPositions, trail]
  );

  const restartAnimation = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    dotAppearedAtRef.current.clear();
    setSnapshotsSeen(0);
    setCompleted(false);
    setPulsePosition(null);

    const parent = canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${Math.floor(rect.width)}px`;
    canvas.style.height = `${Math.floor(rect.height)}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cssWidth = Math.floor(rect.width);
    const cssHeight = Math.floor(rect.height);
    const start = performance.now();

    const frame = (now: number) => {
      const elapsed = now - start;
      const linear = clamp01(elapsed / DRAW_DURATION_MS);
      const eased = easeInOut(linear);

      drawFrame(ctx, cssWidth, cssHeight, eased, now);

      if (linear < 1) {
        rafRef.current = window.requestAnimationFrame(frame);
        return;
      }

      setCompleted(true);
      if (trail.length > 1 && snapshotPositions.length > 0) {
        const padding = 18;
        const innerWidth = Math.max(cssWidth - padding * 2, 1);
        const innerHeight = Math.max(cssHeight - padding * 2, 1);
        const lastAt = clamp01(snapshotPositions[snapshotPositions.length - 1]);
        const maxIndex = trail.length - 1;
        const idx = Math.min(maxIndex, Math.floor(lastAt * maxIndex));
        const point = trail[idx];
        setPulsePosition({
          x: padding + point[0] * innerWidth,
          y: padding + point[1] * innerHeight,
        });
      }
    };

    rafRef.current = window.requestAnimationFrame(frame);
  }, [drawFrame, snapshotPositions, trail]);

  useEffect(() => {
    const onResize = () => restartAnimation();

    restartAnimation();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [restartAnimation]);

  return (
    <Link href="/trails" className="trails-teaser" ref={cardRef} onMouseEnter={restartAnimation}>
      <div className="trails-top">
        <div className="trails-map-wrap">
          <canvas ref={canvasRef} className="trails-map-canvas" />
          <div className="trails-map-location" ref={locationRef}>{hike.location}</div>
          {completed && pulsePosition ? (
            <div className="trails-dot-pulse" style={{ left: pulsePosition.x, top: pulsePosition.y }} />
          ) : null}
        </div>

        <div className="trails-stats">
          <div className="trails-most-recent">MOST RECENT · {hike.date}</div>
          <h3 className="trails-name">{hike.name}</h3>
          <div className="trails-sub">{hike.location}</div>

          <div className="trails-stat-row"><span className="trails-stat-key">distance</span><span className="trails-stat-val">{hike.distance}</span></div>
          <div className="trails-stat-row"><span className="trails-stat-key">elevation_gain</span><span className="trails-stat-val">{hike.elevation_gain}</span></div>
          <div className="trails-stat-row"><span className="trails-stat-key">high_point</span><span className="trails-stat-val">{hike.high_point}</span></div>
          <div className="trails-stat-row">
            <span className="trails-stat-key">snapshots</span>
            <span className="trails-stat-val trails-snapshot-count">
              {snapshotsSeen === 0 ? "-" : `${snapshotsSeen} along this route`}
            </span>
          </div>
        </div>
      </div>

      <div className="trails-bottom">
        <div className="trails-chip-row">
          <span className="trails-chip-label">all trails -&gt;</span>
          {otherHikes.map((entry) => (
            <span key={entry.id} className="trails-chip">{entry.name}</span>
          ))}
        </div>
        <div className="music-teaser-arrow trails-walk-btn">
          Walk the trail <i className="ph ph-arrow-up-right" aria-hidden="true" />
        </div>
      </div>
    </Link>
  );
}
