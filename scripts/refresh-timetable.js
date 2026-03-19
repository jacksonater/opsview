#!/usr/bin/env node
/**
 * scripts/refresh-timetable.js
 *
 * Refreshes data/timetable.json from the PTV GTFS Schedule feed.
 *
 * Usage:
 *   node scripts/refresh-timetable.js
 *
 * Environment variables:
 *   PTV_API_KEY  — your PTV Open Data API key
 *                  (from https://opendata.transport.vic.gov.au/)
 *
 * What it does:
 *   1. Downloads the latest GTFS Schedule zip from PTV
 *   2. Extracts the tram-relevant trips, stop_times, and stops files
 *   3. Filters to the 24 Melbourne tram routes defined in app.js
 *   4. Builds the timetable.json format expected by simulator.js
 *   5. Writes data/timetable.json (5–6MB)
 *
 * Run this script whenever PTV publishes a new GTFS Schedule release
 * (typically weekly). The output file is committed to the repository so
 * the app can load it without an API key at runtime.
 *
 * GTFS Schedule format reference:
 *   https://developers.google.com/transit/gtfs/reference
 *
 * NOTE: This script requires Node.js 18+ (uses native fetch).
 *       Install dependencies first: npm install
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// ── Configuration ─────────────────────────────────────────────────────────────

const API_KEY = process.env.PTV_API_KEY;
if (!API_KEY) {
  console.error('ERROR: PTV_API_KEY environment variable not set.');
  console.error('  export PTV_API_KEY=your-key-here');
  process.exit(1);
}

// PTV GTFS Schedule download URL
// Check https://opendata.transport.vic.gov.au/ for the latest URL
const GTFS_SCHEDULE_URL =
  'https://data-exchange-api.vicroads.vic.gov.au/opendata/v1/gtfs/schedule';

// Tram route IDs to include (must match keys in GTFS_ROUTES in app.js)
const TRAM_ROUTES = [
  '1', '3', '5', '6', '11', '12', '16', '19', '30', '35',
  '48', '57', '58', '59', '64', '67', '70', '72', '75', '78',
  '82', '86', '96', '109'
];

const OUT_PATH = path.resolve(__dirname, '../data/timetable.json');
const TMP_DIR  = path.resolve(__dirname, '../.tmp-gtfs');

// ── Helpers ───────────────────────────────────────────────────────────────────

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return httpsGet(res.headers.location, headers).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

function parseCsv(text) {
  const lines = text.split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].replace(/\r/, '').split(',');
  return lines.slice(1).map((line) => {
    const values = line.replace(/\r/, '').split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

function timeToSecs(t) {
  if (!t) return 0;
  const parts = t.split(':');
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2] || '0');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('OpsView Timetable Refresh');
  console.log('═'.repeat(40));

  // 1. Download GTFS Schedule zip
  console.log('\n1. Downloading GTFS Schedule from PTV...');
  const zipBuf = await httpsGet(GTFS_SCHEDULE_URL, {
    'Ocp-Apim-Subscription-Key': API_KEY,
  });
  console.log(`   Downloaded ${(zipBuf.length / 1024 / 1024).toFixed(1)} MB`);

  // 2. Extract to temp directory
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  const zipPath = path.join(TMP_DIR, 'gtfs.zip');
  fs.writeFileSync(zipPath, zipBuf);
  console.log('\n2. Extracting zip...');
  execSync(`unzip -o "${zipPath}" -d "${TMP_DIR}" > /dev/null 2>&1`);

  // 3. Load relevant files
  console.log('\n3. Parsing GTFS files...');
  const readCsv = (name) => {
    const p = path.join(TMP_DIR, name);
    if (!fs.existsSync(p)) { console.warn(`   WARN: ${name} not found`); return []; }
    return parseCsv(fs.readFileSync(p, 'utf8'));
  };

  const routes    = readCsv('routes.txt');
  const trips     = readCsv('trips.txt');
  const stopTimes = readCsv('stop_times.txt');
  const stops     = readCsv('stops.txt');

  // Build stop lookup: stop_id → {lat, lng, name}
  const stopMap = {};
  stops.forEach((s) => {
    stopMap[s.stop_id] = {
      lat: parseFloat(s.stop_lat),
      lng: parseFloat(s.stop_lon),
      name: s.stop_name
    };
  });

  // Find tram route_ids from GTFS (they may have prefixes/suffixes)
  const tramRouteIds = new Set();
  const routeKeyMap = {}; // gtfs route_id → our short key ('1', '96', etc.)
  routes.forEach((r) => {
    const shortName = (r.route_short_name || '').trim();
    if (TRAM_ROUTES.includes(shortName)) {
      tramRouteIds.add(r.route_id);
      routeKeyMap[r.route_id] = shortName;
    }
  });
  console.log(`   Found ${tramRouteIds.size} tram routes in GTFS`);

  // Filter trips to tram routes
  const tramTripIds = new Set();
  const tripRouteMap = {}; // trip_id → {routeKey, runId, direction}
  trips.forEach((t) => {
    if (!tramRouteIds.has(t.route_id)) return;
    tramTripIds.add(t.trip_id);
    tripRouteMap[t.trip_id] = {
      routeKey: routeKeyMap[t.route_id],
      runId: t.block_id || t.trip_id,
      direction: t.direction_id === '0' ? 'Down' : 'Up',
      shapeId: t.shape_id
    };
  });
  console.log(`   Found ${tramTripIds.size} tram trips`);

  // Group stop_times by trip
  const tripStopTimes = {};
  stopTimes.forEach((st) => {
    if (!tramTripIds.has(st.trip_id)) return;
    if (!tripStopTimes[st.trip_id]) tripStopTimes[st.trip_id] = [];
    tripStopTimes[st.trip_id].push({
      seq: parseInt(st.stop_sequence),
      stopId: st.stop_id,
      t: timeToSecs(st.arrival_time || st.departure_time)
    });
  });

  // 4. Build timetable.json structure
  console.log('\n4. Building timetable.json...');
  // Format: { routeKey: { runId: [ {q, d, w:[{c,t,a,o},...]} ] } }
  const timetable = {};

  TRAM_ROUTES.forEach((rk) => { timetable[rk] = {}; });

  let tripCount = 0;
  Object.keys(tripStopTimes).forEach((tripId) => {
    const info = tripRouteMap[tripId];
    if (!info) return;
    const { routeKey, runId, direction } = info;

    const sts = tripStopTimes[tripId].sort((a, b) => a.seq - b.seq);
    if (sts.length < 2) return;

    const waypoints = sts.map((st) => {
      const sp = stopMap[st.stopId] || {};
      return {
        c: st.stopId,
        t: st.t,
        a: sp.lat || 0,
        o: sp.lng || 0
      };
    });

    if (!timetable[routeKey][runId]) timetable[routeKey][runId] = [];
    const seq = timetable[routeKey][runId].length + 1;
    timetable[routeKey][runId].push({ q: seq, d: direction, w: waypoints });
    tripCount++;
  });

  // 5. Write output
  console.log(`\n5. Writing ${OUT_PATH}...`);
  const json = JSON.stringify(timetable);
  fs.writeFileSync(OUT_PATH, json);
  const sizeMB = (json.length / 1024 / 1024).toFixed(1);
  console.log(`   Written ${sizeMB} MB, ${tripCount} trips`);

  // Cleanup temp files
  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  console.log('\n✓ Done. Commit data/timetable.json to apply the update.');
  console.log('  git add data/timetable.json');
  console.log('  git commit -m "chore: refresh timetable from PTV GTFS Schedule"');
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
