"use client";

import { useEffect } from "react";

type Ship = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: Array<{ x: number; y: number }>;
  hue: number;
  id: string;
  alive: boolean;
  age: number;
};

declare global {
  interface Window {
    storage?: {
      get: (key: string, shared?: boolean) => Promise<{ value: string } | null>;
      set: (key: string, value: string, shared?: boolean) => Promise<void>;
      list: (prefix: string, shared?: boolean) => Promise<{ keys: string[] }>;
    };
  }
}

export default function OrbitalClient() {
  useEffect(() => {
    const canvas = document.getElementById("orb-canvas") as HTMLCanvasElement | null;
    const wrap = document.getElementById("orbital");
    const idEl = document.getElementById("orbital-id");
    const countEl = document.getElementById("orbital-count");
    const hintEl = document.getElementById("orb-hint");

    if (!canvas || !wrap || !idEl || !countEl || !hintEl) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const sharedStorage = Boolean(
      window.storage &&
        typeof window.storage.get === "function" &&
        typeof window.storage.set === "function" &&
        typeof window.storage.list === "function"
    );

    const G = 850;
    const TRAIL_LEN = 140;
    const MAX_LOCAL = 14;
    const SYNC_MS = 400;
    const EXPIRE_MS = 9000;

    let W = 0;
    let H = 0;
    let starX = 0;
    let starY = 0;
    let myId: string | null = null;
    let launchCount = 0;
    let localShips: Ship[] = [];
    let remoteShips: Record<string, Ship> = {};
    let dragging = false;
    let dragStart: { x: number; y: number } | null = null;
    let mousePos: { x: number; y: number } | null = null;
    let pulse = 0;
    let raf = 0;
    let syncTimer: number | null = null;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      W = canvas.width = r.width;
      H = canvas.height = 480;
      starX = W / 2;
      starY = H / 2;
    };

    const hsl = (h: number, s: number, l: number, a: number) => `hsla(${h},${s}%,${l}%,${a})`;

    const createShip = (x: number, y: number, vx: number, vy: number, id: string, hue?: number): Ship => ({
      x,
      y,
      vx,
      vy,
      trail: [],
      hue: hue ?? Math.random() * 60 + 170,
      id,
      alive: true,
      age: 0,
    });

    const physics = (s: Ship) => {
      const dx = starX - s.x;
      const dy = starY - s.y;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2);
      if (d < 10) {
        s.alive = false;
        return;
      }
      const f = G / d2;
      s.vx += f * (dx / d) * 0.016;
      s.vy += f * (dy / d) * 0.016;
      s.x += s.vx;
      s.y += s.vy;
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > TRAIL_LEN) s.trail.shift();
      s.age += 1;
      if (s.x < -300 || s.x > W + 300 || s.y < -300 || s.y > H + 300) s.alive = false;
    };

    const drawTrail = (s: Ship, alpha: number) => {
      const t = s.trail;
      for (let i = 1; i < t.length; i += 1) {
        const p = i / t.length;
        ctx.beginPath();
        ctx.moveTo(t[i - 1].x, t[i - 1].y);
        ctx.lineTo(t[i].x, t[i].y);
        ctx.strokeStyle = hsl(s.hue, 75, 68, p * 0.65 * alpha);
        ctx.lineWidth = p * 1.8;
        ctx.stroke();
      }
      if (s.alive && s.trail.length) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = hsl(s.hue, 85, 88, alpha);
        ctx.fill();
      }
    };

    const drawRemoteLabel = (s: Ship) => {
      if (!s.trail.length) return;
      ctx.font = '9px "JetBrains Mono",monospace';
      ctx.fillStyle = hsl(s.hue, 55, 65, 0.5);
      ctx.textAlign = "left";
      ctx.fillText(s.id.split(":")[0], s.x + 5, s.y - 5);
    };

    const drawStar = () => {
      pulse += 0.02;
      const r = 13 + Math.sin(pulse) * 1.5;
      const g = ctx.createRadialGradient(starX, starY, 0, starX, starY, r * 4);
      g.addColorStop(0, "rgba(0,229,255,0.12)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(starX, starY, r * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(starX, starY, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,229,255,0.85)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(starX, starY, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
    };

    const drawGrid = () => {
      ctx.strokeStyle = "rgba(0,229,255,0.022)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    };

    const drawDrag = () => {
      if (!dragging || !dragStart || !mousePos) return;
      const dx = dragStart.x - mousePos.x;
      const dy = dragStart.y - mousePos.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = "rgba(0,229,255,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dragStart.x, dragStart.y);
      ctx.lineTo(mousePos.x, mousePos.y);
      ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(dragStart.x, dragStart.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,229,255,0.7)";
      ctx.fill();
      ctx.font = '10px "JetBrains Mono",monospace';
      ctx.fillStyle = "rgba(0,229,255,0.5)";
      ctx.textAlign = "left";
      ctx.fillText(`v = ${(len * 0.012).toFixed(2)}`, mousePos.x + 8, mousePos.y - 6);
    };

    const loop = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#080808";
      ctx.fillRect(0, 0, W, H);
      drawGrid();
      localShips = localShips.filter((s) => s.alive);
      localShips.forEach(physics);
      Object.values(remoteShips).forEach((s) => {
        drawTrail(s, 0.55);
        drawRemoteLabel(s);
      });
      localShips.forEach((s) => drawTrail(s, 1));
      drawStar();
      drawDrag();
      const total = localShips.length + Object.keys(remoteShips).length;
      countEl.textContent = `objects in field: ${total}`;
      raf = window.requestAnimationFrame(loop);
    };

    const getPos = (event: MouseEvent | TouchEvent) => {
      const r = canvas.getBoundingClientRect();
      const src = "touches" in event ? event.touches[0] : event;
      return { x: src.clientX - r.left, y: src.clientY - r.top };
    };

    const launch = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      if (!myId) return;
      const dx = (from.x - to.x) * 0.012;
      const dy = (from.y - to.y) * 0.012;
      if (localShips.length < MAX_LOCAL) {
        launchCount += 1;
        localShips.push(createShip(from.x, from.y, dx, dy, `${myId}:${launchCount}`));
      }
    };

    const onMouseDown = (event: MouseEvent) => {
      const p = getPos(event);
      const dx = p.x - starX;
      const dy = p.y - starY;
      if (dx * dx + dy * dy < 900) return;
      dragging = true;
      dragStart = p;
      mousePos = p;
    };

    const onMouseMove = (event: MouseEvent) => {
      if (dragging) mousePos = getPos(event);
    };

    const onMouseUp = (event: MouseEvent) => {
      if (!dragging || !dragStart) return;
      launch(dragStart, getPos(event));
      dragging = false;
      dragStart = null;
      mousePos = null;
    };

    const onTouchStart = (event: TouchEvent) => {
      event.preventDefault();
      const p = getPos(event);
      dragging = true;
      dragStart = p;
      mousePos = p;
    };

    const onTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      if (dragging) mousePos = getPos(event);
    };

    const onTouchEnd = () => {
      if (!dragging || !dragStart) return;
      launch(dragStart, mousePos || dragStart);
      dragging = false;
      dragStart = null;
      mousePos = null;
    };

    const initSession = async () => {
      if (!sharedStorage) {
        myId = `obj_${String(Math.floor(Math.random() * 900) + 100)}`;
        idEl.textContent = `you are: ${myId} (local)`;
        hintEl.textContent = "click + drag to launch · local mode";
        return;
      }

      try {
        const rec = await window.storage?.get("orb_visitor_count", true).catch(() => null);
        const n = rec ? (parseInt(rec.value, 10) || 0) + 1 : 1;
        await window.storage?.set("orb_visitor_count", String(n), true).catch(() => undefined);
        myId = `obj_${String(n).padStart(3, "0")}`;
      } catch {
        myId = `obj_${String(Math.floor(Math.random() * 900) + 100)}`;
      }

      idEl.textContent = `you are: ${myId}`;
    };

    const pushState = async () => {
      if (!sharedStorage || !myId) return;
      const alive = localShips.filter((s) => s.alive);
      if (!alive.length) return;
      try {
        await window.storage?.set(
          `orb_ships_${myId}`,
          JSON.stringify({
            ts: Date.now(),
            ships: alive.map((s) => ({ id: s.id, hue: s.hue, trail: s.trail.slice(-50), x: s.x, y: s.y })),
          }),
          true
        );
      } catch {
        // ignore sync errors
      }
    };

    const pullState = async () => {
      if (!sharedStorage || !myId) return;
      try {
        const keys = await window.storage?.list("orb_ships_", true);
        if (!keys?.keys) return;
        const now = Date.now();
        const fresh: Record<string, boolean> = {};

        for (const key of keys.keys) {
          if (key === `orb_ships_${myId}`) continue;
          try {
            const rec = await window.storage?.get(key, true);
            if (!rec) continue;
            const data = JSON.parse(rec.value) as {
              ts: number;
              ships: Array<{ id: string; hue: number; trail: Array<{ x: number; y: number }>; x: number; y: number }>;
            };
            if (now - data.ts > EXPIRE_MS) continue;

            data.ships.forEach((sd) => {
              if (!remoteShips[sd.id]) remoteShips[sd.id] = createShip(sd.x, sd.y, 0, 0, sd.id, sd.hue);
              remoteShips[sd.id].trail = sd.trail;
              remoteShips[sd.id].x = sd.x;
              remoteShips[sd.id].y = sd.y;
              fresh[sd.id] = true;
            });
          } catch {
            // skip bad records
          }
        }

        Object.keys(remoteShips).forEach((id) => {
          if (!fresh[id]) delete remoteShips[id];
        });
      } catch {
        // ignore sync errors
      }
    };

    const syncLoop = async () => {
      if (!sharedStorage) return;
      await pushState();
      await pullState();
      syncTimer = window.setTimeout(() => {
        void syncLoop();
      }, SYNC_MS);
    };

    resize();
    window.addEventListener("resize", resize);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);

    loop();
    void initSession().then(() => {
      void syncLoop();
    });

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      if (raf) window.cancelAnimationFrame(raf);
      if (syncTimer) window.clearTimeout(syncTimer);
    };
  }, []);

  return null;
}
