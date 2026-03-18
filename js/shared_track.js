// ══════════════════════════════════════════════════
// SHARED TRACK MODULE — js/shared_track.js
// Visual snapping + FIFO ordering on shared track
// ══════════════════════════════════════════════════
//
// Loaded after app.js. Requires: window.R, window.trams, window.geoDist, window.tPos
//
// How it works:
// 1. On load, builds a lookup: for each route, which shared track segments include it
// 2. Every animation frame, tPos() is monkey-patched to snap tram positions to
//    the canonical geometry when on shared track
// 3. FIFO ordering: trams on the same shared segment travelling the same direction
//    cannot overtake — if tram B is behind tram A and would advance past A, B is held

(function(){
'use strict';

// ── SHARED TRACK REGISTER ──
// Auto-detected from GTFS shape proximity (30m threshold)
// Each segment: { id, routes[], canonicalRoute, startIdx, endIdx, length, geometry[][] }
var SHARED_TRACK = SHARED_TRACK_DATA; // injected from shared_track.json via index.html

// Build route → segment lookup
var routeSegments = {}; // routeId → [segment indices]
SHARED_TRACK.forEach(function(seg, idx){
  seg._idx = idx;
  seg.routes.forEach(function(r){
    if(!routeSegments[r]) routeSegments[r] = [];
    routeSegments[r].push(idx);
  });
  
  // Precompute canonical geometry cumulative distances for snapping
  var cum = [0];
  for(var i = 1; i < seg.geometry.length; i++){
    cum.push(cum[i-1] + geoDist(seg.geometry[i-1][0], seg.geometry[i-1][1],
                                  seg.geometry[i][0], seg.geometry[i][1]));
  }
  seg._cumDist = cum;
  seg._totalLength = cum[cum.length-1];
});

// ── SNAP FUNCTION ──
// Given a lat/lng and a route, find if the point is on a shared track segment.
// If so, return the canonical snapped position.
// Returns: { snapped: true, la, lo, segIdx, along } or { snapped: false }
function snapToSharedTrack(la, lo, routeId){
  var segs = routeSegments[routeId];
  if(!segs) return { snapped: false };
  
  for(var s = 0; s < segs.length; s++){
    var seg = SHARED_TRACK[segs[s]];
    var geom = seg.geometry;
    
    // Project point onto the canonical geometry
    var bestDist = Infinity, bestLa, bestLo, bestAlong = 0;
    var cumDist = 0;
    
    for(var i = 0; i < geom.length - 1; i++){
      var ax = geom[i][0], ay = geom[i][1];
      var bx = geom[i+1][0], by = geom[i+1][1];
      var cosLat = Math.cos((ax+bx)/2 * Math.PI/180);
      var dx = bx - ax, dy = (by - ay) * cosLat;
      var len2 = dx*dx + dy*dy;
      var segLen = geoDist(ax, ay, bx, by);
      var t, snap;
      
      if(len2 < 1e-12){
        t = 0; snap = geoDist(la, lo, ax, ay);
      } else {
        t = Math.max(0, Math.min(1, ((la-ax)*dx + (lo-ay)*cosLat*dy) / len2));
        var px = ax + t*(bx-ax), py = ay + t*(by-ay);
        snap = geoDist(la, lo, px, py);
      }
      
      if(snap < bestDist){
        bestDist = snap;
        bestLa = ax + t*(bx-ax);
        bestLo = ay + t*(by-ay);
        bestAlong = cumDist + t * segLen;
      }
      cumDist += segLen;
    }
    
    // Only snap if the point is within 60m of the canonical line
    if(bestDist < 60){
      return {
        snapped: true,
        la: bestLa,
        lo: bestLo,
        segIdx: segs[s],
        along: bestAlong,
        snapDist: bestDist
      };
    }
  }
  
  return { snapped: false };
}

// ── MONKEY-PATCH tPos ──
// Replace the global tPos function with one that snaps to shared track
var _origTPos = window.tPos;

function sharedTPos(t){
  var origPos = _origTPos(t);
  
  // Try to snap to shared track
  var snap = snapToSharedTrack(origPos[0], origPos[1], t.route);
  if(snap.snapped){
    // Store snap data on tram for FIFO enforcement
    t._sharedSeg = snap.segIdx;
    t._sharedAlong = snap.along;
    return [snap.la, snap.lo];
  } else {
    delete t._sharedSeg;
    delete t._sharedAlong;
    return origPos;
  }
}

// Replace global
window.tPos = sharedTPos;

// ── FIFO ENFORCEMENT ──
// Called periodically to ensure trams on shared track don't overtake each other.
// Groups trams by shared segment + direction, sorts by along-track position,
// and holds any tram that would pass the one ahead of it.
function enforceFIFO(){
  // Group trams by segment + direction
  var groups = {}; // key: "segIdx:dir" → [tram, ...]
  
  trams.forEach(function(t){
    if(t._sharedSeg === undefined || !t.vis) return;
    var key = t._sharedSeg + ':' + t.dir;
    if(!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  
  // For each group, sort by along-track position and enforce ordering
  Object.keys(groups).forEach(function(key){
    var group = groups[key];
    if(group.length < 2) return;
    
    var isOutbound = group[0].dir === 'Outbound';
    
    // Sort by along position
    // Outbound: advancing along increases → sort ascending, leader is last
    // Inbound: advancing along decreases → sort descending, leader is first
    group.sort(function(a, b){
      return isOutbound ? (a._sharedAlong - b._sharedAlong) : (b._sharedAlong - a._sharedAlong);
    });
    
    // Walk from second to last: if a tram is within MIN_GAP of the one ahead, hold it
    var MIN_GAP = 30; // metres — minimum gap between trams
    for(var i = 1; i < group.length; i++){
      var ahead = group[i-1];
      var behind = group[i];
      var gap = Math.abs(behind._sharedAlong - ahead._sharedAlong);
      
      if(gap < MIN_GAP){
        // Hold the tram behind — don't advance this frame
        // We do this by setting progress to 0 so it doesn't interpolate forward
        behind.pr = 0;
        behind._fifoHeld = true;
      } else {
        delete behind._fifoHeld;
      }
    }
  });
}

// Run FIFO enforcement every 500ms (not every frame — too expensive)
setInterval(enforceFIFO, 500);

// ── EXPOSE ──
window.SHARED_TRACK = SHARED_TRACK;
window.snapToSharedTrack = snapToSharedTrack;
window.routeSegments = routeSegments;

console.log('Shared track module loaded: ' + SHARED_TRACK.length + ' segments across ' +
  Object.keys(routeSegments).length + ' routes');

})();