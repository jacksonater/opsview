// ═══════════════════════════════════════════════════════════
// OpsView — GTFS-RT Vehicle Positions Proxy
// Vercel serverless function that fetches the PTV GTFS-RT
// protobuf feed server-side (bypassing CORS), decodes it,
// and returns clean JSON to the browser.
//
// API key is stored as Vercel environment variable:
//   PTV_API_KEY (set in Vercel dashboard → Settings → Env Vars)
// ═══════════════════════════════════════════════════════════

const protobuf = require('protobufjs');

// New portal (opendata.transport.vic.gov.au) — uses KeyID header
const PTV_VP_URL_NEW = 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/tram/vehicle-positions';
// Old portal (data-exchange.vicroads.vic.gov.au) — uses Ocp-Apim-Subscription-Key
const PTV_VP_URL_OLD = 'https://data-exchange-api.vicroads.vic.gov.au/opendata/gtfsr/v1/tram/vehicleposition';

// Minimal GTFS-RT proto schema for vehicle positions
const PROTO_SCHEMA = `
syntax = "proto2";
message FeedMessage {
  required FeedHeader header = 1;
  repeated FeedEntity entity = 2;
}
message FeedHeader {
  required string gtfs_realtime_version = 1;
  optional uint64 timestamp = 4;
}
message FeedEntity {
  required string id = 1;
  optional VehiclePosition vehicle = 4;
}
message VehiclePosition {
  optional TripDescriptor trip = 1;
  optional VehicleDescriptor vehicle = 8;
  optional Position position = 2;
  optional uint64 timestamp = 5;
}
message TripDescriptor {
  optional string trip_id = 1;
  optional string route_id = 5;
  optional uint32 direction_id = 6;
}
message VehicleDescriptor {
  optional string id = 1;
  optional string label = 2;
}
message Position {
  required float latitude = 1;
  required float longitude = 2;
  optional float bearing = 3;
  optional float speed = 5;
}
`;

let cachedRoot = null;
let cachedData = null;
let cachedAt = 0;
const CACHE_MS = 30000; // 30s cache — PTV feed caches for 30s anyway

function getRoot() {
  if (!cachedRoot) {
    cachedRoot = protobuf.parse(PROTO_SCHEMA).root;
  }
  return cachedRoot;
}

module.exports = async function handler(req, res) {
  // CORS headers for browser access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=10');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Return cached data if fresh
  const now = Date.now();
  if (cachedData && (now - cachedAt) < CACHE_MS) {
    return res.status(200).json(cachedData);
  }

  const apiKey = process.env.PTV_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'PTV_API_KEY not configured',
      hint: 'Set PTV_API_KEY in Vercel → Settings → Environment Variables'
    });
  }

  try {
    // Transport Victoria Open Data Portal:
    //  - URL: api.opendata.transport.vic.gov.au
    //  - Auth: KeyID header (JWT token from Data Platform API Tokens)
    //  - Fallback: Ocp-Apim-Subscription-Key header (subscription key)
    const attempts = [
      { url: PTV_VP_URL_NEW, headers: { 'KeyID': apiKey }, label: 'KeyID → new portal' },
      { url: PTV_VP_URL_NEW, headers: { 'Ocp-Apim-Subscription-Key': apiKey }, label: 'Ocp-Apim → new portal' },
      { url: PTV_VP_URL_OLD, headers: { 'Ocp-Apim-Subscription-Key': apiKey }, label: 'Ocp-Apim → old portal' },
    ];

    let response = null;
    let lastStatus = 0;
    let lastDetail = '';
    const log = [];

    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      const url = attempt.url;
      const headers = attempt.headers;
      
      try {
        const resp = await fetch(url, { headers });
        log.push({ attempt: i + 1, method: attempt.label, status: resp.status });
        
        if (resp.ok) {
          response = resp;
          break;
        }
        lastStatus = resp.status;
        lastDetail = await resp.text().catch(() => '');
      } catch (e) {
        log.push({ attempt: i + 1, method: attempt.label, error: e.message });
        lastDetail = e.message;
      }
    }

    if (!response) {
      return res.status(lastStatus || 500).json({
        error: `All ${attempts.length} auth methods failed (last status: ${lastStatus})`,
        detail: lastDetail.substring(0, 300),
        attempts: log,
        hint: 'You may need a new API key from opendata.transport.vic.gov.au'
      });
    }

    // Decode protobuf
    const buffer = await response.arrayBuffer();
    const root = getRoot();
    const FeedMessage = root.lookupType('FeedMessage');
    const feed = FeedMessage.decode(new Uint8Array(buffer));

    // Extract vehicle positions into clean JSON
    const vehicles = [];
    for (const entity of feed.entity) {
      if (entity.vehicle && entity.vehicle.position) {
        const v = entity.vehicle;
        const routeId = v.trip ? v.trip.routeId || '' : '';

        // Extract route number from PTV routeId format "aus:vic:vic-03-{ROUTE}:"
        // e.g. "aus:vic:vic-03-96:" → route "96"
        // e.g. "aus:vic:vic-03-109:" → route "109"
        let routeNum = '';
        if (routeId) {
          const match = routeId.match(/vic-03-(\d+)/);
          if (match) routeNum = match[1];
        }

        vehicles.push({
          id: v.vehicle ? v.vehicle.id || '' : '',
          label: v.vehicle ? v.vehicle.label || '' : '',
          la: v.position.latitude,
          lo: v.position.longitude,
          bearing: v.position.bearing || 0,
          speed: v.position.speed || 0,
          routeId: routeId,
          route: routeNum,
          tripId: v.trip ? v.trip.tripId || '' : '',
          dirId: v.trip ? (v.trip.directionId || 0) : 0,
          ts: v.timestamp ? Number(v.timestamp) : 0
        });
      }
    }

    const result = {
      timestamp: feed.header.timestamp ? Number(feed.header.timestamp) : 0,
      count: vehicles.length,
      vehicles: vehicles
    };

    // Cache
    cachedData = result;
    cachedAt = now;

    return res.status(200).json(result);

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({
      error: 'Failed to fetch or decode GTFS-RT feed',
      detail: err.message
    });
  }
};
