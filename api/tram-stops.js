// ═══════════════════════════════════════════════════════════
// OpsView — PTV Static GTFS Tram Stops Proxy
// Fetches the PTV static GTFS ZIP, extracts stops.txt, and
// returns a stopId → { name, lat, lon } lookup for the
// Melbourne tram network.
//
// Cached for 24 hours — tram stops very rarely change.
//
// Response shape:
//   { timestamp, count, stops: { "19953": { name, lat, lon }, … } }
// ═══════════════════════════════════════════════════════════

const zlib = require('zlib');

// PTV static GTFS for trams
const GTFS_URL = 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/v1/tram/';

let cachedData = null;
let cachedAt = 0;
const CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Minimal ZIP parser (no extra npm packages needed) ──
// Locates a named file inside a ZIP buffer and returns its
// decompressed contents as a UTF-8 string.
function extractFromZip(buffer, targetName) {
  // Find End of Central Directory record (signature PK\x05\x06)
  let eocdPos = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i--) {
    if (buffer[i] === 0x50 && buffer[i+1] === 0x4b &&
        buffer[i+2] === 0x05 && buffer[i+3] === 0x06) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) throw new Error('ZIP EOCD signature not found');

  const cdEntries  = buffer.readUInt16LE(eocdPos + 10);
  const cdOffset   = buffer.readUInt32LE(eocdPos + 16);

  // Walk the Central Directory to find our file's local header offset
  let cdPos = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (buffer.readUInt32LE(cdPos) !== 0x02014b50) break; // CD file header sig
    const fileNameLen  = buffer.readUInt16LE(cdPos + 28);
    const extraLen     = buffer.readUInt16LE(cdPos + 30);
    const commentLen   = buffer.readUInt16LE(cdPos + 32);
    const localOffset  = buffer.readUInt32LE(cdPos + 42);
    const fileName     = buffer.slice(cdPos + 46, cdPos + 46 + fileNameLen).toString('utf8');

    if (fileName === targetName || fileName.endsWith('/' + targetName)) {
      // Found — read the Local File Header to get the actual data offset
      const lhPos          = localOffset;
      if (buffer.readUInt32LE(lhPos) !== 0x04034b50) throw new Error('Bad local file header');
      const compression    = buffer.readUInt16LE(lhPos + 8);
      const compressedSize = buffer.readUInt32LE(lhPos + 18);
      const lfnLen         = buffer.readUInt16LE(lhPos + 26);
      const lfExtraLen     = buffer.readUInt16LE(lhPos + 28);
      const dataStart      = lhPos + 30 + lfnLen + lfExtraLen;
      const compressed     = buffer.slice(dataStart, dataStart + compressedSize);

      if (compression === 0) return compressed.toString('utf8');              // stored
      if (compression === 8) return zlib.inflateRawSync(compressed).toString('utf8'); // deflate
      throw new Error('Unsupported compression method: ' + compression);
    }

    cdPos += 46 + fileNameLen + extraLen + commentLen;
  }
  throw new Error('File "' + targetName + '" not found in ZIP');
}

// ── Simple CSV parser for GTFS stops.txt ──
// Handles quoted fields, skips empty lines.
function parseCsv(text) {
  const lines = text.split(/\r?\n/);
  if (!lines.length) return {};

  // Parse header row, stripping BOM and quotes
  const headers = lines[0].replace(/^\uFEFF/, '').split(',')
    .map(h => h.trim().replace(/^"|"$/g, ''));

  const stopIdIdx   = headers.indexOf('stop_id');
  const stopNameIdx = headers.indexOf('stop_name');
  const stopLatIdx  = headers.indexOf('stop_lat');
  const stopLonIdx  = headers.indexOf('stop_lon');

  if (stopIdIdx < 0 || stopNameIdx < 0) throw new Error('stops.txt missing required columns');

  const stops = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple split — PTV stop names occasionally contain commas inside quotes
    const fields = [];
    let inQuote = false, cur = '';
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { fields.push(cur); cur = ''; continue; }
      cur += ch;
    }
    fields.push(cur);

    const id   = (fields[stopIdIdx]   || '').trim();
    const name = (fields[stopNameIdx] || '').trim();
    const lat  = parseFloat(fields[stopLatIdx]  || '');
    const lon  = parseFloat(fields[stopLonIdx]  || '');

    if (!id || !name) continue;
    // Filter to tram stops: Melbourne tram stops are named "Stop NN - ..." or
    // "Stop NN Name" — this avoids including train/bus stops from the same feed
    if (!/^Stop\s+\d/i.test(name)) continue;

    stops[id] = { name, lat: isNaN(lat) ? null : lat, lon: isNaN(lon) ? null : lon };
  }
  return stops;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Long cache — stops don't change
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const now = Date.now();
  if (cachedData && (now - cachedAt) < CACHE_MS) {
    return res.status(200).json(cachedData);
  }

  const apiKey = process.env.PTV_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'PTV_API_KEY not configured' });
  }

  try {
    // Try auth methods in order; also try without a key (static GTFS may be public)
    const attempts = [
      { headers: { 'Ocp-Apim-Subscription-Key': apiKey } },
      { headers: { 'KeyID': apiKey } },
      { headers: {} }, // public access fallback
    ];

    let response = null;
    for (const attempt of attempts) {
      try {
        const resp = await fetch(GTFS_URL, { headers: attempt.headers });
        if (resp.ok) { response = resp; break; }
      } catch (e) { /* try next */ }
    }

    if (!response) {
      return res.status(502).json({ error: 'Failed to fetch PTV static GTFS' });
    }

    // Download ZIP as buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract and parse stops.txt from the ZIP
    const stopsCsv = extractFromZip(buffer, 'stops.txt');
    const stops = parseCsv(stopsCsv);
    const count = Object.keys(stops).length;

    const result = { timestamp: Math.floor(now / 1000), count, stops };
    cachedData = result;
    cachedAt = now;

    return res.status(200).json(result);

  } catch (err) {
    console.error('tram-stops error:', err);
    return res.status(500).json({ error: 'Failed to load stop names', detail: err.message });
  }
};
