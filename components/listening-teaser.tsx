"use client";

import { useEffect, useState } from "react";
import { fetchLastFm, spotifySearch } from "@/lib/lastfm";

type TopArtist = {
  name: string;
  plays: number;
};

export default function ListeningTeaser() {
  const [artists, setArtists] = useState<TopArtist[]>([]);
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    const run = async () => {
      try {
        const data = await fetchLastFm("user.gettopartists", { limit: "3", period: "7day" });
        const items = (data?.topartists?.artist || []) as Array<{ name?: string; playcount?: string }>;
        if (!items.length) throw new Error("empty");

        setArtists(
          items.slice(0, 3).map((artist) => ({
            name: artist.name || "Unknown",
            plays: Number(artist.playcount || 0)
          }))
        );
        setStatus("ready");
      } catch {
        setStatus("syncing...");
      }
    };

    run();
  }, []);

  if (!artists.length || status !== "ready") {
    return <span className="signal-inline aria-hidden">⟳</span>;
  }

  return (
    <div className="teaser-artists">
      {artists.map((artist) => (
        <a
          key={artist.name}
          href={spotifySearch(artist.name)}
          target="_blank"
          rel="noopener noreferrer"
          className="teaser-artist-link"
          title={`${artist.plays} plays this week`}
        >
          {artist.name}
        </a>
      ))}
    </div>
  );
}
