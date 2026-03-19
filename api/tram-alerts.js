// ═══════════════════════════════════════════════════════════
// OpsView — GTFS-RT Service Alerts Proxy
// Fetches the PTV GTFS-RT Service Alerts feed server-side,
// decodes it, and returns clean JSON of active alerts for
// tram routes.
//
// Each alert includes:
//   id, cause, effect, header, description,
//   routes[], stops[] — lists of affected entities
//
// PTV endpoint:
//   https://api.opendata.transport.vic.gov.au/opendata/
//   public-transport/gtfs/realtime/v1/tram/service-alerts
// ═══════════════════════════════════════════════════════════

const protobuf = require('protobufjs');

const ALERTS_URL = 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/tram/service-alerts';

// GTFS-RT proto schema — alert entities only
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
  optional Alert alert = 5;
}
message Alert {
  repeated TimeRange active_period = 1;
  repeated EntitySelector informed_entity = 5;
  optional uint32 cause = 6;
  optional uint32 effect = 7;
  optional TranslatedString header_text = 10;
  optional TranslatedString description_text = 11;
}
message TimeRange {
  optional uint64 start = 1;
  optional uint64 end = 2;
}
message EntitySelector {
  optional string agency_id = 1;
  optional string route_id = 2;
  optional uint32 direction_id = 3;
  optional string trip_id = 4;
  optional string stop_id = 5;
}
message TranslatedString {
  repeated Translation translation = 1;
}
message Translation {
  optional string text = 1;
  optional string language = 2;
}
`;

// GTFS-RT cause enum
const CAUSES = {1:'UNKNOWN_CAUSE',2:'OTHER_CAUSE',3:'TECHNICAL_PROBLEM',4:'STRIKE',5:'DEMONSTRATION',6:'ACCIDENT',7:'HOLIDAY',8:'WEATHER',9:'MAINTENANCE',10:'CONSTRUCTION',11:'POLICE_ACTIVITY',12:'MEDICAL_EMERGENCY'};
// GTFS-RT effect enum
const EFFECTS = {1:'NO_SERVICE',2:'REDUCED_SERVICE',3:'SIGNIFICANT_DELAYS',4:'DETOUR',5:'ADDITIONAL_SERVICE',6:'MODIFIED_SERVICE',7:'OTHER_EFFECT',8:'UNKNOWN_EFFECT',9:'STOP_MOVED',10:'NO_EFFECT',11:'ACCESSIBILITY_ISSUE'};

let cachedRoot = null;
let cachedData = null;
let cachedAt = 0;
const CACHE_MS = 60000; // 60s — alerts don't change as frequently

function getRoot() {
  if (!cachedRoot) cachedRoot = protobuf.parse(PROTO_SCHEMA).root;
  return cachedRoot;
}

function getText(translatedString) {
  if (!translatedString || !translatedString.translation) return '';
  const en = translatedString.translation.find(t => t.language === 'en' || t.language === 'en-AU');
  const first = translatedString.translation[0];
  return (en || first || {}).text || '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

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
    let response = null;
    const attempts = [
      { headers: { 'Ocp-Apim-Subscription-Key': apiKey } },
      { headers: { 'KeyID': apiKey } },
    ];
    for (const attempt of attempts) {
      try {
        const resp = await fetch(ALERTS_URL, { headers: attempt.headers });
        if (resp.ok) { response = resp; break; }
      } catch (e) { /* try next */ }
    }

    if (!response) {
      return res.status(502).json({ error: 'Failed to fetch service alerts from PTV' });
    }

    const buffer = await response.arrayBuffer();
    const root = getRoot();
    const FeedMessage = root.lookupType('FeedMessage');
    const feed = FeedMessage.decode(new Uint8Array(buffer));

    const nowSec = Math.floor(Date.now() / 1000);
    const alerts = [];

    for (const entity of feed.entity) {
      if (!entity.alert) continue;
      const a = entity.alert;

      // Check if alert is currently active
      const periods = a.activePeriod || [];
      const isActive = periods.length === 0 || periods.some(p => {
        const start = p.start ? Number(p.start) : 0;
        const end = p.end ? Number(p.end) : Infinity;
        return nowSec >= start && nowSec <= end;
      });
      if (!isActive) continue;

      // Extract affected routes and stops
      const routes = [];
      const stops = [];
      for (const ie of (a.informedEntity || [])) {
        if (ie.routeId) {
          // Extract route number from PTV routeId "aus:vic:vic-03-{ROUTE}:"
          const match = ie.routeId.match(/vic-03-(\d+)/);
          if (match) routes.push(match[1]);
        }
        if (ie.stopId) stops.push(ie.stopId);
      }

      alerts.push({
        id: entity.id,
        cause: CAUSES[a.cause] || 'UNKNOWN',
        effect: EFFECTS[a.effect] || 'UNKNOWN',
        header: getText(a.headerText),
        description: getText(a.descriptionText),
        routes: [...new Set(routes)], // deduplicate
        stops: [...new Set(stops)],
        activePeriods: periods.map(p => ({
          start: p.start ? Number(p.start) : null,
          end: p.end ? Number(p.end) : null
        }))
      });
    }

    const result = {
      timestamp: feed.header.timestamp ? Number(feed.header.timestamp) : 0,
      count: alerts.length,
      alerts
    };

    cachedData = result;
    cachedAt = now;

    return res.status(200).json(result);

  } catch (err) {
    console.error('Alerts proxy error:', err);
    return res.status(500).json({ error: 'Failed to decode service alerts', detail: err.message });
  }
};
