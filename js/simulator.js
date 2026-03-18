// ═══════════════════════════════════════════════════════════════════
// OpsView Timetable Simulator
// Replaces random tram generation with real timetable-driven placement.
// Loads data/timetable.json (3,200+ trips across 24 routes).
// 12 routes have real HASTUS signpost schedules; 12 use synthetic timing
// interpolated along GTFS route shapes.
//
// Usage: set a time of day via the time picker, press play, trams appear
// at their scheduled positions and advance between signposts in real time
// (scaled by TIME_SCALE).
// ═══════════════════════════════════════════════════════════════════

(function(){
'use strict';

// Wait for app.js to be ready
function init(){
  if(!window._opsviewReady){
    document.addEventListener('opsview-ready', init);
    return;
  }

  // ── REFERENCES ──
  var R = window.R;
  var rks = window.rks;
  var map = window.map;
  var trams = window.trams;
  var mkIcon = window.mkIcon;
  var tPos = window.tPos;
  var sc = window.sc;
  var geoDist = window.geoDist;
  var uSt = window.uSt;
  var aR = window.aR;
  var aFilt = window.aFilt;
  var DIR_DATA = {
    '1':  {fwdDn:true,  dn:'East Coburg',      up:'South Melbourne Beach'},
    '3':  {fwdDn:true,  dn:'Melbourne Uni',     up:'East Malvern'},
    '5':  {fwdDn:true,  dn:'Melbourne Uni',     up:'Malvern'},
    '6':  {fwdDn:true,  dn:'Moreland',          up:'Glen Iris'},
    '11': {fwdDn:false, dn:'West Preston',      up:'Victoria Harbour'},
    '12': {fwdDn:true,  dn:'Victoria Gardens',  up:'St Kilda'},
    '16': {fwdDn:true,  dn:'Melbourne Uni',     up:'Kew'},
    '19': {fwdDn:true,  dn:'North Coburg',      up:'Flinders St'},
    '30': {fwdDn:false, dn:'St Vincents Plz',   up:'Central Pier'},
    '35': {fwdDn:true,  dn:'City Circle',       up:'City Circle'},
    '48': {fwdDn:true,  dn:'North Balwyn',      up:'Victoria Harbour'},
    '57': {fwdDn:true,  dn:'West Maribyrnong',  up:'Flinders St'},
    '58': {fwdDn:true,  dn:'West Coburg',       up:'Toorak'},
    '59': {fwdDn:true,  dn:'Airport West',      up:'Flinders St'},
    '64': {fwdDn:true,  dn:'Melbourne Uni',     up:'East Brighton'},
    '67': {fwdDn:true,  dn:'Melbourne Uni',     up:'Carnegie'},
    '70': {fwdDn:true,  dn:'Wattle Park',       up:'Docklands'},
    '72': {fwdDn:true,  dn:'Melbourne Uni',     up:'Camberwell'},
    '75': {fwdDn:true,  dn:'Vermont South',     up:'Central Pier'},
    '78': {fwdDn:true,  dn:'North Richmond',    up:'Balaclava'},
    '82': {fwdDn:true,  dn:'Footscray',         up:'Moonee Ponds'},
    '86': {fwdDn:false, dn:'Bundoora RMIT',     up:'Waterfront City'},
    '96': {fwdDn:true,  dn:'East Brunswick',    up:'St Kilda Beach'},
    '109':{fwdDn:false, dn:'Box Hill',          up:'Port Melbourne'}
  };

  // ── STATE ──
  var timetableData = null;   // loaded from JSON
  var signpostLookup = null;  // code -> {lat, lng}
  var simTime = 0;            // seconds since midnight (sim clock)
  var simPlaying = false;
  var simLastRealMs = 0;      // real wall clock at last tick
  var simAnimFrame = null;
  var simTrams = [];          // tram objects managed by simulator
  var simMarkers = [];        // Leaflet markers for sim trams
  var simInitialised = false;
  var SIM_MODE = false;       // true = simulator active, false = original mock mode

  // ── DISRUPTION TRACKING ──
  // tripImpacts: log of trips affected by disruptions
  // Each entry: {run, seq, route, disId, impact:'short'|'cancelled'|'late', scheduledStart, scheduledEnd}
  var tripImpacts = [];

  // Per-tram short-working state (during disruption)
  // When a tram is in turnback mode, it bounces between its crossover and
  // the nearest terminus/turnaround, using the GTFS shape for movement.
  // _shortWork: {
  //   active: true,
  //   xoLat, xoLng: crossover position (the boundary)
  //   termLat, termLng: the terminus/end the tram runs back to
  //   shape: array of [lat,lng] for the short-working path
  //   shapeIdx: current position along the shape
  //   direction: 1 or -1 (forward/backward along shape)
  //   speed: metres per sim-second
  //   consumedTrips: [{run, seq}] — trips that should have run but didn't
  // }

  // Fleet IDs
  var fleetIdx = 0;
  var FL = [];
  for(var i=1;i<=250;i++) FL.push('T'+(2000+i));

  // ── LOAD DATA ──
  function loadTimetable(){
    return fetch('data/timetable.json')
      .then(function(r){ return r.json(); })
      .then(function(d){ timetableData = d; })
      .catch(function(e){ console.warn('Simulator: timetable.json not found', e); });
  }

  function loadSignposts(){
    return fetch('data/signposts.json')
      .then(function(r){ return r.json(); })
      .then(function(d){
        signpostLookup = {};
        if(Array.isArray(d)){
          d.forEach(function(s){ signpostLookup[s.code] = {lat: s.lat, lng: s.lng, name: s.name}; });
        }
      })
      .catch(function(e){ console.warn('Simulator: signposts.json not loaded', e); signpostLookup = {}; });
  }

  // ── TIME HELPERS ──
  function secsToHHMM(s){
    s = ((s % 86400) + 86400) % 86400;
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
  }
  function secsToHHMMSS(s){
    s = ((s % 86400) + 86400) % 86400;
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = Math.floor(s % 60);
    return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
  }
  function hhmmToSecs(hhmm){
    var parts = hhmm.split(':');
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60;
  }

  // ── FIND ACTIVE TRIPS AT A GIVEN TIME ──
  // Returns array of {route, run, seq, dir, waypoints, progress}
  // where progress = fraction through the trip, and we interpolate position
  function getActiveTrips(timeSecs){
    if(!timetableData) return [];
    var active = [];

    rks.forEach(function(routeId){
      var routeRuns = timetableData[routeId];
      if(!routeRuns) return;

      Object.keys(routeRuns).forEach(function(runId){
        var trips = routeRuns[runId];
        for(var ti = 0; ti < trips.length; ti++){
          var trip = trips[ti];
          var wps = trip.w;
          if(!wps || wps.length < 2) continue;

          var startT = wps[0].t;
          var endT = wps[wps.length - 1].t;

          // Handle midnight crossover
          var adjStart = startT;
          var adjEnd = endT;
          var adjTime = timeSecs;
          if(adjEnd < adjStart) adjEnd += 86400;
          if(adjTime < adjStart - 3600) adjTime += 86400; // handle early morning lookup

          if(adjTime >= adjStart && adjTime <= adjEnd){
            active.push({
              route: routeId,
              run: runId,
              seq: trip.q,
              dir: trip.d,
              waypoints: wps,
              isSynthetic: !!trip.syn,
              tripStart: adjStart,
              tripEnd: adjEnd,
              currentTime: adjTime
            });
            break; // one active trip per run at a time
          }
        }
      });
    });

    return active;
  }

  // ── INTERPOLATE POSITION ALONG WAYPOINTS ──
  // For real trips: interpolate between signpost lat/lngs
  // For synthetic trips: interpolate along GTFS route shape
  function interpolatePosition(trip, timeSecs){
    var wps = trip.waypoints;
    var adjTime = timeSecs;
    if(adjTime < wps[0].t - 3600) adjTime += 86400;

    // Find the two waypoints we're between
    for(var i = 0; i < wps.length - 1; i++){
      var t1 = wps[i].t;
      var t2 = wps[i+1].t;
      if(t2 < t1) t2 += 86400; // midnight
      var at = adjTime;
      if(at < t1 - 3600) at += 86400;

      if(at >= t1 && at <= t2){
        var frac = (t2 === t1) ? 0 : (at - t1) / (t2 - t1);

        // Use signpost lookup for names, fall back to waypoint coords
        var sp1 = signpostLookup ? signpostLookup[wps[i].c] : null;
        var sp2 = signpostLookup ? signpostLookup[wps[i+1].c] : null;
        var lat1 = sp1 ? sp1.lat : wps[i].a;
        var lng1 = sp1 ? sp1.lng : wps[i].o;
        var lat2 = sp2 ? sp2.lat : wps[i+1].a;
        var lng2 = sp2 ? sp2.lng : wps[i+1].o;
        var spName1 = sp1 ? sp1.name : wps[i].c;
        var spName2 = sp2 ? sp2.name : wps[i+1].c;

        return {
          lat: lat1 + (lat2 - lat1) * frac,
          lng: lng1 + (lng2 - lng1) * frac,
          nearStop: spName1,
          nextStop: spName2,
          wpIdx: i
        };
      }
    }

    // Past last waypoint — use last known position
    var lastWp = wps[wps.length - 1];
    var sp = signpostLookup ? signpostLookup[lastWp.c] : null;
    return {
      lat: sp ? sp.lat : lastWp.a,
      lng: sp ? sp.lng : lastWp.o,
      nearStop: sp ? sp.name : lastWp.c,
      nextStop: 'Terminus',
      wpIdx: wps.length - 2
    };
  }

  // ── CALCULATE MOCK DEVIATION ──
  // For demo, generate realistic-looking deviation per trip based on
  // time of day and a hash of the run ID
  function calcDeviation(trip, timeSecs){
    // Hash the run+seq for deterministic but varied deviation
    var hash = 0;
    var str = trip.run + '/' + trip.seq;
    for(var i = 0; i < str.length; i++){
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    var base = ((hash & 0x7fffffff) % 200) - 40; // -40 to +160 seconds

    // Peak hour multiplier (more delay 7-9am and 4-6:30pm)
    var hour = timeSecs / 3600;
    var peakMult = 1.0;
    if((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18.5)) peakMult = 1.8;
    else if(hour >= 12 && hour <= 14) peakMult = 1.2;
    else if(hour < 6 || hour > 22) peakMult = 0.5;

    // Progress through trip adds some cumulative delay
    var wps = trip.waypoints;
    var progress = 0;
    if(wps.length > 1){
      var elapsed = timeSecs - wps[0].t;
      var total = wps[wps.length-1].t - wps[0].t;
      if(total > 0) progress = Math.max(0, Math.min(1, elapsed / total));
    }

    var dev = Math.round(base * peakMult + progress * 45);
    return Math.max(-180, Math.min(900, dev));
  }

  // ── BUILD SIM TRAMS ──
  function rebuildSimTrams(){
    // Remove old sim markers
    simTrams.forEach(function(t){
      if(t.mk) map.removeLayer(t.mk);
    });
    simTrams = [];
    fleetIdx = 0;

    // Remove original trams from map
    trams.forEach(function(t){
      if(t.mk){ map.removeLayer(t.mk); t.mk = null; }
    });

    var active = getActiveTrips(simTime);

    active.forEach(function(trip){
      var pos = interpolatePosition(trip, simTime);
      if(!pos) return;

      var dd = DIR_DATA[trip.route] || {fwdDn:true, dn:'', up:''};
      var updn = trip.dir;
      var updnDest = updn === 'Down' ? dd.dn : dd.up;
      var dev = calcDeviation(trip, simTime);

      var tramObj = {
        id: FL[fleetIdx % FL.length],
        route: trip.route,
        run: trip.run + '/' + trip.seq,
        dest: updnDest,
        dir: trip.dir === 'Down' ? 'Outbound' : 'Inbound',
        updn: updn,
        updnDest: updnDest,
        dv: dev,
        vis: aR.has(trip.route),
        searchHide: false,
        // For compatibility with existing code
        path: [{la: pos.lat, lo: pos.lng, n: pos.nearStop}],
        si: 0,
        pr: 0,
        lt: Date.now(),
        // Simulator-specific
        _simTrip: trip,
        _simPos: pos,
        _nearStop: pos.nearStop,
        _nextStop: pos.nextStop
      };

      // Create marker
      var marker = L.marker([pos.lat, pos.lng], {
        icon: mkIcon(tramObj),
        zIndexOffset: 200
      });

      if(tramObj.vis && !tramObj.searchHide) marker.addTo(map);

      marker.on('click', function(){ openSimDetail(tramObj); });
      tramObj.mk = marker;
      simTrams.push(tramObj);
      fleetIdx++;
    });

    // Replace the global trams array so stats/filters/detail work
    window.trams = simTrams;
    trams = simTrams;
    uSt();
  }

  // ── DETAIL PANEL FOR SIM TRAMS ──
  function openSimDetail(t){
    var dp = document.getElementById('dp');
    var did = document.getElementById('did');
    var dbd = document.getElementById('dbd');
    if(!dp || !did || !dbd) return;

    var devStr = window.devTxt(t.dv);
    var c = sc(t.dv);
    var devCol = window.scHex(c);
    var routeCol = (R[t.route] ? R[t.route].c : '#888');
    var arr = t.updn === 'Down' ? '\u25BC' : '\u25B2';

    did.innerHTML = '<span style="color:' + routeCol + '">' + t.id + '</span>';

    // Compute punctuality/reliability from trip signposts
    var puncPct = '—';
    var reliStr = '—';
    var tripSignposts = '';

    if(t._simTrip && t._simTrip.waypoints){
      var wps = t._simTrip.waypoints;
      var totalSP = wps.length;
      // How many signposts has the tram passed? (time-based)
      var passed = 0;
      var adjTime = simTime;
      for(var wi = 0; wi < wps.length; wi++){
        var wpT = wps[wi].t;
        if(adjTime < wpT - 3600) adjTime += 86400;
        if(adjTime >= wpT) passed++;
      }
      reliStr = passed + '/' + totalSP;

      // Punctuality: how many passed signposts were on time (within 120s)?
      var onTime = 0;
      for(var wi2 = 0; wi2 < Math.min(passed, wps.length); wi2++){
        if(Math.abs(t.dv) <= 119) onTime++;
      }
      puncPct = passed > 0 ? Math.round(onTime / passed * 100) + '%' : '—';

      // Build signpost schedule table for current trip
      tripSignposts = '<div class="ds"><div class="dst">Trip Signposts — ' + t.run + '</div>';
      tripSignposts += '<table style="width:100%;font-size:9px;font-family:\'JetBrains Mono\',monospace;border-collapse:collapse">';
      tripSignposts += '<tr style="color:var(--tx3);font-size:8px"><th style="text-align:left;padding:2px 3px">Seq</th><th style="text-align:left;padding:2px 3px">Code</th><th style="text-align:left;padding:2px 3px">Name</th><th style="padding:2px 3px">Sched</th><th style="padding:2px 3px">Status</th></tr>';

      for(var si = 0; si < wps.length; si++){
        var wp = wps[si];
        var spName = signpostLookup && signpostLookup[wp.c] ? signpostLookup[wp.c].name : wp.c;
        var schedTime = secsToHHMM(wp.t);
        var wpAdj = wp.t;
        var status = '';
        var rowStyle = '';

        if(simTime >= wpAdj || (simTime + 86400) >= wpAdj){
          // Passed this signpost
          var devAtSP = t.dv; // simplified — use tram's current deviation
          if(Math.abs(devAtSP) <= 119) status = '<span style="color:var(--grn)">\u2713 On time</span>';
          else if(devAtSP > 0) status = '<span style="color:var(--blu)">' + window.devTxt(devAtSP) + '</span>';
          else status = '<span style="color:var(--yel)">' + window.devTxt(devAtSP) + '</span>';
        } else {
          status = '<span style="color:var(--tx3)">—</span>';
          rowStyle = 'opacity:0.5';
        }

        // Highlight if this signpost is in a disrupted zone
        var isDisrupted = false;
        if(t.blockedByDis){
          isDisrupted = true; // simplified — all signposts on a disrupted tram are potentially affected
        }

        tripSignposts += '<tr style="border-bottom:1px solid var(--bdr);' + rowStyle + '">';
        tripSignposts += '<td style="padding:2px 3px;color:var(--tx3)">' + si + '</td>';
        tripSignposts += '<td style="padding:2px 3px;font-weight:600">' + wp.c + '</td>';
        tripSignposts += '<td style="padding:2px 3px;font-size:8px;color:var(--tx2)">' + spName + '</td>';
        tripSignposts += '<td style="padding:2px 3px;text-align:center">' + schedTime + '</td>';
        tripSignposts += '<td style="padding:2px 3px;text-align:center">' + status + '</td>';
        tripSignposts += '</tr>';
      }
      tripSignposts += '</table></div>';
    }

    // Disruption status section
    var disSection = '';
    if(t.blockedByDis){
      var stateLabel = t.blockState === 'trapped' ? '\u25A0 TRAPPED' : '\u21C4 SHORT-WORKING';
      var stateCol = t.blockState === 'trapped' ? '#ff5252' : '#f5a623';
      disSection = '<div class="ds"><div class="dst" style="color:' + stateCol + '">\u26A0 Disruption</div>' +
        '<div class="dr"><span class="dlb">Status</span><span class="dva" style="color:' + stateCol + '">' + stateLabel + '</span></div>' +
        '<div class="dr"><span class="dlb">Blocked By</span><span class="dva">Disruption #' + t.blockedByDis + '</span></div>' +
        '</div>';
    }

    dbd.innerHTML =
      '<div class="ds"><div class="dst">Service</div>' +
      '<div class="dr"><span class="dlb">Tram #</span><span class="dva">' + t.id + '</span></div>' +
      '<div class="dr"><span class="dlb">Run #</span><span class="dva">' + (t._simTrip ? t._simTrip.run : '—') + '</span></div>' +
      '<div class="dr"><span class="dlb">Trip</span><span class="dva">' + t.run + '</span></div>' +
      '<div class="dr"><span class="dlb">Route</span><span class="dva" style="color:' + routeCol + '">' + t.route + '</span></div>' +
      '<div class="dr"><span class="dlb">Direction</span><span class="dva">' + arr + ' ' + t.updn + '</span></div>' +
      '<div class="dr"><span class="dlb">Destination</span><span class="dva">' + t.updnDest + '</span></div>' +
      '<div class="dr"><span class="dlb">Source</span><span class="dva" style="font-size:9px;color:var(--tx3)">' +
        (t._simTrip && t._simTrip.isSynthetic ? 'Synthetic' : 'HASTUS') + '</span></div>' +
      '</div>' +
      '<div class="ds"><div class="dst">Position</div>' +
      '<div class="dr"><span class="dlb">Current Stop</span><span class="dva">' + (t._nearStop || '—') + '</span></div>' +
      '<div class="dr"><span class="dlb">Next Stop</span><span class="dva">' + (t._nextStop || '—') + '</span></div>' +
      '</div>' +
      '<div class="ds"><div class="dst">Performance</div>' +
      '<div class="dr"><span class="dlb">Deviation</span><span class="dva"><span class="dvb ' + c + '">' + devStr + '</span></span></div>' +
      '<div class="dr"><span class="dlb">Punctuality</span><span class="dva">' + puncPct + '</span></div>' +
      '<div class="dr"><span class="dlb">Reliability</span><span class="dva">' + reliStr + '</span></div>' +
      '</div>' +
      disSection +
      '<div class="ds"><div class="dst">Crew</div><div class="dpn">Driver \u2014 Pending feed integration</div></div>' +
      tripSignposts;

    dp.classList.add('open');
    window._simSelectedTram = t;
  }

  // ── ANIMATION LOOP (DISRUPTION-AWARE) ──
  function simAnim(){
    if(!SIM_MODE || !simPlaying){
      simAnimFrame = null;
      return;
    }

    var now = Date.now();
    var realDeltaMs = now - simLastRealMs;
    simLastRealMs = now;

    // Advance sim time by (real delta * speed scale)
    var scale = parseInt(document.getElementById('spdSel').value) || 5;
    var simDeltaSecs = (realDeltaMs / 1000) * scale;
    simTime += simDeltaSecs;
    simTime = simTime % 86400;

    // Update clock display
    updateSimClock();

    // Every 2 real seconds, rescan for new/ended trips
    if(!simAnim._lastRescan) simAnim._lastRescan = now;
    if(now - simAnim._lastRescan > 2000){
      simAnim._lastRescan = now;
      rescanTrips();
    }

    // Get active disruptions
    var disruptions = window.disruptions || [];

    // Update positions of existing trams
    simTrams.forEach(function(t){
      // ── TRAPPED: freeze in place, accumulate delay ──
      if(t.blockState === 'trapped'){
        t.dv = Math.min(900, (t._preTrapDv||0) + Math.round((simTime - (t._trappedAtSim||simTime))));
        // Update icon (shows STOP)
        if(t.mk && t.vis) t.mk.setIcon(mkIcon(t));
        return;
      }

      // ── SHORT-WORKING: bouncing between crossover and safe terminus ──
      if(t._shortWork && t._shortWork.active){
        var sw = t._shortWork;
        var distPerFrame = sw.speed * simDeltaSecs; // metres to move this frame
        
        // Advance along shape
        var shape = sw.shape;
        if(!shape || shape.length < 2){ return; }
        
        var moved = 0;
        while(moved < distPerFrame && sw.shapeIdx >= 0 && sw.shapeIdx < shape.length - 1){
          var ci = sw.shapeIdx;
          var ni = ci + sw.direction;
          if(ni < 0 || ni >= shape.length){
            // Hit end — reverse
            sw.direction *= -1;
            // Flip tram direction display
            t.updn = t.updn === 'Down' ? 'Up' : 'Down';
            t.dir = t.dir === 'Outbound' ? 'Inbound' : 'Outbound';
            var dd = DIR_DATA[t.route];
            if(dd) t.updnDest = t.updn === 'Down' ? dd.dn : dd.up;
            t.dest = t.updnDest;
            break;
          }
          var segLen = geoDist(shape[ci][0], shape[ci][1], shape[ni][0], shape[ni][1]);
          if(moved + segLen > distPerFrame){
            // Partial segment — interpolate
            var frac = (distPerFrame - moved) / segLen;
            var lat = shape[ci][0] + (shape[ni][0] - shape[ci][0]) * frac;
            var lng = shape[ci][1] + (shape[ni][1] - shape[ci][1]) * frac;
            t.path = [{la: lat, lo: lng, n: t._nearStop}];
            moved = distPerFrame;
          } else {
            sw.shapeIdx = ni;
            moved += segLen;
          }
        }
        
        // Update position from shape
        var idx = Math.max(0, Math.min(sw.shapeIdx, shape.length - 1));
        t.path = [{la: shape[idx][0], lo: shape[idx][1], n: 'Short working'}];
        t._simPos = {lat: shape[idx][0], lng: shape[idx][1]};
        t._nearStop = 'Short working';
        t._nextStop = t.updnDest;
        
        // Accumulate delay
        t.dv = Math.min(900, (t._preTrapDv||0) + Math.round((simTime - (t._trappedAtSim||simTime)) * 0.5));
        
        // Track consumed trips — check if any scheduled trips for this run
        // have started and ended while we're short-working
        trackConsumedTrips(t);

        if(t.mk && t.vis){
          t.mk.setLatLng([shape[idx][0], shape[idx][1]]);
          t.mk.setIcon(mkIcon(t));
        }
        return;
      }

      // ── NORMAL TIMETABLE MOVEMENT ──
      if(!t._simTrip) return;
      var pos = interpolatePosition(t._simTrip, simTime);
      if(!pos) return;

      t._simPos = pos;
      t._nearStop = pos.nearStop;
      t._nextStop = pos.nextStop;
      t.dv = calcDeviation(t._simTrip, simTime);
      t.path = [{la: pos.lat, lo: pos.lng, n: pos.nearStop}];

      // ── CHECK: has this tram entered a disruption zone? ──
      if(!t.blockedByDis && disruptions.length > 0){
        checkSimTramDisruption(t, disruptions);
      }

      if(t.mk && t.vis && !t.searchHide){
        t.mk.setLatLng([pos.lat, pos.lng]);
        t.mk.setIcon(mkIcon(t));
      }
    });

    uSt();

    // Update selected tram detail
    if(window._simSelectedTram){
      var sel = window._simSelectedTram;
      if(sel._simTrip || sel._shortWork) openSimDetail(sel);
    }

    simAnimFrame = requestAnimationFrame(simAnim);
  }

  // ── CHECK IF A SIM TRAM SHOULD BE DISRUPTED ──
  function checkSimTramDisruption(t, disruptions){
    var pos = t._simPos;
    if(!pos) return;

    for(var di = 0; di < disruptions.length; di++){
      var dis = disruptions[di];
      var affectedRoutes = dis.routes || [dis.route];
      if(affectedRoutes.indexOf(t.route) < 0) continue;

      var affectDown = (dis.dir === 'Both directions' || dis.dir === 'Down only');
      var affectUp   = (dis.dir === 'Both directions' || dis.dir === 'Up only');
      if(t.updn === 'Down' && !affectDown) continue;
      if(t.updn === 'Up'   && !affectUp)   continue;

      // No crossover data — proximity trap
      if(!dis.southXO && !dis.northXO){
        if(geoDist(pos.lat, pos.lng, dis.la, dis.lo) < 300){
          trapSimTram(t, dis);
        }
        return;
      }

      // Geographic classification
      var dToSouth = dis.southXO ? geoDist(pos.lat, pos.lng, dis.southXO.la, dis.southXO.lo) : 99999;
      var dToNorth = dis.northXO ? geoDist(pos.lat, pos.lng, dis.northXO.la, dis.northXO.lo) : 99999;
      var dToDis = geoDist(pos.lat, pos.lng, dis.la, dis.lo);
      var xoSpan = (dis.southXO && dis.northXO) ? geoDist(dis.southXO.la, dis.southXO.lo, dis.northXO.la, dis.northXO.lo) : 9999;

      var isBetween = (dToDis < xoSpan * 0.6) && (dToSouth < xoSpan) && (dToNorth < xoSpan);

      if(isBetween){
        trapSimTram(t, dis);
      } else {
        // Outside — assign turnback to nearer crossover
        var nearerIsSouth = (dToSouth < dToNorth);
        var xo = nearerIsSouth ? dis.southXO : dis.northXO;
        if(xo){
          startShortWorking(t, dis, xo);
        }
      }
      return; // only process first matching disruption
    }
  }

  // ── TRAP A TRAM (between crossovers) ──
  function trapSimTram(t, dis){
    t.blockedByDis = dis.id;
    t.blockState = 'trapped';
    t._trappedAtSim = simTime;
    t._preTrapDv = t.dv;
    
    // Log trip impact
    if(t._simTrip){
      tripImpacts.push({
        run: t._simTrip.run, seq: t._simTrip.seq, route: t.route,
        disId: dis.id, impact: 'short', 
        scheduledStart: t._simTrip.tripStart, scheduledEnd: t._simTrip.tripEnd,
        impactTime: simTime
      });
    }
    if(t.mk && t.vis) t.mk.setIcon(mkIcon(t));
  }

  // ── START SHORT-WORKING (turnback at crossover) ──
  function startShortWorking(t, dis, xo){
    t.blockedByDis = dis.id;
    t.blockState = 'turnback_south'; // generic label for icon
    t._turnbackXO = xo;
    t._trappedAtSim = simTime;
    t._preTrapDv = t.dv;

    // Build short-working path from tram's current position to crossover
    // using the GTFS route shape
    var routeShape = R[t.route] ? R[t.route].fwd : null;
    if(!routeShape || routeShape.length < 2){
      // Fallback: just trap
      t.blockState = 'trapped';
      return;
    }

    // Find nearest shape point to tram
    var pos = t._simPos || {lat: t.path[0].la, lng: t.path[0].lo};
    var tramIdx = nearestShapeIdx(routeShape, pos.lat, pos.lng);
    
    // Find nearest shape point to crossover
    var xoIdx = nearestShapeIdx(routeShape, xo.la, xo.lo);

    // Build sub-shape between tram and crossover
    var startIdx = Math.min(tramIdx, xoIdx);
    var endIdx = Math.max(tramIdx, xoIdx);
    var subShape = [];
    for(var i = startIdx; i <= endIdx; i++){
      subShape.push([routeShape[i][0], routeShape[i][1]]);
    }
    if(subShape.length < 2){
      subShape = [[pos.lat, pos.lng], [xo.la, xo.lo]];
    }

    // Determine initial direction along sub-shape
    // If tram is at the low index end, direction = +1 (toward XO)
    // If tram is at the high index end, direction = -1
    var initDir = (tramIdx <= xoIdx) ? 1 : -1;

    // Average tram speed: ~20 km/h = ~5.5 m/s
    t._shortWork = {
      active: true,
      xoLat: xo.la, xoLng: xo.lo,
      shape: subShape,
      shapeIdx: (initDir === 1) ? 0 : subShape.length - 1,
      direction: initDir,
      speed: 5.5,
      consumedTrips: [],
      lastTripCheck: simTime
    };

    // Log initial trip impact
    if(t._simTrip){
      tripImpacts.push({
        run: t._simTrip.run, seq: t._simTrip.seq, route: t.route,
        disId: dis.id, impact: 'short',
        scheduledStart: t._simTrip.tripStart, scheduledEnd: t._simTrip.tripEnd,
        impactTime: simTime
      });
    }

    if(t.mk && t.vis) t.mk.setIcon(mkIcon(t));
  }

  // ── FIND NEAREST SHAPE POINT INDEX ──
  function nearestShapeIdx(shape, lat, lng){
    var bestD = Infinity, bestI = 0;
    for(var i = 0; i < shape.length; i++){
      var d = geoDist(lat, lng, shape[i][0], shape[i][1]);
      if(d < bestD){ bestD = d; bestI = i; }
    }
    return bestI;
  }

  // ── TRACK CONSUMED TRIPS DURING SHORT-WORKING ──
  function trackConsumedTrips(t){
    if(!t._shortWork || !timetableData) return;
    var sw = t._shortWork;
    
    // Check every ~60 sim seconds
    if(simTime - sw.lastTripCheck < 60) return;
    sw.lastTripCheck = simTime;

    // Find the run this tram belongs to
    var runId = t._simTrip ? t._simTrip.run : null;
    if(!runId) return;
    var routeRuns = timetableData[t.route];
    if(!routeRuns || !routeRuns[runId]) return;

    var trips = routeRuns[runId];
    for(var ti = 0; ti < trips.length; ti++){
      var trip = trips[ti];
      var wps = trip.w;
      if(!wps || wps.length < 2) continue;

      var tripStart = wps[0].t;
      var tripEnd = wps[wps.length - 1].t;
      if(tripEnd < tripStart) tripEnd += 86400;

      // Trip has ended while we're short-working?
      var adjTime = simTime;
      if(adjTime < tripStart - 3600) adjTime += 86400;

      if(adjTime > tripEnd){
        var key = runId + '/' + trip.q;
        if(sw.consumedTrips.indexOf(key) < 0){
          sw.consumedTrips.push(key);
          tripImpacts.push({
            run: runId, seq: trip.q, route: t.route,
            disId: t.blockedByDis, impact: 'cancelled',
            scheduledStart: tripStart, scheduledEnd: tripEnd,
            impactTime: simTime
          });
        }
      }
    }
  }

  // ── CLEAR DISRUPTION FROM SIM TRAMS ──
  function simClearDisruption(disId){
    simTrams.forEach(function(t){
      if(t.blockedByDis !== disId) return;

      // Find the best trip to cut back into
      var resumed = tryResumeTrip(t);

      // Clear disruption state
      delete t.blockedByDis;
      delete t.blockState;
      delete t._turnbackXO;
      delete t._trappedAtSim;
      delete t._preTrapDv;
      if(t._shortWork) t._shortWork.active = false;
      delete t._shortWork;

      if(!resumed){
        // No trip found — tram is effectively out of service until next scheduled trip
        // The rescan will pick it up when the next trip starts
      }

      if(t.mk && t.vis) t.mk.setIcon(mkIcon(t));
    });
  }

  // ── RESUME TRIP AFTER DISRUPTION CLEAR ──
  // Find the next trip for this run where the tram can reach a signpost
  // at the right time going the right direction
  function tryResumeTrip(t){
    if(!timetableData) return false;
    var runId = t._simTrip ? t._simTrip.run : null;
    if(!runId) return false;
    var routeRuns = timetableData[t.route];
    if(!routeRuns || !routeRuns[runId]) return false;

    var pos = t._simPos || {lat: t.path[0].la, lng: t.path[0].lo};
    var tramDir = t.updn; // 'Down' or 'Up'
    var trips = routeRuns[runId];

    // Average tram speed for reachability: ~20 km/h = 333 m/min
    var SPEED_M_PER_SEC = 5.5;

    for(var ti = 0; ti < trips.length; ti++){
      var trip = trips[ti];
      var wps = trip.w;
      if(!wps || wps.length < 2) continue;

      // Skip trips that have already ended
      var tripEnd = wps[wps.length - 1].t;
      if(tripEnd < wps[0].t) tripEnd += 86400;
      var adjTime = simTime;
      if(adjTime < wps[0].t - 3600) adjTime += 86400;
      if(adjTime > tripEnd) continue;

      // Trip direction must match tram's current direction
      if(trip.d !== tramDir) continue;

      // Scan signposts on this trip — can the tram reach any of them in time?
      for(var wi = 0; wi < wps.length; wi++){
        var wp = wps[wi];
        var wpTime = wp.t;
        if(wpTime < wps[0].t) wpTime += 86400;
        
        // Must be in the future
        if(wpTime <= adjTime) continue;

        // Distance from tram to this signpost
        var wpLat = wp.a, wpLng = wp.o;
        if(signpostLookup && signpostLookup[wp.c]){
          wpLat = signpostLookup[wp.c].lat;
          wpLng = signpostLookup[wp.c].lng;
        }
        if(!wpLat || !wpLng) continue;

        var dist = geoDist(pos.lat, pos.lng, wpLat, wpLng);
        var timeAvailable = wpTime - adjTime; // seconds until this signpost is scheduled
        var timeNeeded = dist / SPEED_M_PER_SEC;

        if(timeNeeded <= timeAvailable){
          // Can reach this signpost in time — cut in here
          t._simTrip = {
            route: t.route,
            run: runId,
            seq: trip.q,
            dir: trip.d,
            waypoints: wps,
            isSynthetic: !!trip.syn,
            tripStart: wps[0].t,
            tripEnd: wps[wps.length - 1].t,
            currentTime: simTime
          };
          t.run = runId + '/' + trip.q;

          // Log as late resumption
          tripImpacts.push({
            run: runId, seq: trip.q, route: t.route,
            disId: t.blockedByDis, impact: 'late',
            scheduledStart: wps[0].t, scheduledEnd: wps[wps.length-1].t,
            impactTime: simTime,
            resumeSignpost: wp.c,
            resumeIdx: wi
          });

          return true;
        }
      }
    }
    return false;
  }

  // ── RESCAN: add new trips, remove ended ones ──
  // Skip trams that are disrupted (trapped or short-working)
  function rescanTrips(){
    var active = getActiveTrips(simTime);
    var activeKeys = {};
    active.forEach(function(trip){
      activeKeys[trip.run + '/' + trip.seq] = trip;
    });

    // Remove ended trips — BUT NOT disrupted trams
    for(var i = simTrams.length - 1; i >= 0; i--){
      var t = simTrams[i];
      if(t.blockedByDis) continue; // don't remove disrupted trams
      var key = t._simTrip ? (t._simTrip.run + '/' + t._simTrip.seq) : '';
      if(!activeKeys[key]){
        if(t.mk) map.removeLayer(t.mk);
        simTrams.splice(i, 1);
      }
    }

    // Add new trips — but not for runs that have a disrupted tram
    var existingKeys = {};
    var disruptedRuns = {};
    simTrams.forEach(function(t){
      if(t._simTrip) existingKeys[t._simTrip.run + '/' + t._simTrip.seq] = true;
      if(t.blockedByDis && t._simTrip) disruptedRuns[t._simTrip.run] = true;
    });

    active.forEach(function(trip){
      var key = trip.run + '/' + trip.seq;
      if(existingKeys[key]) return;
      // Don't spawn new trips for runs that have a disrupted tram
      if(disruptedRuns[trip.run]) return;

      var pos = interpolatePosition(trip, simTime);
      if(!pos) return;

      var dd = DIR_DATA[trip.route] || {fwdDn:true, dn:'', up:''};
      var updn = trip.dir;
      var updnDest = updn === 'Down' ? dd.dn : dd.up;
      var dev = calcDeviation(trip, simTime);

      var tramObj = {
        id: FL[fleetIdx % FL.length],
        route: trip.route,
        run: trip.run + '/' + trip.seq,
        dest: updnDest,
        dir: trip.dir === 'Down' ? 'Outbound' : 'Inbound',
        updn: updn,
        updnDest: updnDest,
        dv: dev,
        vis: aR.has(trip.route),
        searchHide: false,
        path: [{la: pos.lat, lo: pos.lng, n: pos.nearStop}],
        si: 0, pr: 0, lt: Date.now(),
        _simTrip: trip,
        _simPos: pos,
        _nearStop: pos.nearStop,
        _nextStop: pos.nextStop
      };

      var marker = L.marker([pos.lat, pos.lng], {
        icon: mkIcon(tramObj),
        zIndexOffset: 200
      });
      if(tramObj.vis && !tramObj.searchHide) marker.addTo(map);
      marker.on('click', function(){ openSimDetail(tramObj); });
      tramObj.mk = marker;
      simTrams.push(tramObj);
      fleetIdx++;
    });

    window.trams = simTrams;
    trams = simTrams;
  }

  // ── CLOCK DISPLAY ──
  function updateSimClock(){
    var cD = document.getElementById('cD');
    var cT = document.getElementById('cT');
    if(!cD || !cT) return;

    // Show sim time with indicator
    cT.textContent = secsToHHMMSS(simTime);
    cD.textContent = 'SIM ';
    cD.style.color = '#f5a623';
  }

  function restoreRealClock(){
    var cD = document.getElementById('cD');
    if(cD) cD.style.color = '';
  }

  // ── UI: TIME PICKER ──
  function buildSimUI(){
    var hr = document.querySelector('.hr');
    if(!hr) return;

    // Insert simulator controls before the clock
    var simCtrl = document.createElement('div');
    simCtrl.id = 'simCtrl';
    simCtrl.className = 'spd';
    simCtrl.style.cssText = 'display:flex;align-items:center;gap:4px;';
    simCtrl.innerHTML =
      '<label style="font-size:9px;color:var(--tx3)">Sim:</label>' +
      '<input type="time" id="simTimeInput" value="07:30" ' +
        'style="width:70px;background:var(--pnl2);border:1px solid var(--bdr);color:var(--txt);' +
        'padding:2px 4px;border-radius:3px;font-family:inherit;font-size:10px;cursor:pointer">' +
      '<button id="simPlayBtn" onclick="window.simTogglePlay()" ' +
        'style="background:var(--pnl2);border:1px solid var(--bdr);color:var(--grn);' +
        'border-radius:3px;padding:2px 8px;font-size:11px;cursor:pointer;font-family:inherit" ' +
        'title="Start/pause timetable simulation">&#9654;</button>' +
      '<button id="simStopBtn" onclick="window.simStop()" ' +
        'style="background:var(--pnl2);border:1px solid var(--bdr);color:var(--mag);' +
        'border-radius:3px;padding:2px 6px;font-size:10px;cursor:pointer;font-family:inherit;display:none" ' +
        'title="Stop simulation and return to mock mode">&#9632;</button>';

    // Insert before the clock div
    var clk = hr.querySelector('.clk');
    if(clk) hr.insertBefore(simCtrl, clk);
    else hr.appendChild(simCtrl);

    // Time input change = jump to that time
    var timeEl = simCtrl.querySelector('#simTimeInput');
    if(timeEl){
      timeEl.addEventListener('change', function(){
        if(SIM_MODE){
          simTime = hhmmToSecs(this.value);
          rebuildSimTrams();
          updateSimClock();
        }
      });
    }
  }

  // ── PUBLIC API ──
  window.simTogglePlay = function(){
    if(!timetableData){
      console.warn('Simulator: timetable data not loaded');
      return;
    }

    if(!SIM_MODE){
      // Entering sim mode
      SIM_MODE = true;
      simPlaying = true;

      var timeInput = document.getElementById('simTimeInput');
      simTime = hhmmToSecs(timeInput.value);
      simLastRealMs = Date.now();

      // Clear any existing disruption impacts
      tripImpacts = [];

      // Override disruption functions to work with sim trams
      window._origApplyDis = window.applyDisruptionToTrams;
      window._origClearDis = window.clearDisruptionFromTrams;
      window.applyDisruptionToTrams = function(dis){
        // Use sim-aware disruption application
        var affectedRoutes = dis.routes || [dis.route];
        simTrams.forEach(function(t){
          if(affectedRoutes.indexOf(t.route) < 0 || t.blockedByDis) return;
          var affectDown = (dis.dir === 'Both directions' || dis.dir === 'Down only');
          var affectUp   = (dis.dir === 'Both directions' || dis.dir === 'Up only');
          if(t.updn === 'Down' && !affectDown) return;
          if(t.updn === 'Up'   && !affectUp) return;
          checkSimTramDisruption(t, [dis]);
        });
      };
      window.clearDisruptionFromTrams = function(disId){
        simClearDisruption(disId);
      };

      rebuildSimTrams();

      var playBtn = document.getElementById('simPlayBtn');
      var stopBtn = document.getElementById('simStopBtn');
      var liveEl = document.getElementById('liveStatus');
      if(playBtn){ playBtn.innerHTML = '&#10074;&#10074;'; playBtn.style.color = 'var(--yel)'; }
      if(stopBtn) stopBtn.style.display = '';
      if(liveEl){ liveEl.textContent = 'TIMETABLE SIM'; liveEl.style.color = '#f5a623'; }

      simAnimFrame = requestAnimationFrame(simAnim);
    } else if(simPlaying){
      // Pause
      simPlaying = false;
      var pb1 = document.getElementById('simPlayBtn');
      if(pb1){ pb1.innerHTML = '&#9654;'; pb1.style.color = 'var(--grn)'; }
    } else {
      // Resume
      simPlaying = true;
      simLastRealMs = Date.now();
      var pb2 = document.getElementById('simPlayBtn');
      if(pb2){ pb2.innerHTML = '&#10074;&#10074;'; pb2.style.color = 'var(--yel)'; }
      simAnimFrame = requestAnimationFrame(simAnim);
    }
  };

  window.simStop = function(){
    SIM_MODE = false;
    simPlaying = false;
    if(simAnimFrame) cancelAnimationFrame(simAnimFrame);
    simAnimFrame = null;

    // Restore original disruption functions
    if(window._origApplyDis) window.applyDisruptionToTrams = window._origApplyDis;
    if(window._origClearDis) window.clearDisruptionFromTrams = window._origClearDis;

    // Remove sim markers
    simTrams.forEach(function(t){
      if(t.mk) map.removeLayer(t.mk);
    });
    simTrams = [];

    // Restore original trams (they were removed from map but still in memory)
    // Actually, we need to recreate them since we replaced window.trams
    // Force page reload is cleanest — but let's try restoring
    var pb3 = document.getElementById('simPlayBtn');
    var sb3 = document.getElementById('simStopBtn');
    var le3 = document.getElementById('liveStatus');
    if(pb3){ pb3.innerHTML = '&#9654;'; pb3.style.color = 'var(--grn)'; }
    if(sb3) sb3.style.display = 'none';
    if(le3) le3.textContent = '';
    restoreRealClock();

    // Reload page to cleanly restore mock mode
    location.reload();
  };

  window.simSetTime = function(hhmm){
    simTime = hhmmToSecs(hhmm);
    document.getElementById('simTimeInput').value = hhmm;
    if(SIM_MODE) rebuildSimTrams();
    updateSimClock();
  };

  window.simGetTime = function(){ return secsToHHMM(simTime); };
  window.simGetTimeSecs = function(){ return simTime; };
  window.simIsActive = function(){ return SIM_MODE; };
  window.simGetTripImpacts = function(){ return tripImpacts; };
  window.simClearDisruption = simClearDisruption;

  // ═══════════════════════════════════════════════════════════
  // ATTRIBUTION REPORT BUILDER
  // On disruption clear, computes which signposts were in the
  // disrupted zone, which trips missed them, and classifies
  // each as SHORT / CANCELLED / LATE.
  // ═══════════════════════════════════════════════════════════

  // Find signposts that fall within a disruption zone (between two crossovers)
  function findDisruptedSignposts(dis, route){
    if(!signpostLookup || !timetableData) return [];
    var routeRuns = timetableData[route];
    if(!routeRuns) return [];

    // Get the disruption boundary
    var southXO = dis.southXO;
    var northXO = dis.northXO;
    if(!southXO || !northXO) return [];

    var xoSpan = geoDist(southXO.la, southXO.lo, northXO.la, northXO.lo);

    // Find all unique signpost codes used on this route
    var allCodes = {};
    Object.keys(routeRuns).forEach(function(runId){
      routeRuns[runId].forEach(function(trip){
        trip.w.forEach(function(wp){
          if(!allCodes[wp.c]){
            var sp = signpostLookup[wp.c];
            allCodes[wp.c] = sp ? {lat: sp.lat, lng: sp.lng, name: sp.name} :
                                  {lat: wp.a, lng: wp.o, name: wp.c};
          }
        });
      });
    });

    // Check which signposts fall between the crossovers
    var disrupted = [];
    Object.keys(allCodes).forEach(function(code){
      var sp = allCodes[code];
      if(!sp.lat || !sp.lng) return;
      var dToSouth = geoDist(sp.lat, sp.lng, southXO.la, southXO.lo);
      var dToNorth = geoDist(sp.lat, sp.lng, northXO.la, northXO.lo);
      var dToDis = geoDist(sp.lat, sp.lng, dis.la, dis.lo);
      if(dToSouth < xoSpan * 1.1 && dToNorth < xoSpan * 1.1){
        disrupted.push({code: code, name: sp.name, lat: sp.lat, lng: sp.lng});
      }
    });
    return disrupted;
  }

  // Build the full attribution report for a cleared disruption
  function buildAttributionReport(dis, disStartSim, disEndSim){
    if(!timetableData) return null;

    var affectedRoutes = dis.routes || [dis.route];
    var report = {
      disId: dis.id,
      type: dis.type,
      location: dis.la.toFixed(5) + ', ' + dis.lo.toFixed(5),
      startTime: secsToHHMM(disStartSim),
      endTime: secsToHHMM(disEndSim),
      durationMin: Math.round((disEndSim - disStartSim) / 60),
      routes: affectedRoutes,
      disruptedSignposts: {},
      tripDetails: [],
      summary: {short: 0, cancelled: 0, late: 0, total: 0, runs: 0}
    };

    var allAffectedRuns = new Set();

    affectedRoutes.forEach(function(route){
      // Find disrupted signposts for this route
      var dspots = findDisruptedSignposts(dis, route);
      report.disruptedSignposts[route] = dspots.map(function(s){return s.code;});

      var routeRuns = timetableData[route];
      if(!routeRuns) return;

      // Check each run's trips
      Object.keys(routeRuns).forEach(function(runId){
        var trips = routeRuns[runId];
        var runAffected = false;

        trips.forEach(function(trip){
          var wps = trip.w;
          if(!wps || wps.length < 2) return;

          var tripStart = wps[0].t;
          var tripEnd = wps[wps.length - 1].t;
          if(tripEnd < tripStart) tripEnd += 86400;

          // Does this trip overlap with the disruption window?
          // Zero-duration disruption = no impact
          if(disEndSim <= disStartSim) return;
          if(tripEnd <= disStartSim || tripStart >= disEndSim) return;

          // Which signposts on this trip are in the disrupted zone?
          var missedSignposts = [];
          var tripSignposts = wps.map(function(w){return w.c;});
          var dsCodes = report.disruptedSignposts[route] || [];
          tripSignposts.forEach(function(code){
            if(dsCodes.indexOf(code) >= 0) missedSignposts.push(code);
          });

          // If no signposts missed, this trip doesn't traverse the zone
          if(missedSignposts.length === 0) return;

          // Classify impact
          var impact;
          if(tripStart < disStartSim){
            impact = 'SHORT';  // in progress when disruption started
          } else if(tripEnd <= disEndSim){
            impact = 'CANCELLED'; // entirely within disruption window
          } else {
            impact = 'LATE'; // starts during, ends after — may resume
          }

          runAffected = true;
          report.tripDetails.push({
            run: runId,
            seq: trip.q,
            route: route,
            dir: trip.d,
            start: secsToHHMM(tripStart),
            end: secsToHHMM(tripEnd),
            from: wps[0].c,
            to: wps[wps.length - 1].c,
            impact: impact,
            missedSignposts: missedSignposts,
            status: 'Attributed — awaiting AVM'
          });

          report.summary[impact.toLowerCase()]++;
          report.summary.total++;
        });

        if(runAffected) allAffectedRuns.add(runId);
      });
    });

    report.summary.runs = allAffectedRuns.size;

    // Sort by start time
    report.tripDetails.sort(function(a, b){ return a.start.localeCompare(b.start); });

    return report;
  }

  // ── RENDER ATTRIBUTION IN DISRUPTION LOG ──
  // Override renderDisLog to add attribution detail for cleared disruptions
  var _origRenderDisLog = window.renderDisLog;

  function renderDisLogWithAttribution(){
    // Call original render first
    if(_origRenderDisLog) _origRenderDisLog();

    // Now enhance cleared entries with attribution data
    var body = document.getElementById('dislogBody');
    if(!body) return;

    var logEntries = window.disruptionLog || [];
    logEntries.forEach(function(e){
      if(e.status !== 'cleared' || !e._attribution) return;

      // Find the row for this entry and append attribution detail
      var existingDetail = document.getElementById('attrDetail_' + e.id);
      if(existingDetail) return; // already rendered

      // Find the dislog-row for this entry
      var rows = body.querySelectorAll('.dislog-row');
      for(var ri = 0; ri < rows.length; ri++){
        var row = rows[ri];
        if(row.innerHTML.indexOf('Rt ' + e.route) >= 0 && row.innerHTML.indexOf(e.time) >= 0){
          var detail = document.createElement('div');
          detail.id = 'attrDetail_' + e.id;
          detail.className = 'attr-detail';
          detail.innerHTML = renderAttributionHTML(e._attribution);
          row.parentNode.insertBefore(detail, row.nextSibling);
          break;
        }
      }
    });
  }

  function renderAttributionHTML(rpt){
    if(!rpt) return '';
    var h = '';

    // ── Summary bar ──
    h += '<div class="attr-summary" onclick="var w=this.nextElementSibling;w.classList.toggle(\'open\');this.querySelector(\'.attr-toggle\').classList.toggle(\'open\')">';
    h += '<span class="attr-toggle">&#x25B6;</span> ';
    h += '<b>Attribution Report</b> &nbsp;';
    h += rpt.summary.runs + ' runs · ' + rpt.summary.total + ' trips · ';
    h += '<span style="color:#ff5252">' + rpt.summary.short + ' short</span>';
    if(rpt.summary.cancelled > 0) h += ' · <span style="color:#e040fb">' + rpt.summary.cancelled + ' cancelled</span>';
    h += ' · <span style="color:#f5a623">' + rpt.summary.late + ' late</span>';
    h += ' &nbsp;<span style="color:var(--tx3);font-size:8px">(' + rpt.durationMin + 'min disruption)</span>';
    h += '</div>';

    h += '<div class="attr-table-wrap">';

    // ── Disrupted signposts per route ──
    Object.keys(rpt.disruptedSignposts).forEach(function(route){
      var codes = rpt.disruptedSignposts[route];
      if(codes.length > 0){
        var rcol = (window.R && window.R[route]) ? window.R[route].c : '#888';
        h += '<div class="attr-sp-row"><span style="color:'+rcol+';font-weight:700">Rt ' + route + '</span> disrupted signposts: <span style="color:#ff5252">' + codes.join(' \u2192 ') + '</span></div>';
      }
    });

    // ── Trip table (MAT style) ──
    h += '<table class="attr-tbl">';
    h += '<thead><tr>';
    h += '<th></th><th>Route</th><th>Run</th><th>Seq</th><th>Dir</th>';
    h += '<th>Start</th><th>End</th>';
    h += '<th>From</th><th>To</th>';
    h += '<th>Missed Signposts</th>';
    h += '<th>Reliability</th>';
    h += '<th>Impact</th>';
    h += '<th>Status</th>';
    h += '</tr></thead>';
    h += '<tbody>';

    rpt.tripDetails.forEach(function(td, idx){
      var impCol = td.impact === 'SHORT' ? '#ff5252' : td.impact === 'CANCELLED' ? '#e040fb' : '#f5a623';
      var rcol = (window.R && window.R[td.route]) ? window.R[td.route].c : '#888';
      var rowId = 'attrRow_' + rpt.disId + '_' + idx;
      var detailId = 'attrDet_' + rpt.disId + '_' + idx;

      // Calculate reliability
      var totalSP = 0;
      var missedCount = td.missedSignposts ? td.missedSignposts.length : 0;
      // Look up the trip in timetable to get total signpost count
      if(timetableData && timetableData[td.route]){
        var routeRuns = timetableData[td.route];
        if(routeRuns[td.run]){
          var trips = routeRuns[td.run];
          for(var ti = 0; ti < trips.length; ti++){
            if(trips[ti].q === td.seq){
              totalSP = trips[ti].w.length;
              break;
            }
          }
        }
      }
      var hitSP = totalSP - missedCount;
      var reliStr = totalSP > 0 ? hitSP + '/' + totalSP : '\u2014';
      var reliCol = totalSP > 0 ? (hitSP === totalSP ? 'var(--grn)' : hitSP >= totalSP * 0.8 ? 'var(--yel)' : '#ff5252') : 'var(--tx3)';

      h += '<tr id="' + rowId + '" style="cursor:pointer" onclick="var d=document.getElementById(\'' + detailId + '\');if(d)d.classList.toggle(\'open\')">';
      h += '<td style="color:var(--tx3);font-size:8px">' + (idx + 1) + '</td>';
      h += '<td><span style="color:' + rcol + ';font-weight:700">' + td.route + '</span></td>';
      h += '<td>' + td.run + '</td>';
      h += '<td>' + td.seq + '</td>';
      h += '<td>' + td.dir + '</td>';
      h += '<td>' + td.start + '</td>';
      h += '<td>' + td.end + '</td>';
      h += '<td style="font-size:8px">' + td.from + '</td>';
      h += '<td style="font-size:8px">' + td.to + '</td>';
      h += '<td style="font-size:8px;color:#ff5252">' + (td.missedSignposts.length > 0 ? td.missedSignposts.join(', ') : '\u2014') + '</td>';
      h += '<td style="color:' + reliCol + '">' + reliStr + '</td>';
      h += '<td style="color:' + impCol + ';font-weight:700">' + td.impact + '</td>';
      h += '<td style="font-size:8px;color:var(--tx3)">\u2705 Attributed</td>';
      h += '</tr>';

      // Signpost drill-down row (hidden by default)
      h += '<tr class="attr-detail-row" id="' + detailId + '">';
      h += '<td colspan="13" style="padding:0">';
      h += renderTripSignpostDetail(td);
      h += '</td></tr>';
    });

    h += '</tbody></table>';
    h += '</div>';

    return h;
  }

  // ── SIGNPOST DRILL-DOWN for a single trip ──
  function renderTripSignpostDetail(td){
    if(!timetableData) return '';
    var routeRuns = timetableData[td.route];
    if(!routeRuns || !routeRuns[td.run]) return '';

    var trips = routeRuns[td.run];
    var trip = null;
    for(var ti = 0; ti < trips.length; ti++){
      if(trips[ti].q === td.seq){ trip = trips[ti]; break; }
    }
    if(!trip) return '';

    var wps = trip.w;
    var missedSet = {};
    if(td.missedSignposts) td.missedSignposts.forEach(function(c){ missedSet[c] = true; });

    var h = '<div style="padding:6px 8px;background:var(--pnl);border-top:1px solid var(--bdr)">';
    h += '<div style="font-size:9px;font-weight:700;color:var(--tx2);margin-bottom:4px">Signpost Detail \u2014 ' + td.run + ' Trip ' + td.seq + '</div>';
    h += '<table style="width:100%;font-size:9px;font-family:\'JetBrains Mono\',monospace;border-collapse:collapse">';
    h += '<tr style="color:var(--tx3);font-size:8px"><th style="text-align:left;padding:1px 4px">Seq</th><th style="text-align:left;padding:1px 4px">Code</th><th style="text-align:left;padding:1px 4px">Name</th><th style="padding:1px 4px">Scheduled</th><th style="padding:1px 4px">Status</th></tr>';

    for(var wi = 0; wi < wps.length; wi++){
      var wp = wps[wi];
      var spName = signpostLookup && signpostLookup[wp.c] ? signpostLookup[wp.c].name : wp.c;
      var schedTime = secsToHHMM(wp.t);
      var isMissed = missedSet[wp.c];
      var rowStyle = isMissed ? 'background:#ff525215;' : '';
      var status;

      if(isMissed){
        status = '<span style="color:#ff5252;font-weight:700">\u2716 MISSED</span>';
      } else {
        status = '<span style="color:var(--grn)">\u2713</span>';
      }

      h += '<tr style="border-bottom:1px solid #ffffff06;' + rowStyle + '">';
      h += '<td style="padding:1px 4px;color:var(--tx3)">' + wi + '</td>';
      h += '<td style="padding:1px 4px;font-weight:' + (isMissed ? '700;color:#ff5252' : '600') + '">' + wp.c + '</td>';
      h += '<td style="padding:1px 4px;font-size:8px;color:var(--tx2)">' + spName + '</td>';
      h += '<td style="padding:1px 4px;text-align:center">' + schedTime + '</td>';
      h += '<td style="padding:1px 4px;text-align:center">' + status + '</td>';
      h += '</tr>';
    }

    h += '</table></div>';
    return h;
  }

  // Hook into disruption clear to generate attribution
  var _origRemoveDis = window.removeDis;
  window.removeDis = function(id){
    // Capture disruption data before it's removed
    var dis = (window.disruptions || []).find(function(d){return d.id === id;});
    var disStartSim = null;

    // Find the disruption's sim start time from the log
    var logEntry = (window.disruptionLog || []).find(function(e){return e.id === id && e.status === 'active';});
    if(logEntry && logEntry._simStartTime != null){
      disStartSim = logEntry._simStartTime;
    }

    // Generate attribution report if in sim mode
    if(SIM_MODE && dis && disStartSim != null){
      var report = buildAttributionReport(dis, disStartSim, simTime);
      if(report && logEntry){
        logEntry._attribution = report;
      }
    }

    // Call original removeDis
    if(_origRemoveDis) _origRemoveDis(id);

    // Re-render with attribution
    if(SIM_MODE) setTimeout(renderDisLogWithAttribution, 100);
  };

  // Also hook into addToDisLog to record sim start time
  var _origAddToDisLog = window.addToDisLog;
  window.addToDisLog = function(dis){
    if(_origAddToDisLog) _origAddToDisLog(dis);
    // Tag the log entry with sim start time
    if(SIM_MODE && window.disruptionLog){
      var entry = window.disruptionLog.find(function(e){return e.id === dis.id;});
      if(entry) entry._simStartTime = simTime;
    }
  };

  // Override renderDisLog
  window.renderDisLog = function(){
    if(_origRenderDisLog) _origRenderDisLog();
    if(SIM_MODE) renderDisLogWithAttribution();
  };

  // Expose for external use
  window.simBuildAttributionReport = buildAttributionReport;
  window.simFindDisruptedSignposts = findDisruptedSignposts;

  // ── INITIALISE ──
  Promise.all([loadTimetable(), loadSignposts()]).then(function(){
    try {
      buildSimUI();
      simInitialised = true;
      console.log('Simulator ready — ' +
        (timetableData ? Object.keys(timetableData).length : 0) + ' routes, ' +
        'click play to start');
    } catch(e) {
      console.error('Simulator UI init failed:', e);
    }
  }).catch(function(e){
    console.error('Simulator data load failed:', e);
  });
}

// Boot
if(window._opsviewReady) init();
else document.addEventListener('opsview-ready', init);

})();
