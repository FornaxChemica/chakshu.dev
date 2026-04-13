export type Snapshot = {
  at: number;
  src: string;
  caption: string;
  elevation: string;
};

export type Hike = {
  id: string;
  name: string;
  alltrails_url?: string;
  location: string;
  date: string;
  distance: string;
  elevation_gain: string;
  high_point: string;
  difficulty: string;
  gpx: string;
  snapshots: Snapshot[];
};

export type GpxData = {
  trail: [number, number][];
  elevationFt: number[];
  rawPoints: { lat: number; lon: number; ele: number }[];
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  elevationMin: number;
  elevationMax: number;
};

export type ParsedHike = Hike & { gpxData: GpxData };
