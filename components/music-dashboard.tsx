"use client";

/* eslint-disable @next/next/no-img-element */
import { ArrowLeft, ArrowUpRight, MusicNotes, VinylRecord, Waveform } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchLastFm, imageFrom, LastFmTrack, spotifySearch } from "@/lib/lastfm";

type LastFmArtist = {
  name?: string;
  playcount?: string;
};

function statusMessage(kind: "timeout" | "rate" | "empty" | "offline"): string {
  if (kind === "timeout") return "Last.fm took too long. Feed will retry in 30s.";
  if (kind === "rate") return "Rate limit hit. Last.fm needs a minute. Retrying soon.";
  if (kind === "empty") return "No scrobbles returned right now.";
  return "Music service unreachable. Retrying in background.";
}

function classifyError(err: unknown): "timeout" | "rate" | "offline" {
  if (err instanceof DOMException && err.name === "AbortError") return "timeout";
  const status = typeof err === "object" && err && "status" in err ? Number((err as { status?: number }).status) : 0;
  if (status === 429) return "rate";
  return "offline";
}

export default function MusicDashboard() {
  const [clock, setClock] = useState("--:--");
  const [trackLimit, setTrackLimit] = useState(25);

  const [now, setNow] = useState({
    track: "Loading...",
    artist: "-",
    image: "",
    live: false,
    url: "#",
    status: "syncing recent track..."
  });

  const [recentTracks, setRecentTracks] = useState<Array<{ name: string; artist: string; image: string; url: string }>>([]);
  const [recentStatus, setRecentStatus] = useState("syncing recent tracks...");

  const [artists, setArtists] = useState<Array<{ name: string; plays: number; width: number; url: string }>>([]);
  const [artistsStatus, setArtistsStatus] = useState("syncing weekly artists...");
  const [topArtist, setTopArtist] = useState("-");

  const [scrobbles, setScrobbles] = useState("-");

  useEffect(() => {
    const updateClock = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      setClock(`${hh}:${mm}`);
    };
    updateClock();
    const id = window.setInterval(updateClock, 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const updateLimit = () => setTrackLimit(mq.matches ? 20 : 25);
    updateLimit();
    mq.addEventListener("change", updateLimit);
    return () => mq.removeEventListener("change", updateLimit);
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        const data = await fetchLastFm("user.getrecenttracks", { limit: "1" });
        const track = data?.recenttracks?.track?.[0] as LastFmTrack | undefined;
        if (!track) throw new Error("empty");

        const name = track.name || "Unknown track";
        const artist = track.artist?.["#text"] || "Unknown artist";
        const live = track?.["@attr"]?.nowplaying === "true";

        setNow({
          track: name,
          artist,
          image: imageFrom(track),
          live,
          url: spotifySearch(`${name} ${artist}`),
          status: live ? "live signal locked." : "Nothing live right now. Showing last played."
        });
      } catch (err) {
        const kind = err instanceof Error && err.message === "empty" ? "empty" : classifyError(err);
        setNow((prev) => ({ ...prev, status: statusMessage(kind) }));
      }
    };

    run();
    const id = window.setInterval(run, 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        const data = await fetchLastFm("user.getrecenttracks", { limit: String(trackLimit) });
        const tracks = (data?.recenttracks?.track || []) as LastFmTrack[];
        if (!tracks.length) throw new Error("empty");

        setRecentTracks(
          tracks.slice(0, trackLimit).map((track) => {
            const name = track.name || "Unknown track";
            const artist = track.artist?.["#text"] || "Unknown artist";
            return {
              name,
              artist,
              image: imageFrom(track, ["large", "medium"]),
              url: spotifySearch(`${name} ${artist}`)
            };
          })
        );
        setRecentStatus(`showing ${trackLimit} recent tracks.`);
      } catch (err) {
        const kind = err instanceof Error && err.message === "empty" ? "empty" : classifyError(err);
        setRecentStatus(statusMessage(kind));
      }
    };

    run();
    const id = window.setInterval(run, 120000);
    return () => window.clearInterval(id);
  }, [trackLimit]);

  useEffect(() => {
    const run = async () => {
      try {
        const data = await fetchLastFm("user.gettopartists", { limit: "7", period: "7day" });
        const items = (data?.topartists?.artist || []) as LastFmArtist[];
        if (!items.length) throw new Error("empty");

        const max = Math.max(...items.map((a) => Number(a.playcount || 0)), 1);
        setTopArtist(items[0]?.name || "-");
        setArtists(
          items.slice(0, 7).map((artist) => {
            const plays = Number(artist.playcount || 0);
            return {
              name: artist.name || "Unknown artist",
              plays,
              width: Math.max(8, Math.round((plays / max) * 100)),
              url: spotifySearch(artist.name || "")
            };
          })
        );
        setArtistsStatus("weekly artist profile synced.");
      } catch (err) {
        const kind = err instanceof Error && err.message === "empty" ? "empty" : classifyError(err);
        setArtistsStatus(statusMessage(kind));
      }
    };

    run();
    const id = window.setInterval(run, 300000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        const data = await fetchLastFm("user.getinfo");
        const count = data?.user?.playcount;
        if (count) {
          setScrobbles(Number(count).toLocaleString());
        }
      } catch {
        // Keep previous value when this request fails.
      }
    };

    run();
    const id = window.setInterval(run, 600000);
    return () => window.clearInterval(id);
  }, []);

  const eqBars = useMemo(() => [0, 0.15, 0.3, 0.1], []);

  return (
    <main className="music-layout">
      <nav className="music-nav">
        <div className="music-nav-title">
          <MusicNotes size={18} weight="duotone" /> /music
        </div>
        <Link className="music-nav-link" href="/">
          <ArrowLeft size={14} /> back to chakshu.dev
        </Link>
      </nav>

      <div className="container">
        <section className="music-header">
          <article className="music-panel">
            <p className="music-panel-title">Now playing</p>
            <div className="now-main">
              <div className="now-art">{now.image ? <img src={now.image} alt={`Album art for ${now.track}`} /> : null}</div>
              <div>
                <div className="now-track">{now.track}</div>
                <div className="now-artist">{now.artist}</div>
                <div className="now-meta">
                  <span className="live-pill">{now.live ? "now playing" : "last played"}</span>
                  {now.live ? (
                    <div className="eq" aria-hidden="true">
                      {eqBars.map((delay, index) => (
                        <div key={index} className="eq-bar" style={{ animationDelay: `${delay}s` }} />
                      ))}
                    </div>
                  ) : null}
                  <a className="spotify-link" href={now.url} target="_blank" rel="noopener noreferrer">
                    open in spotify <ArrowUpRight size={12} />
                  </a>
                </div>
                <div className="status-line">{now.status}</div>
              </div>
            </div>
          </article>

          <article className="music-panel">
            <p className="music-panel-title">Metrics</p>
            <div className="metrics">
              <div className="metric-row">
                <span className="metric-key">total_scrobbles</span>
                <span className="metric-val">{scrobbles}</span>
              </div>
              <div className="metric-row">
                <span className="metric-key">listening_clock</span>
                <span className="metric-val">{clock}</span>
              </div>
              <div className="metric-row">
                <span className="metric-key">top_artist_7d</span>
                <span className="metric-val">{topArtist}</span>
              </div>
            </div>
          </article>
        </section>

        <section className="music-section">
          <div className="section-header">
            <span className="section-num">01</span>
            <span className="section-icon" aria-hidden="true">
              <VinylRecord size={22} weight="duotone" />
            </span>
            <h2 className="section-title">Recent Tracks ({trackLimit})</h2>
            <div className="section-line" />
          </div>

          <div className="tracks-grid">
            {recentTracks.length ? (
              recentTracks.map((track) => (
                <a key={`${track.name}-${track.artist}`} className="track-card" href={track.url} target="_blank" rel="noopener noreferrer">
                  <div className="track-art">{track.image ? <img src={track.image} alt={`Album art for ${track.name}`} /> : null}</div>
                  <div className="track-body">
                    <div className="track-name">{track.name}</div>
                    <div className="track-artist">{track.artist}</div>
                  </div>
                </a>
              ))
            ) : (
              <div className="empty">Recent tracks will appear once Last.fm responds.</div>
            )}
          </div>
          <div className="status-line">{recentStatus}</div>
        </section>

        <section className="music-section">
          <div className="section-header">
            <span className="section-num">02</span>
            <span className="section-icon" aria-hidden="true">
              <Waveform size={22} weight="duotone" />
            </span>
            <h2 className="section-title">Top Artists</h2>
            <div className="section-line" />
          </div>

          <div className="artists">
            {artists.length ? (
              artists.map((artist) => (
                <a key={artist.name} className="artist-row" href={artist.url} target="_blank" rel="noopener noreferrer">
                  <div className="artist-name">{artist.name}</div>
                  <div className="artist-bar-wrap">
                    <div className="artist-bar" style={{ width: `${artist.width}%` }} />
                  </div>
                  <div className="artist-count">{artist.plays}</div>
                </a>
              ))
            ) : (
              <div className="empty">Top artists will appear once Last.fm responds.</div>
            )}
          </div>
          <div className="status-line">{artistsStatus}</div>
        </section>
      </div>
    </main>
  );
}
