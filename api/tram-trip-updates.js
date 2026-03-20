// ═══════════════════════════════════════════════════════════
// OpsView — GTFS-RT Trip Updates Proxy
// Fetches the PTV GTFS-RT Trip Updates feed server-side,
// decodes it, and returns a JSON lookup of tripId → delay.
// ═══════════════════════════════════════════════════════════

const protobuf = require('protobufjs');

const TU_URL = 'https://api.opendata.transport.vic.gov.au/opendata/public-transport/gtfs/realtime/v1/tram/trip-updates';

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
  optional TripUpdate trip_update = 3;
}
message TripUpdate {
  optional TripDescriptor trip = 1;
  optional VehicleDescriptor vehicle = 3;
  repeated StopTimeUpdate stop_time_update = 4;
  optional uint64 timestamp = 6;
}
message StopTimeUpdate {
  optional uint32 stop_sequence = 1;
  optional string stop_id = 4;
  optional StopTimeEvent arrival = 2;
  optional StopTimeEvent departure = 3;
  optional int32 schedule_relationship = 5;
}
message StopTimeEvent {
  optional int32 delay = 1;
  optional int64 time = 2;
}
message TripDescriptor {
  optional string trip_id = 1;
  optional string route_id = 5;
  optional uint32 direction_id = 6;
  optional uint32 schedule_relationship = 4;
}
message VehicleDescriptor {
  optional string id = 1;
  optional string label = 2;
}
`;

let cachedRoot = null;
let cachedData = null;
let cachedAt = 0;
const CACHE_MS = 30000;

function getRoot() {
  if (!cachedRoot) {
    cachedRoot = protobuf.parse(PROTO_SCHEMA).root;
  }
  return cachedRoot;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=10');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const now = Date.now();
  if (cachedData && (now - cachedAt) < CACHE_MS) {
    return res.status(200).json(cachedData);
  }

  const apiKey = process.env.PTV_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'PTV_API_KEY not configured' });
  }

  try {
    // Try both auth methods
    let response = null;
    const attempts = [
      { headers: { 'Ocp-Apim-Subscription-Key': apiKey } },
      { headers: { 'KeyID': apiKey } },
    ];

    for (const attempt of attempts) {
      try {
        const resp = await fetch(TU_URL, { headers: attempt.headers });
        if (resp.ok) { response = resp; break; }
      } catch (e) { /* try next */ }
    }

    if (!response) {
      return res.status(502).json({ error: 'Failed to fetch trip updates from PTV' });
    }

    const buffer = await response.arrayBuffer();
    const root = getRoot();
    const FeedMessage = root.lookupType('FeedMessage');
    const feed = FeedMessage.decode(new Uint8Array(buffer));

    // Build a lookup: tripId → { delay, vehicleId, stopId, timestamp, scheduleRelationship }
    // For each trip, take the LAST stop_time_update (most progressed stop)
    // and extract the delay from arrival or departure
    const trips = {};
    let cancelledCount = 0;

    for (const entity of feed.entity) {
      if (!entity.tripUpdate) continue;
      const tu = entity.tripUpdate;
      const tripId = tu.trip ? tu.trip.tripId || '' : '';
      if (!tripId) continue;

      const vehicleId = tu.vehicle ? tu.vehicle.id || '' : '';
      const schedRel = tu.trip ? (tu.trip.scheduleRelationship || 0) : 0;

      // Schedule relationship: 0=SCHEDULED, 1=ADDED, 2=UNSCHEDULED, 3=CANCELED
      if (schedRel === 3) {
        cancelledCount++;
        trips[tripId] = {
          delay: null,
          vehicleId: vehicleId,
          cancelled: true,
          stopId: '',
          nextStopId: '',
          nextStopArrival: null,
          timestamp: tu.timestamp ? Number(tu.timestamp) : 0
        };
        continue;
      }

      // Get the most recent stop_time_update with a delay value
      const stus = tu.stopTimeUpdate || [];
      let bestDelay = null;
      let bestStopId = '';

      for (const stu of stus) {
        // Prefer arrival delay, fall back to departure delay
        let d = null;
        if (stu.arrival && stu.arrival.delay !== null && stu.arrival.delay !== undefined) {
          d = stu.arrival.delay;
        } else if (stu.departure && stu.departure.delay !== null && stu.departure.delay !== undefined) {
          d = stu.departure.delay;
        }
        if (d !== null) {
          bestDelay = d;
          bestStopId = stu.stopId || '';
        }
      }

      // First entry in stop_time_update = next upcoming stop.
      // Assumption: PTV's feed lists stops in stop_sequence order and
      // omits already-passed stops, so stus[0] is always the next stop
      // the tram will reach.  If PTV ever includes past stops, this
      // would need filtering by arrival.time > now.
      const nextStopId = stus.length > 0 ? (stus[0].stopId || '') : '';
      // Scheduled arrival time at next stop (unix seconds), if provided
      const nextStopArrival = stus.length > 0 && stus[0].arrival && stus[0].arrival.time
        ? Number(stus[0].arrival.time) : null;

      trips[tripId] = {
        delay: bestDelay,
        vehicleId: vehicleId,
        cancelled: false,
        stopId: bestStopId,
        nextStopId: nextStopId,
        nextStopArrival: nextStopArrival,
        timestamp: tu.timestamp ? Number(tu.timestamp) : 0
      };
    }

    const result = {
      timestamp: feed.header.timestamp ? Number(feed.header.timestamp) : 0,
      count: Object.keys(trips).length,
      cancelled: cancelledCount,
      trips: trips
    };

    cachedData = result;
    cachedAt = now;

    return res.status(200).json(result);

  } catch (err) {
    console.error('Trip updates proxy error:', err);
    return res.status(500).json({ error: 'Failed to decode trip updates', detail: err.message });
  }
};
