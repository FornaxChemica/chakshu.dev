import type { Metadata } from "next";

import { getParsedHikes } from "../../../lib/hikes-data";
import TrailsClient from "./trails-client";

export const metadata: Metadata = {
  title: "Trails - Chakshu Jain",
  description: "Hikes I've done, walked trail by trail.",
};

export default async function TrailsPage() {
  const parsedHikes = await getParsedHikes();

  return <TrailsClient hikes={parsedHikes} />;
}
