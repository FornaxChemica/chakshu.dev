"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Hike } from "../../../types/hikes";

type Props = {
  hike: Hike;
  trail: [number, number][];
  snapshotPositions: number[];
  trailsLogged: number;
  totalMiles: number;
  totalElevation: number;
  statesVisited: number;
  allHikes: { id: string; name: string }[];
};

type Tone = "promptDollar" | "promptArrow" | "comment" | "key" | "value" | "valueAccent";
type Segment = { text: string; tone: Tone };
type LogEntry = { kind: "line"; segments: Segment[] } | { kind: "spacer" } | { kind: "divider" };

const DRAW_DURATION_MS = 1500;
const DOT_POP_MS = 300;
const TYPE_SPEED_MS = 18;
const LINE_PAUSE_MS = 120;

function easeInOut(value: number): number {
  return 0.5 * (1 - Math.cos(Math.PI * value));
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function lineLength(entry: LogEntry): number {
  if (entry.kind !== "line") return 0;
  return entry.segments.reduce((sum, segment) => sum + segment.text.length, 0);
}

function renderSegments(entry: Extract<LogEntry, { kind: "line" }>, charCount: number) {
  let remaining = charCount;
  return entry.segments.map((segment, idx) => {
    if (remaining <= 0) return null;
    const piece = segment.text.slice(0, remaining);
    remaining -= piece.length;
    return (
      <span key={`${segment.tone}-${idx}`} className={`log-${segment.tone}`}>
        {piece}
      </span>
    );
  });
}

export default function TrailsTeaserClient({
  hike,
  trail,
  snapshotPositions,
  trailsLogged,
  totalMiles,
  totalElevation,
  statesVisited,
  allHikes,
}: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastCanvasSizeRef = useRef<{ width: number; height: number } | null>(null);
  const dotAppearedAtRef = useRef<Map<number, number>>(new Map());
  const [snapshotsSeen, setSnapshotsSeen] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [pulsePosition, setPulsePosition] = useState<{ x: number; y: number } | null>(null);
  const [inView, setInView] = useState(false);
  const [typedLineIndex, setTypedLineIndex] = useState(0);
  const [typedCharCount, setTypedCharCount] = useState(0);
  const [typingDone, setTypingDone] = useState(false);

  const loggedCount = trailsLogged || allHikes.length;

  const logEntries = useMemo<LogEntry[]>(
    () => [
      {
        kind: "line",
        segments: [
          { text: "$ ", tone: "promptDollar" },
          { text: "cat stats.json", tone: "value" },
        ],
      },
      { kind: "line", segments: [{ text: "// lifetime · all trails", tone: "comment" }] },
      {
        kind: "line",
        segments: [
          { text: "> ", tone: "promptArrow" },
          { text: "trails_logged:     ", tone: "key" },
          { text: String(loggedCount), tone: "value" },
        ],
      },
      {
        kind: "line",
        segments: [
          { text: "> ", tone: "promptArrow" },
          { text: "total_miles:       ", tone: "key" },
          { text: `${totalMiles} mi`, tone: "value" },
        ],
      },
      {
        kind: "line",
        segments: [
          { text: "> ", tone: "promptArrow" },
          { text: "elevation_gained:  ", tone: "key" },
          { text: `${totalElevation.toLocaleString()} ft`, tone: "value" },
        ],
      },
      {
        kind: "line",
        segments: [
          { text: "> ", tone: "promptArrow" },
          { text: "states_visited:    ", tone: "key" },
          { text: String(statesVisited), tone: "value" },
        ],
      },
      { kind: "divider" },
      {
        kind: "line",
        segments: [
          { text: "$ ", tone: "promptDollar" },
          { text: "cat last_expedition.json", tone: "value" },
        ],
      },
      { kind: "line", segments: [{ text: `// ${hike.date} · ${hike.location}`, tone: "comment" }] },
      {
        kind: "line",
        segments: [
          { text: "> ", tone: "promptArrow" },
          { text: "trail:             ", tone: "key" },
          { text: `"${hike.name}"`, tone: "value" },
        ],
      },
      {
        kind: "line",
        segments: [
          { text: "> ", tone: "promptArrow" },
          { text: "distance:          ", tone: "key" },
          { text: hike.distance, tone: "value" },
        ],
      },
      {
        kind: "line",
        segments: [
          { text: "> ", tone: "promptArrow" },
          { text: "elevation_gain:    ", tone: "key" },
          { text: hike.elevation_gain, tone: "value" },
        ],
      },
      {
        kind: "line",
        segments: [
          { text: "> ", tone: "promptArrow" },
          { text: "high_point:        ", tone: "key" },
          { text: hike.high_point, tone: "value" },
        ],
      },
      {
        kind: "line",
        segments: [
          { text: "> ", tone: "promptArrow" },
          { text: "snapshots:         ", tone: "key" },
          { text: `${hike.snapshots.length} along this route`, tone: "valueAccent" },
        ],
      },
      { kind: "spacer" },
    ],
    [hike, loggedCount, statesVisited, totalElevation, totalMiles]
  );

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
    lastCanvasSizeRef.current = { width: cssWidth, height: cssHeight };
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
    const node = cardRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;
        setInView(true);
        observer.disconnect();
      },
      { threshold: 0.25 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;

    const onResize = () => {
      const canvas = canvasRef.current;
      const parent = canvas?.parentElement;
      if (!canvas || !parent) return;

      const rect = parent.getBoundingClientRect();
      const nextWidth = Math.floor(rect.width);
      const nextHeight = Math.floor(rect.height);
      const prev = lastCanvasSizeRef.current;

      if (!prev) {
        restartAnimation();
        return;
      }

      const widthChanged = Math.abs(nextWidth - prev.width) > 1;
      const heightChanged = Math.abs(nextHeight - prev.height) > 48;

      if (widthChanged || heightChanged) {
        restartAnimation();
      }
    };

    restartAnimation();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [inView, restartAnimation]);

  useEffect(() => {
    if (!inView) return;

    let cancelled = false;
    let timer: number | null = null;
    let lineIdx = 0;
    let charIdx = 0;

    setTypedLineIndex(0);
    setTypedCharCount(0);
    setTypingDone(false);

    const schedule = (delay: number, fn: () => void) => {
      timer = window.setTimeout(fn, delay);
    };

    const step = () => {
      if (cancelled) return;

      if (lineIdx >= logEntries.length) {
        setTypingDone(true);
        return;
      }

      const current = logEntries[lineIdx];
      if (current.kind !== "line") {
        lineIdx += 1;
        setTypedLineIndex(lineIdx);
        setTypedCharCount(0);
        schedule(LINE_PAUSE_MS, step);
        return;
      }

      const total = lineLength(current);
      if (charIdx < total) {
        charIdx += 1;
        setTypedLineIndex(lineIdx);
        setTypedCharCount(charIdx);
        schedule(TYPE_SPEED_MS, step);
        return;
      }

      lineIdx += 1;
      charIdx = 0;
      setTypedLineIndex(lineIdx);
      setTypedCharCount(0);
      schedule(LINE_PAUSE_MS, step);
    };

    schedule(220, step);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [inView, logEntries]);

  return (
    <div className="trails-card" ref={cardRef}>
      <div className="term-bar">
        <span className="term-dot red" />
        <span className="term-dot yellow" />
        <span className="term-dot green" />
        <span className="term-title">trail_log.sh</span>
      </div>

      <div className="trails-body">
        <div className="trails-log">
          {logEntries.map((entry, idx) => {
            if (entry.kind === "divider") {
              const show = typingDone || idx < typedLineIndex;
              return <div key={`divider-${idx}`} className="log-divider" style={{ opacity: show ? 1 : 0 }} />;
            }

            if (entry.kind === "spacer") {
              const show = typingDone || idx < typedLineIndex;
              return <div key={`spacer-${idx}`} className="log-line">{show ? " " : ""}</div>;
            }

            const fullLength = lineLength(entry);
            const isDone = typingDone || idx < typedLineIndex;
            const isCurrent = !typingDone && idx === typedLineIndex;
            const chars = isDone ? fullLength : isCurrent ? typedCharCount : 0;

            return (
              <div key={`line-${idx}`} className="log-line">
                {renderSegments(entry, chars)}
                {isCurrent ? <span className="log-cursor" /> : null}
              </div>
            );
          })}

          <div className="trails-cta-row">
            <a href="/trails" className="btn-cal">
              OPEN /TRAILS <i className="ph ph-arrow-up-right" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="trails-map-side">
          <div className="trails-map-canvas-wrap">
            <canvas ref={canvasRef} className="trails-map-canvas" />
            {completed && pulsePosition ? (
              <div className="trails-dot-pulse" style={{ left: pulsePosition.x, top: pulsePosition.y }} />
            ) : null}
          </div>
          <div className="trails-map-meta">
            <span>{hike.location.toLowerCase()}</span>
            <span>{hike.date.toLowerCase()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
