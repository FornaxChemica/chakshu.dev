type MediaMetadata = {
  lat: number | null;
  lon: number | null;
  capturedAtMs: number | null;
  source: "exif_gps" | "quicktime_iso6709" | "none";
};

type ExifParseResult = {
  lat: number | null;
  lon: number | null;
  capturedAtMs: number | null;
};

type Endian = "little" | "big";

function typeByteSize(type: number): number {
  switch (type) {
    case 1:
    case 2:
    case 7:
      return 1;
    case 3:
      return 2;
    case 4:
    case 9:
      return 4;
    case 5:
    case 10:
      return 8;
    default:
      return 0;
  }
}

function parseExifDate(dateText: string): number | null {
  const trimmed = dateText.replace(/\0+$/, "").trim();
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null;
  }

  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function parseExifFromJpeg(bytes: Uint8Array): ExifParseResult {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return { lat: null, lon: null, capturedAtMs: null };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    offset += 2;

    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > bytes.length) break;

    const segmentLength = view.getUint16(offset, false);
    offset += 2;
    if (segmentLength < 2) break;

    const segmentDataLength = segmentLength - 2;
    if (offset + segmentDataLength > bytes.length) break;

    const isExif =
      marker === 0xe1 &&
      segmentDataLength >= 6 &&
      bytes[offset] === 0x45 &&
      bytes[offset + 1] === 0x78 &&
      bytes[offset + 2] === 0x69 &&
      bytes[offset + 3] === 0x66 &&
      bytes[offset + 4] === 0x00 &&
      bytes[offset + 5] === 0x00;

    if (isExif) {
      const parsed = parseTiffExif(view, offset + 6, segmentDataLength - 6);
      if (parsed.lat != null || parsed.lon != null || parsed.capturedAtMs != null) {
        return parsed;
      }
    }

    offset += segmentDataLength;
  }

  return { lat: null, lon: null, capturedAtMs: null };
}

