import type { Metadata } from "next";

import hikes from "../../../data/hikes.json";
import gpxData from "../../../data/gpx-data.json";
import type { GpxData, Hike, ParsedHike } from "../../../types/hikes";
import TrailsClient from "./trails-client";

export const metadata: Metadata = {
  title: "Trails - Chakshu Jain",
  description: "Hikes I've done, walked trail by trail.",
};

export default async function TrailsPage() {
  const hikeList = hikes as Hike[];
  const gpxById = gpxData as unknown as Record<string, GpxData>;

  const parsedHikes: ParsedHike[] = hikeList.map((hike) => {
    const parsed = gpxById[hike.id] ?? {
      trail: [],
      elevationFt: [],
      rawPoints: [],
      bounds: { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 },
      elevationMin: 0,
      elevationMax: 0,
    };
    return { ...hike, gpxData: parsed };
  });

  return <TrailsClient hikes={parsedHikes} />;
}
