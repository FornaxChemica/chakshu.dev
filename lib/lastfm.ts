const LASTFM_USER = "chakshujain";
const LASTFM_KEY = "da674b2d8f3e39ba0cdfb7ae5e8a4629";
const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

export function lastFmUrl(method: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams({
    method,
    user: LASTFM_USER,
    api_key: LASTFM_KEY,
    format: "json",
    ...params
  });
  return `${LASTFM_BASE}?${query.toString()}`;
}

export function spotifySearch(term: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(term)}`;
}

export type LastFmTrack = {
  name?: string;
  artist?: { "#text"?: string };
  image?: Array<{ size?: string; "#text"?: string }>;
  "@attr"?: { nowplaying?: string };
};

export function imageFrom(track?: LastFmTrack, preferred: string[] = ["extralarge", "large", "medium"]): string {
  for (const size of preferred) {
    const found = track?.image?.find((img) => img.size === size)?.["#text"];
    if (found && !found.includes("2a96cbd8b46e442fc41c2b86b821562f")) {
      return found;
    }
  }
  return "";
}

export async function fetchLastFm(method: string, params: Record<string, string> = {}, timeoutMs = 9000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(lastFmUrl(method, params), { signal: controller.signal });
    if (!res.ok) {
      const err = new Error(`http_${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchNowPlaying(): Promise<LastFmTrack | null> {
  try {
    const data = await fetchLastFm("user.getrecenttracks", { limit: "1" });
    return data?.recenttracks?.track?.[0] || null;
  } catch {
    return null;
  }
}
