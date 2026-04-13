"use client";

import { useEffect } from "react";

const LASTFM_USER = "chakshujain";
const LASTFM_KEY = "da674b2d8f3e39ba0cdfb7ae5e8a4629";
const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

function lastFmUrl(method: string, params: Record<string, string> = {}) {
  const p = new URLSearchParams({
    method,
    user: LASTFM_USER,
    api_key: LASTFM_KEY,
    format: "json",
    ...params,
  });
  return `${LASTFM_BASE}?${p.toString()}`;
}

function spotifySearch(term: string) {
  return `https://open.spotify.com/search/${encodeURIComponent(term)}`;
}

function statusMessage(kind: "timeout" | "rate" | "empty" | "offline") {
  if (kind === "timeout") return "Last.fm took too long. Music feed will retry in 30s.";
  if (kind === "rate") return "Last.fm rate limit tapped. Giving it a minute.";
  if (kind === "empty") return "No scrobbles returned right now. Probably API nap time.";
  return "Music service unreachable. Retrying quietly in the background.";
}

async function fetchLastFm(method: string, params: Record<string, string> = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(lastFmUrl(method, params), { signal: controller.signal });
    if (!res.ok) {
      const err = new Error(`http_${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    window.clearTimeout(timer);
  }
}

function classifyMusicError(err: unknown): "timeout" | "rate" | "offline" {
  if ((err as { name?: string } | null)?.name === "AbortError") return "timeout";
  if ((err as { status?: number } | null)?.status === 429) return "rate";
  return "offline";
}

export default function MusicClient() {
  useEffect(() => {
    let cancelled = false;
    let nowPlayingTimer: number | null = null;

    const initHeroMusicStat = async () => {
      const artistEl = document.getElementById("stat-artist") as HTMLAnchorElement | null;
      if (!artistEl) return;

      try {
        const data = await fetchLastFm("user.gettopartists", { limit: "1", period: "7day" });
        if (cancelled) return;
        const topArtist = data?.topartists?.artist?.[0]?.name;
        if (!topArtist) throw new Error("empty");
        artistEl.textContent = topArtist;
        artistEl.href = spotifySearch(topArtist);
      } catch (err) {
        const kind = (err as Error).message === "empty" ? "empty" : classifyMusicError(err);
        artistEl.textContent = kind === "rate" ? "rate-limited" : "api nap";
        artistEl.removeAttribute("href");
      }
    };

    const initMusicTeaserPills = async () => {
      const container = document.getElementById("teaser-artists");
      const note = document.getElementById("teaser-note");
      if (!container) return;

      try {
        const data = await fetchLastFm("user.gettopartists", { limit: "3", period: "7day" });
        if (cancelled) return;
        const artists = data?.topartists?.artist || [];
        if (!artists.length) throw new Error("empty");
        container.innerHTML = "";
        artists.slice(0, 3).forEach((artist: { name?: string }) => {
          const pill = document.createElement("div");
          pill.className = "music-artist-pill";
          pill.textContent = artist?.name || "-";
          container.appendChild(pill);
        });
        if (note) note.textContent = "updated from this week's scrobbles.";
      } catch (err) {
        const kind = (err as Error).message === "empty" ? "empty" : classifyMusicError(err);
        if (note) note.textContent = statusMessage(kind);
      }
    };

    const initNowPlaying = async () => {
      const bar = document.getElementById("now-playing-bar") as HTMLElement | null;
      const eq = document.getElementById("np-eq") as HTMLElement | null;
      if (!bar || !eq) return;

      [0, 0.15, 0.3, 0.1].forEach((delay) => {
        const b = document.createElement("div");
        b.className = "np-eq-bar";
        b.style.animationDelay = `${delay}s`;
        eq.appendChild(b);
      });

      const trackEl = document.getElementById("np-track") as HTMLElement | null;
      const artistEl = document.getElementById("np-artist") as HTMLElement | null;
      const labelEl = document.getElementById("np-label") as HTMLElement | null;
      const linkEl = document.getElementById("np-spotify-link") as HTMLAnchorElement | null;
      const artEl = document.getElementById("np-art") as HTMLElement | null;
      const noteEl = document.getElementById("np-note") as HTMLElement | null;

      if (!trackEl || !artistEl || !labelEl || !linkEl || !artEl) return;

      labelEl.textContent = "syncing";
      if (noteEl) noteEl.textContent = "waiting for last.fm signal...";
      eq.style.display = "flex";

      const poll = async () => {
        if (cancelled) return;

        try {
          const data = await fetchLastFm("user.getrecenttracks", { limit: "1" });
          if (cancelled) return;

          const track = data?.recenttracks?.track?.[0];
          if (!track) throw new Error("empty");

          const name = track?.name || "Unknown track";
          const artist = track?.artist?.["#text"] || "Unknown artist";
          const isLive = track?.["@attr"]?.nowplaying === "true";

          trackEl.textContent = name;
          artistEl.textContent = artist;
          labelEl.textContent = isLive ? "now playing" : "last played";
          linkEl.href = spotifySearch(`${name} ${artist}`);

          const imgSrc = track?.image?.find((img: { size?: string; [key: string]: string | undefined }) => img?.size === "medium")?.["#text"];
          const hasImg = imgSrc && !imgSrc.includes("2a96cbd8b46e442fc41c2b86b821562f");
          if (hasImg) {
            artEl.innerHTML = `<img src="${imgSrc}" alt="Album art for ${name}">`;
          } else {
            artEl.innerHTML = "";
          }

          eq.style.display = isLive ? "flex" : "none";
          if (noteEl) {
            noteEl.textContent = isLive ? "live signal locked." : "Nothing live right now. Showing last played.";
          }
          bar.style.display = "flex";
        } catch (err) {
          const kind = (err as Error).message === "empty" ? "empty" : classifyMusicError(err);
          labelEl.textContent = "signal retry";
          eq.style.display = "flex";
          if (noteEl) noteEl.textContent = statusMessage(kind);
          bar.style.display = "flex";
        }

        nowPlayingTimer = window.setTimeout(poll, 30000);
      };

      await poll();
    };

    void initHeroMusicStat();
    void initMusicTeaserPills();
    void initNowPlaying();

    return () => {
      cancelled = true;
      if (nowPlayingTimer) {
        window.clearTimeout(nowPlayingTimer);
      }
    };
  }, []);

  return null;
}