function parseTiffExif(view: DataView, tiffStart: number, tiffLength: number): ExifParseResult {
  if (tiffLength < 8 || tiffStart + tiffLength > view.byteLength) {
    return { lat: null, lon: null, capturedAtMs: null };
  }

  const byteOrderA = view.getUint8(tiffStart);
  const byteOrderB = view.getUint8(tiffStart + 1);
  let endian: Endian | null = null;
  if (byteOrderA === 0x49 && byteOrderB === 0x49) endian = "little";
  if (byteOrderA === 0x4d && byteOrderB === 0x4d) endian = "big";
  if (!endian) return { lat: null, lon: null, capturedAtMs: null };

  const little = endian === "little";
  const readU16 = (rel: number): number | null => {
    if (rel < 0 || rel + 2 > tiffLength) return null;
    return view.getUint16(tiffStart + rel, little);
  };
  const readU32 = (rel: number): number | null => {
    if (rel < 0 || rel + 4 > tiffLength) return null;
    return view.getUint32(tiffStart + rel, little);
  };
  const getBytesAt = (rel: number, length: number): Uint8Array | null => {
    if (length < 0 || rel < 0 || rel + length > tiffLength) return null;
    return new Uint8Array(view.buffer, view.byteOffset + tiffStart + rel, length);
  };

  const magic = readU16(2);
  if (magic !== 42) return { lat: null, lon: null, capturedAtMs: null };

  const ifd0Offset = readU32(4);
  if (ifd0Offset == null) return { lat: null, lon: null, capturedAtMs: null };

  type IfdEntry = { type: number; count: number; valueRel: number };

  const readIfd = (ifdRel: number): Map<number, IfdEntry> => {
    const entries = new Map<number, IfdEntry>();
    const count = readU16(ifdRel);
    if (count == null) return entries;

    for (let i = 0; i < count; i += 1) {
      const entryRel = ifdRel + 2 + i * 12;
      if (entryRel + 12 > tiffLength) break;

      const tag = readU16(entryRel);
      const type = readU16(entryRel + 2);
      const itemCount = readU32(entryRel + 4);
      if (tag == null || type == null || itemCount == null) continue;

      const bytesPer = typeByteSize(type);
      if (!bytesPer) continue;
      const totalBytes = bytesPer * itemCount;
      let valueRel: number | null = null;
      if (totalBytes <= 4) {
        valueRel = entryRel + 8;
      } else {
        valueRel = readU32(entryRel + 8);
      }
      if (valueRel == null) continue;
      entries.set(tag, { type, count: itemCount, valueRel });
    }

    return entries;
  };

  const readAscii = (entry: IfdEntry): string | null => {
    const total = typeByteSize(entry.type) * entry.count;
    const raw = getBytesAt(entry.valueRel, total);
    if (!raw) return null;
    return new TextDecoder("ascii").decode(raw).replace(/\0+$/, "");
  };

  const readRationalArray = (entry: IfdEntry): number[] | null => {
    if (entry.type !== 5 || entry.count <= 0) return null;
    const out: number[] = [];
    for (let i = 0; i < entry.count; i += 1) {
      const rel = entry.valueRel + i * 8;
      const num = readU32(rel);
      const den = readU32(rel + 4);
      if (num == null || den == null || den === 0) return null;
      out.push(num / den);
    }
    return out;
  };

  const readLong = (entry: IfdEntry): number | null => {
    if (entry.type !== 4 || entry.count < 1) return null;
    return readU32(entry.valueRel);
  };

  const ifd0 = readIfd(ifd0Offset);
  const exifIfdPtrEntry = ifd0.get(0x8769);
  const gpsIfdPtrEntry = ifd0.get(0x8825);

  let capturedAtMs: number | null = null;
  if (exifIfdPtrEntry) {
    const exifIfdOffset = readLong(exifIfdPtrEntry);
    if (exifIfdOffset != null) {
      const exifIfd = readIfd(exifIfdOffset);
      const dateEntry = exifIfd.get(0x9003) ?? exifIfd.get(0x0132);
      if (dateEntry && dateEntry.type === 2) {
        const dateText = readAscii(dateEntry);
        if (dateText) capturedAtMs = parseExifDate(dateText);
      }
    }
  }

  let lat: number | null = null;
  let lon: number | null = null;

  if (gpsIfdPtrEntry) {
    const gpsIfdOffset = readLong(gpsIfdPtrEntry);
    if (gpsIfdOffset != null) {
      const gpsIfd = readIfd(gpsIfdOffset);
      const latRefEntry = gpsIfd.get(0x0001);
      const latEntry = gpsIfd.get(0x0002);
      const lonRefEntry = gpsIfd.get(0x0003);
      const lonEntry = gpsIfd.get(0x0004);

      const latRef = latRefEntry ? readAscii(latRefEntry)?.toUpperCase() ?? null : null;
      const lonRef = lonRefEntry ? readAscii(lonRefEntry)?.toUpperCase() ?? null : null;
      const latParts = latEntry ? readRationalArray(latEntry) : null;
      const lonParts = lonEntry ? readRationalArray(lonEntry) : null;

      if (latParts && latParts.length >= 3 && latRef) {
        const decimal = latParts[0] + latParts[1] / 60 + latParts[2] / 3600;
        lat = latRef === "S" ? -decimal : decimal;
      }
      if (lonParts && lonParts.length >= 3 && lonRef) {
        const decimal = lonParts[0] + lonParts[1] / 60 + lonParts[2] / 3600;
        lon = lonRef === "W" ? -decimal : decimal;
      }
    }
  }

  return { lat, lon, capturedAtMs };
}

function parseQuickTimeIso6709(bytes: Uint8Array): { lat: number | null; lon: number | null } {
  const scanLength = Math.min(bytes.length, 1_000_000);
  const text = new TextDecoder("latin1").decode(bytes.subarray(0, scanLength));
  const match = /([+-]\d{1,2}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)(?:[+-]\d+(?:\.\d+)?)?\//.exec(text);
  if (!match) return { lat: null, lon: null };

  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { lat: null, lon: null };
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return { lat: null, lon: null };
  return { lat, lon };
}

export function extractMediaMetadata(
  fileName: string,
  mimeType: string,
  bytes: Uint8Array
): MediaMetadata {
  const lowerName = fileName.toLowerCase();
  const lowerType = mimeType.toLowerCase();
  const isJpeg = lowerType.includes("jpeg") || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg");
  const isVideo =
    lowerType.startsWith("video/") ||
    lowerName.endsWith(".mp4") ||
    lowerName.endsWith(".mov") ||
    lowerName.endsWith(".m4v");

  if (isJpeg) {
    const exif = parseExifFromJpeg(bytes);
    const hasGps = exif.lat != null && exif.lon != null;
    return {
      lat: exif.lat,
      lon: exif.lon,
      capturedAtMs: exif.capturedAtMs,
      source: hasGps ? "exif_gps" : "none",
    };
  }

  if (isVideo) {
    const quickTime = parseQuickTimeIso6709(bytes);
    const hasGps = quickTime.lat != null && quickTime.lon != null;
    return {
      lat: quickTime.lat,
      lon: quickTime.lon,
      capturedAtMs: null,
      source: hasGps ? "quicktime_iso6709" : "none",
    };
  }

  return { lat: null, lon: null, capturedAtMs: null, source: "none" };
}
