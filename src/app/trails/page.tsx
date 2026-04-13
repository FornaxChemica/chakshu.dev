import type { Metadata } from "next";

import hikes from "../../../data/hikes.json";
import { parseGpx } from "../../../lib/parseGpx";
import type { Hike, ParsedHike } from "../../../types/hikes";
import TrailsClient from "./trails-client";

export const metadata: Metadata = {
  title: "Trails — Chakshu Jain",
  description: "Hikes I've done, walked trail by trail.",
};

export default async function TrailsPage() {
  const hikeList = hikes as Hike[];

  const parsedHikes: ParsedHike[] = await Promise.all(
    hikeList.map(async (hike) => {
      const gpxData = await parseGpx(hike.gpx);
      return { ...hike, gpxData };
    })
  );

  return <TrailsClient hikes={parsedHikes} />;
}
