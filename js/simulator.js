// ═══════════════════════════════════════════════════════════════════
// OpsView Timetable Simulator
// Replaces random tram generation with real timetable-driven placement.
// Loads data/timetable.json (6,100+ trips across 24 routes, 569 runs).
// All 24 routes use real signpost schedules and timing points.
// Post-midnight services use times >86400 (e.g. 25:30 = 91800s).
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
  var SIM_MODE = false;       // true = simulator active, false = idle

  // ── DISRUPTION TRACKING ──
  // tripImpacts: log of trips affected by disruptions
  // Each entry: {run, seq, route, disId, impact:'short'|'cancelled'|'late', scheduledStart, scheduledEnd}
  var tripImpacts = [];
  // Recovery actions from the most recent simClearDisruption call, keyed by disId
  var _recoveryActionStore = {};

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
      .then(function(d){ timetableData = d; window._timetableData = d; })
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
  // Realistic multi-factor deviation model for demo/investor scenarios.
  // Each trip gets a stable performance band (chronic early / on-time /
  // typically late / chronic late), then time-of-day and route congestion
  // factors are applied, followed by non-linear trip-progress compounding
  // and a small micro-variation noise term so numbers look live.
  function calcDeviation(trip, timeSecs){
    // ── Deterministic hash for this specific trip ──
    var str = trip.run + '/' + trip.seq;
    var hash = 0;
    for(var i = 0; i < str.length; i++){
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    var h1 = Math.abs(hash) % 10000;          // band selector 0-9999
    var h2 = (Math.abs(hash) >> 8) & 0xfff;  // noise seed A
    var h3 = (Math.abs(hash) >> 20) & 0xfff; // noise seed B

    // ── Performance band (stable per trip across the whole run) ──
    // 10% chronic early | 45% on-time | 30% typically late | 15% chronic late
    var baseDev;
    if     (h1 < 1000) { baseDev = -45 + (h1 / 1000) * 30; }          // -45 to -15s
    else if(h1 < 5500) { baseDev = -10 + ((h1 - 1000) / 4500) * 100; }// -10 to +90s
    else if(h1 < 8500) { baseDev = 90  + ((h1 - 5500) / 3000) * 150; }// 90 to 240s
    else               { baseDev = 240 + ((h1 - 8500) / 1500) * 240; }// 240 to 480s

    // ── Route-specific congestion factor ──
    // Inner-city high-frequency routes suffer more signal/traffic delay
    var routeFactors = {
      '86':1.45,'96':1.35,'109':1.30,'19':1.25,'57':1.20,
      '58':1.15,'11':1.10,'48':1.10,'30':1.20,'35':1.15,
      '12':1.05,'70':1.05,'72':1.05
    };
    var routeFactor = routeFactors[trip.route] || 1.0;

    // ── Time-of-day peak multiplier (bell-curve shaped) ──
    var hour = timeSecs / 3600;
    var peakMult = 1.0;
    if(hour >= 7.5 && hour < 9.5){
      // AM peak: bell peaking ~08:30
      var t1 = (hour - 7.5) / 2.0;
      peakMult = 1.0 + 0.90 * Math.sin(t1 * Math.PI);
    } else if(hour >= 16.0 && hour < 19.0){
      // PM peak: heavier bell peaking ~17:30
      var t2 = (hour - 16.0) / 3.0;
      peakMult = 1.0 + 1.15 * Math.sin(t2 * Math.PI);
    } else if(hour >= 12.0 && hour < 13.5){
      peakMult = 1.18;
    } else if(hour < 5.5 || hour > 23.0){
      peakMult = 0.55;
    } else if(hour >= 9.5 && hour < 12.0){
      // Shoulder ramp up from off-peak to lunch
      peakMult = 0.85 + ((hour - 9.5) / 2.5) * 0.15;
    }

    // ── Non-linear trip-progress compounding ──
    // Delays compound faster in the second half of a long trip
    var wps = trip.waypoints;
    var progress = 0;
    if(wps && wps.length > 1){
      var elapsed = timeSecs - wps[0].t;
      var total = wps[wps.length - 1].t - wps[0].t;
      if(total > 0) progress = Math.max(0, Math.min(1, elapsed / total));
    }
    var progressiveDelay = Math.pow(progress, 0.65) * 70;
    // Amplify compounding for already-late trips
    if(baseDev > 60) progressiveDelay *= 1.0 + (baseDev / 300) * 0.5;

    // ── Micro-variation noise (makes values look live, not static) ──
    // Oscillates on a ~30-second bucket so numbers drift slightly over time
    var timeBucket = Math.floor(timeSecs / 30);
    var noisePhase = ((h2 * timeBucket) % 6283) / 1000;
    var noise = Math.sin(noisePhase + h3 / 500) * 18;

    var dev = Math.round(baseDev * routeFactor * peakMult + progressiveDelay + noise);
    return Math.max(-180, Math.min(1200, dev));
  }

  // ── BUILD SIM TRAMS ──
  // ── SHARED MARKER EVENT BINDING ──
  // Attaches tooltip, click-to-detail and right-click-to-disruption to every
  // sim tram marker.  Called from both rebuildSimTrams and rescanTrips.
  function bindSimMarkerEvents(marker, tramObj){
    // Left-click → open detail panel
    marker.on('click', function(e){
      if(e && e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
      openSimDetail(tramObj, true);
    });
    // Right-click → tram context menu
    marker.on('contextmenu', function(e){
      if(e && e.originalEvent){
        L.DomEvent.stopPropagation(e.originalEvent);
        L.DomEvent.preventDefault(e.originalEvent);
      }
      if(window.openTramCtxMenu) window.openTramCtxMenu(tramObj, e.latlng);
    });
  }

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
      bindSimMarkerEvents(marker, tramObj);
      tramObj.mk = marker;
      simTrams.push(tramObj);
      fleetIdx++;
    });

    // Sync in-place so app.js's local `trams` closure reference stays valid.
    // Simply replacing window.trams would leave app.js's variable pointing at
    // the old empty array, breaking stats, filter, search and the perf panel.
    trams.length = 0;
    for (var si2 = 0; si2 < simTrams.length; si2++) trams.push(simTrams[si2]);
    window.trams = trams;
    uSt();
  }

  // ── DETAIL PANEL FOR SIM TRAMS ──
  // openSimDetail: called both from click handlers (isClick=true) and the
  // animation loop (isClick=false).  On click we use window.oDet() so that
  // other right-panels are closed and selT is set exactly as the rest of the
  // app expects.  On animation-loop refreshes we skip that overhead.
  function openSimDetail(t, isClick){
    var dp = document.getElementById('dp');
    var did = document.getElementById('did');
    var dbd = document.getElementById('dbd');
    if(!dp || !did || !dbd) return;

    if(isClick && window.oDet){
      // Let oDet handle panel management (closes other panels, sets selT,
      // adds the 'open' class).  Its rDet() content will be overwritten
      // immediately below, so the extra DOM write is negligible.
      window.oDet(t);
    } else if(!dp.classList.contains('open')){
      dp.classList.add('open');
    }

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
      tripSignposts = '<div class="ds"><div class="dst">Trip Signposts — ' + (t._simTrip ? t._simTrip.run : t.run) + '</div>';
      tripSignposts += '<table style="width:100%;font-size:9px;font-family:\'JetBrains Mono\',monospace;border-collapse:collapse">';
      tripSignposts += '<tr style="color:var(--tx3);font-size:8px"><th style="text-align:left;padding:2px 3px">Seq</th><th style="text-align:left;padding:2px 3px">Code</th><th style="text-align:left;padding:2px 3px">Name</th><th style="padding:2px 3px">Sched</th><th style="padding:2px 3px">Status</th></tr>';

      // Is this tram turned short (short-working but not just trapped in place)?
      var isShortWorking = t.blockedByDis && t.blockState !== 'trapped' && t.blockState !== 'recovery';

      for(var si = 0; si < wps.length; si++){
        var wp = wps[si];
        var spName = signpostLookup && signpostLookup[wp.c] ? signpostLookup[wp.c].name : wp.c;
        var schedTime = secsToHHMM(wp.t);
        var wpAdj = wp.t;
        var status = '';
        var rowStyle = '';
        var spNameStyle = 'color:var(--tx2)';

        var isPast = (simTime >= wpAdj || (simTime + 86400) >= wpAdj);

        if(isPast){
          // Passed this signpost
          var devAtSP = t.dv;
          if(Math.abs(devAtSP) <= 119) status = '<span style="color:var(--grn)">\u2713 On time</span>';
          else if(devAtSP > 0) status = '<span style="color:var(--blu)">' + window.devTxt(devAtSP) + '</span>';
          else status = '<span style="color:var(--yel)">' + window.devTxt(devAtSP) + '</span>';
        } else if(isShortWorking){
          // Future signpost that won't be served due to turn-short
          status = '<span style="color:#666">\u2715 Cancelled</span>';
          rowStyle = 'opacity:0.35';
          spNameStyle = 'color:#555;text-decoration:line-through';
        } else {
          status = '<span style="color:var(--tx3)">—</span>';
          rowStyle = 'opacity:0.5';
        }

        tripSignposts += '<tr style="border-bottom:1px solid var(--bdr);' + rowStyle + '">';
        tripSignposts += '<td style="padding:2px 3px;color:var(--tx3)">' + si + '</td>';
        tripSignposts += '<td style="padding:2px 3px;font-weight:600">' + wp.c + '</td>';
        tripSignposts += '<td style="padding:2px 3px;font-size:8px;' + spNameStyle + '">' + spName + '</td>';
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
      '<div class="dr"><span class="dlb">Trip</span><span class="dva">' + t.run.split('/').pop() + '</span></div>' +
      '<div class="dr"><span class="dlb">Route</span><span class="dva" style="color:' + routeCol + '">' + t.route + '</span></div>' +
      '<div class="dr"><span class="dlb">Direction</span><span class="dva">' + arr + ' ' + t.updn + '</span></div>' +
      '<div class="dr"><span class="dlb">Destination</span><span class="dva">' + t.updnDest + '</span></div>' +
      '<div class="dr"><span class="dlb">Source</span><span class="dva" style="font-size:9px;color:var(--tx3)">' +
        (t._simTrip && t._simTrip.isSynthetic ? 'Synthetic' : 'Timetable') + '</span></div>' +
      '</div>' +
      '<div class="ds"><div class="dst">Position</div>' +
      '<div class="dr"><span class="dlb">Current Signpost</span><span class="dva">' + (t._nearStop || '—') + '</span></div>' +
      '<div class="dr"><span class="dlb">Next Signpost</span><span class="dva">' + (t._nextStop || '—') + '</span></div>' +
      '</div>' +
      '<div class="ds"><div class="dst">Performance</div>' +
      '<div class="dr"><span class="dlb">Deviation</span><span class="dva"><span class="dvb ' + c + '">' + devStr + '</span></span></div>' +
      '<div class="dr"><span class="dlb">Punctuality</span><span class="dva">' + puncPct + '</span></div>' +
      '<div class="dr"><span class="dlb">Reliability</span><span class="dva">' + reliStr + '</span></div>' +
      '</div>' +
      disSection +
      '<div class="ds"><div class="dst">Crew</div><div class="dpn">Driver \u2014 Pending feed integration</div></div>' +
      tripSignposts +
      '<div class="ds" id="dops"><div class="dst">Operations</div>' +
      '<div class="tram-actions">' +
      '<button class="ta-btn ta-focus" onclick="tramFocus(window._simSelectedTram)">&#x2316; Centre</button>' +
      '<button class="ta-btn ta-track" onclick="tramToggleTrack(window._simSelectedTram)">&#x2609; Track</button>' +
      '<button class="ta-btn ta-dis" onclick="logDisruptionFromTram(window._simSelectedTram)">&#x26A0; Disruption</button>' +
      '</div></div>';

    dp.classList.add('open');
    window._simSelectedTram = t;
    // Show/hide ops section based on role (controller only)
    if(window.aRV) window.aRV();
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
            if(sw.isRecovery){
              // Recovery path is one-way — stop at XO end without reversing;
              // the distToXO check below will fire and call tryResumeTrip.
              break;
            }
            // Normal disruption short-working: reverse direction at ends
            sw.direction *= -1;
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
        
        // For recovery short-working: check if tram has reached the target XO
        if(sw.isRecovery){
          var distToXO = geoDist(t._simPos.lat, t._simPos.lng, sw.xoLat, sw.xoLng);
          if(distToXO < 60){
            sw.active = false;
            delete t._shortWork;
            delete t.blockState;
            tryResumeTrip(t, sw.recoveryFor);
            if(t.mk && t.vis) t.mk.setIcon(mkIcon(t));
            return;
          }
        } else {
          // Track consumed trips — check if any scheduled trips for this run
          // have started and ended while we're short-working
          trackConsumedTrips(t);
        }

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

      // ── DEVIATION JUMP ALERT ──
      // Fire when a tram advances to a new waypoint and the deviation has
      // jumped significantly compared to the previous signpost.
      if(window.Alerts) {
        if(t._lastWpIdx !== undefined && pos.wpIdx === t._lastWpIdx + 1) {
          var newWp = t._simTrip.waypoints[pos.wpIdx];
          window.Alerts.checkSignpostJump(t, pos.wpIdx, newWp ? newWp.c : '?', t.dv);
        } else if(t._lastWpIdx !== undefined && pos.wpIdx !== t._lastWpIdx) {
          // Waypoint index regressed or skipped (trip change) — reset tracking
          window.Alerts.resetTram(t.id);
        }
      }
      t._lastWpIdx = pos.wpIdx;

      // ── CHECK: has this tram entered a disruption zone? ──
      if(!t.blockedByDis && disruptions.length > 0){
        checkSimTramDisruption(t, disruptions);
      }

      if(t.mk && t.vis && !t.searchHide && !t.declutterHide){
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
    if(!pos && t.path && t.path[0]) pos = {lat: t.path[0].la, lng: t.path[0].lo};
    if(!pos) return;

    for(var di = 0; di < disruptions.length; di++){
      var dis = disruptions[di];
      var affectedRoutes = dis.routes || [dis.route];
      if(affectedRoutes.indexOf(t.route) < 0) continue;

      var affectDown = (dis.dir === 'Both directions' || dis.dir === 'Down only');
      var affectUp   = (dis.dir === 'Both directions' || dis.dir === 'Up only');
      if(t.updn === 'Down' && !affectDown) continue;
      if(t.updn === 'Up'   && !affectUp)   continue;

      var dToDis = geoDist(pos.lat, pos.lng, dis.la, dis.lo);

      // No crossover data — synthesize turnback points 500m each side along route shape
      if(!dis.southXO && !dis.northXO){
        var synShape = R[t.route] ? R[t.route].shape : null;
        if(!synShape || synShape.length < 2){
          // Fallback: simple proximity trap only
          if(dToDis < 300) trapSimTram(t, dis);
          return;
        }
        var TURNBACK_M = 500;
        var disShapeIdx = nearestShapeIdx(synShape, dis.la, dis.lo);
        // Walk backward ~500m for south synthetic XO
        var cumS = 0, sIdx = disShapeIdx;
        for(var si2 = disShapeIdx; si2 > 0; si2--){
          cumS += geoDist(synShape[si2][0],synShape[si2][1],synShape[si2-1][0],synShape[si2-1][1]);
          if(cumS >= TURNBACK_M){ sIdx = si2 - 1; break; }
        }
        // Walk forward ~500m for north synthetic XO
        var cumN = 0, nIdx = disShapeIdx;
        for(var ni2 = disShapeIdx; ni2 < synShape.length - 1; ni2++){
          cumN += geoDist(synShape[ni2][0],synShape[ni2][1],synShape[ni2+1][0],synShape[ni2+1][1]);
          if(cumN >= TURNBACK_M){ nIdx = ni2 + 1; break; }
        }
        var synSouth = {la: synShape[sIdx][0], lo: synShape[sIdx][1]};
        var synNorth = {la: synShape[nIdx][0], lo: synShape[nIdx][1]};
        var tramShapeIdx = nearestShapeIdx(synShape, pos.lat, pos.lng);
        if(tramShapeIdx >= sIdx && tramShapeIdx <= nIdx){
          // Tram is inside the block zone — trap it
          trapSimTram(t, dis);
        } else if(tramShapeIdx < sIdx){
          // Approaching from south — turn back at south synthetic XO
          startShortWorking(t, dis, synSouth);
        } else {
          // Approaching from north — turn back at north synthetic XO
          startShortWorking(t, dis, synNorth);
        }
        return;
      }

      // Geographic classification (crossovers known)
      var dToSouth = dis.southXO ? geoDist(pos.lat, pos.lng, dis.southXO.la, dis.southXO.lo) : 99999;
      var dToNorth = dis.northXO ? geoDist(pos.lat, pos.lng, dis.northXO.la, dis.northXO.lo) : 99999;
      var xoSpan = (dis.southXO && dis.northXO) ? geoDist(dis.southXO.la, dis.southXO.lo, dis.northXO.la, dis.northXO.lo) : 9999;

      // When only one XO exists, use route shape to determine if tram is inside the block zone
      var isBetween;
      if(dis.southXO && dis.northXO){
        isBetween = (dToDis < xoSpan * 0.6) && (dToSouth < xoSpan) && (dToNorth < xoSpan);
      } else {
        // Single XO: check via route shape index
        var rShape = R[t.route] ? R[t.route].shape : null;
        if(rShape){
          var disRI = nearestShapeIdx(rShape, dis.la, dis.lo);
          var tramRI = nearestShapeIdx(rShape, pos.lat, pos.lng);
          var xoRI  = dis.southXO ? nearestShapeIdx(rShape, dis.southXO.la, dis.southXO.lo)
                                  : nearestShapeIdx(rShape, dis.northXO.la, dis.northXO.lo);
          // "Between" = tram is on the far side of the disruption from the XO
          isBetween = dis.southXO ? (tramRI > disRI) : (tramRI < disRI);
        } else {
          isBetween = dToDis < 300;
        }
      }

      if(isBetween){
        trapSimTram(t, dis);
      } else {
        // Outside — assign turnback to nearer crossover
        var nearerIsSouth = (dToSouth < dToNorth);
        var xo = nearerIsSouth ? dis.southXO : dis.northXO;
        if(xo){
          startShortWorking(t, dis, xo);
        } else {
          // Both XOs null shouldn't reach here, but trap as fallback
          if(dToDis < 300) trapSimTram(t, dis);
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
    // Tram is now captured — resolve any open deviation alert for it
    if(window.Alerts) window.Alerts.resolveForTram(t.id);
    
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
    // using the GTFS route shape (raw [[lat,lng],...] arrays)
    var routeData = R[t.route];
    var routeShape = routeData ? routeData.shape : null;
    if(!routeShape || routeShape.length < 2){
      // Fallback: just trap
      t.blockState = 'trapped';
      if(t.mk && t.vis) t.mk.setIcon(mkIcon(t));
      return;
    }

    // Find nearest shape point to tram
    var pos = t._simPos || {lat: t.path[0].la, lng: t.path[0].lo};
    var tramIdx = nearestShapeIdx(routeShape, pos.lat, pos.lng);
    
    // Find nearest shape point to crossover
    var xoIdx = nearestShapeIdx(routeShape, xo.la, xo.lo);

    // Build sub-shape between tram and crossover (plus some overshoot
    // to the nearest terminus for the bounce-back)
    // Extend path beyond the tram toward the terminus it came from
    var minIdx = Math.min(tramIdx, xoIdx);
    var maxIdx = Math.max(tramIdx, xoIdx);
    
    // Extend to terminus: go further away from the XO
    var termIdx;
    if(xoIdx > tramIdx){
      // XO is ahead (higher index), terminus is behind (lower index)
      termIdx = Math.max(0, minIdx - 15); // extend 15 shape pts toward terminus
    } else {
      // XO is behind (lower index), terminus is ahead (higher index)
      termIdx = Math.min(routeShape.length - 1, maxIdx + 15);
    }

    var startI = Math.min(termIdx, minIdx);
    var endI = Math.max(termIdx, maxIdx);

    var subShape = [];
    for(var i = startI; i <= endI; i++){
      subShape.push([routeShape[i][0], routeShape[i][1]]);
    }
    if(subShape.length < 2){
      subShape = [[pos.lat, pos.lng], [xo.la, xo.lo]];
    }

    // Determine which end of the sub-shape the tram is at
    var tramSubIdx = nearestShapeIdx(subShape, pos.lat, pos.lng);
    var xoSubIdx = nearestShapeIdx(subShape, xo.la, xo.lo);
    
    // Initial direction: toward the crossover
    var initDir = (tramSubIdx < xoSubIdx) ? 1 : -1;

    // Average tram speed: ~20 km/h = ~5.5 m/s
    t._shortWork = {
      active: true,
      xoLat: xo.la, xoLng: xo.lo,
      shape: subShape,
      shapeIdx: tramSubIdx,
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

  // ── START RECOVERY SHORT-WORKING (post-clearance) ──
  // Like startShortWorking but tram is NOT tagged as disruption-blocked.
  // Tram animates to the recovery XO, then tryResumeTrip picks up the next trip.
  function startRecoveryShortWorking(t, xo, disId){
    var routeData = R[t.route];
    var routeShape = routeData ? routeData.shape : null;
    if(!routeShape || routeShape.length < 2) return false;

    var pos = t._simPos || {lat: t.path[0].la, lng: t.path[0].lo};
    var tramIdx = nearestShapeIdx(routeShape, pos.lat, pos.lng);
    var xoIdx   = nearestShapeIdx(routeShape, xo.la, xo.lo);

    var minIdx = Math.min(tramIdx, xoIdx);
    var maxIdx = Math.max(tramIdx, xoIdx);
    var subShape = [];
    for(var i = minIdx; i <= maxIdx; i++) subShape.push([routeShape[i][0], routeShape[i][1]]);
    if(subShape.length < 2) return false;

    var tramSubIdx = nearestShapeIdx(subShape, pos.lat, pos.lng);
    var xoSubIdx   = nearestShapeIdx(subShape, xo.la, xo.lo);

    // Log the current trip as shortened (recovery)
    if(t._simTrip){
      tripImpacts.push({
        run: t._simTrip.run, seq: t._simTrip.seq, route: t.route,
        disId: disId, impact: 'short',
        scheduledStart: t._simTrip.tripStart, scheduledEnd: t._simTrip.tripEnd,
        impactTime: simTime, recovery: true
      });
    }

    t._shortWork = {
      active: true,
      isRecovery: true,
      recoveryFor: disId,
      xoLat: xo.la, xoLng: xo.lo,
      shape: subShape,
      shapeIdx: tramSubIdx,
      direction: (tramSubIdx < xoSubIdx) ? 1 : -1,
      speed: 5.5
    };
    t.blockState = 'recovery';
    if(t.mk && t.vis) t.mk.setIcon(mkIcon(t));
    return true;
  }

  // ── FIND BEST RECOVERY CROSSOVER ──
  // Returns the nearest XO on this route that is away from the disruption zone
  // and reachable in the tram's current direction of travel.
  function findRecoveryXO(tramPos, disLa, disLo, route){
    var xos = window.GIS_XO || [];
    var candidates = xos.filter(function(xo){
      return xo.rt && xo.rt.indexOf(String(route)) >= 0;
    });
    var best = null, bestDist = Infinity;
    candidates.forEach(function(xo){
      var dFromTram = geoDist(tramPos.lat, tramPos.lng, xo.la, xo.lo);
      var dFromDis  = geoDist(disLa, disLo, xo.la, xo.lo);
      // Must be close enough to reach but far enough from the disruption zone
      if(dFromTram < 80 || dFromTram > 1800) return;
      if(dFromDis < 150) return;
      if(dFromTram < bestDist){ bestDist = dFromTram; best = xo; }
    });
    return best;
  }

  // ── FIND NEAREST SHAPE POINT INDEX ──
  // shape can be [[lat,lng],...] arrays or [{la,lo},...] objects
  function nearestShapeIdx(shape, lat, lng){
    var bestD = Infinity, bestI = 0;
    for(var i = 0; i < shape.length; i++){
      var ptLat = Array.isArray(shape[i]) ? shape[i][0] : shape[i].la;
      var ptLng = Array.isArray(shape[i]) ? shape[i][1] : shape[i].lo;
      if(ptLat == null || ptLng == null) continue;
      var d = geoDist(lat, lng, ptLat, ptLng);
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
  // Returns an array of recovery actions taken (one per affected tram).
  function simClearDisruption(disId){
    var recoveryActions = [];
    var dis = (window.disruptions || []).find(function(d){ return d.id === disId; });

    simTrams.forEach(function(t){
      if(t.blockedByDis !== disId) return;

      // How long was this tram held? (seconds)
      var blockDuration = (t._trappedAtSim != null) ? Math.max(0, simTime - t._trappedAtSim) : 0;
      var pos = t._simPos || (t.path && t.path[0] ? {lat: t.path[0].la, lng: t.path[0].lo} : null);

      // Clear disruption state first
      delete t.blockedByDis;
      delete t.blockState;
      delete t._turnbackXO;
      delete t._preTrapDv;
      if(t._shortWork) t._shortWork.active = false;
      delete t._shortWork;

      var action = null;

      // Recovery needed if tram was held for more than ~3 minutes
      if(blockDuration > 180 && pos && dis){
        var xo = findRecoveryXO(pos, dis.la, dis.lo, t.route);
        if(xo){
          // Short-work to the nearest suitable crossover, then resume from there
          var started = startRecoveryShortWorking(t, xo, disId);
          if(started){
            action = {
              type: 'short',
              tramId: t.id,
              run: t._simTrip ? t._simTrip.run : '—',
              route: t.route,
              xo: xo.pole || (xo.la.toFixed(4) + ',' + xo.lo.toFixed(4)),
              blockMin: Math.round(blockDuration / 60)
            };
          }
        }
        if(!action){
          // No suitable XO — find the next appropriate trip directly
          var resumed = tryResumeTrip(t, disId);
          action = {
            type: 'trip_change',
            tramId: t.id,
            run: t._simTrip ? t._simTrip.run : '—',
            route: t.route,
            blockMin: Math.round(blockDuration / 60),
            resumed: resumed
          };
        }
      } else {
        // Short delay — just resume normally
        tryResumeTrip(t, disId);
        if(blockDuration > 0){
          action = {
            type: 'resume',
            tramId: t.id,
            run: t._simTrip ? t._simTrip.run : '—',
            route: t.route,
            blockMin: Math.round(blockDuration / 60)
          };
        }
      }

      delete t._trappedAtSim;
      if(action) recoveryActions.push(action);
      if(t.mk && t.vis) t.mk.setIcon(mkIcon(t));
    });

    _recoveryActionStore[disId] = recoveryActions;
    return recoveryActions;
  }

  // ── RESUME TRIP AFTER DISRUPTION CLEAR ──
  // Find the next trip for this run where the tram can reach a signpost
  // at the right time going the right direction
  function tryResumeTrip(t, disIdHint){
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
            disId: disIdHint !== undefined ? disIdHint : t.blockedByDis, impact: 'late',
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
      bindSimMarkerEvents(marker, tramObj);
      tramObj.mk = marker;
      simTrams.push(tramObj);
      fleetIdx++;
    });

    // In-place sync (same reasoning as rebuildSimTrams)
    trams.length = 0;
    for (var ri2 = 0; ri2 < simTrams.length; ri2++) trams.push(simTrams[ri2]);
    window.trams = trams;
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
        'title="Stop and reset simulation">&#9632;</button>';

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
      // Lazy-load timetable on first play press
      var liveEl = document.getElementById('liveStatus');
      if(liveEl){ liveEl.textContent = 'Loading timetable…'; liveEl.style.color = 'var(--yel)'; }
      loadTimetable().then(function(){
        if(!timetableData){
          if(liveEl){ liveEl.textContent = 'Timetable failed to load'; liveEl.style.color = 'var(--mag)'; }
          return;
        }
        if(liveEl){ liveEl.textContent = ''; liveEl.style.color = ''; }
        window.simTogglePlay(); // retry now that data is available
      }).catch(function(e){
        console.error('Timetable load failed:', e);
        if(liveEl){ liveEl.textContent = 'Timetable load error — check console'; liveEl.style.color = 'var(--mag)'; }
      });
      return;
    }

    if(!SIM_MODE){
      // Entering sim mode
      SIM_MODE = true;
      simPlaying = true;
      window._simRunning = true;

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

  window.openSimDetail = function(t, isClick){ openSimDetail(t, isClick); };

  window.simStop = function(){
    SIM_MODE = false;
    simPlaying = false;
    window._simRunning = false;
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

    // Clear in-place so app.js's local reference sees the empty array
    trams.length = 0;
    window.trams = trams;

    var pb3 = document.getElementById('simPlayBtn');
    var sb3 = document.getElementById('simStopBtn');
    var le3 = document.getElementById('liveStatus');
    if(pb3){ pb3.innerHTML = '&#9654;'; pb3.style.color = 'var(--grn)'; }
    if(sb3) sb3.style.display = 'none';
    if(le3) le3.textContent = '';
    restoreRealClock();
    if(window.uSt) window.uSt();
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

    // ── POST-CLEARANCE RECOVERY TRIPS ────────────────────────────────────
    // Trips shorted, cancelled, or resumed late as part of recovery after
    // the disruption clears are still attributable to the same incident.
    // tripImpacts is the source of truth — it's populated in real-time by
    // the disruption and recovery logic as the sim runs.
    var seenKeys = {};
    report.tripDetails.forEach(function(td){ seenKeys[td.run + '/' + td.seq] = true; });

    tripImpacts.forEach(function(imp){
      if(imp.disId !== dis.id) return;
      var key = imp.run + '/' + imp.seq;
      if(seenKeys[key]) return; // already captured by timetable pass
      seenKeys[key] = true;

      // Look up the trip in the timetable for direction / from / to
      var tripDir = '—', tripFrom = '—', tripTo = '—';
      if(timetableData && timetableData[imp.route] && timetableData[imp.route][imp.run]){
        var found = null;
        timetableData[imp.route][imp.run].forEach(function(tr){ if(tr.q === imp.seq) found = tr; });
        if(found && found.w && found.w.length >= 2){
          tripDir  = found.d || '—';
          tripFrom = found.w[0].c;
          tripTo   = found.w[found.w.length - 1].c;
        }
      }

      var impactLabel = imp.impact.toUpperCase();
      var statusLabel = imp.recovery
        ? 'Recovery — controller action'
        : 'Post-clearance — residual impact';

      report.tripDetails.push({
        run: imp.run,
        seq: imp.seq,
        route: imp.route,
        dir: tripDir,
        start: secsToHHMM(imp.scheduledStart),
        end: secsToHHMM(imp.scheduledEnd),
        from: tripFrom,
        to: tripTo,
        impact: impactLabel,
        missedSignposts: [],
        status: statusLabel,
        isRecovery: true
      });

      var k = imp.impact.toLowerCase();
      if(report.summary[k] !== undefined) report.summary[k]++;
      report.summary.total++;
      allAffectedRuns.add(imp.run);
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
    var nRecovery = rpt.tripDetails.filter(function(td){ return td.isRecovery; }).length;
    h += '<span class="attr-toggle">&#x25B6;</span> ';
    h += '<b>Attribution Report</b> &nbsp;';
    h += rpt.summary.runs + ' runs · ' + rpt.summary.total + ' trips · ';
    h += '<span style="color:#ff5252">' + rpt.summary.short + ' short</span>';
    if(rpt.summary.cancelled > 0) h += ' · <span style="color:#e040fb">' + rpt.summary.cancelled + ' cancelled</span>';
    h += ' · <span style="color:#f5a623">' + rpt.summary.late + ' late</span>';
    if(nRecovery > 0) h += ' · <span style="color:#ffa040">' + nRecovery + ' recovery</span>';
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

      var rowBg = td.isRecovery ? 'background:#ffa04008;' : '';
      h += '<tr id="' + rowId + '" style="cursor:pointer;' + rowBg + '" onclick="var d=document.getElementById(\'' + detailId + '\');if(d)d.classList.toggle(\'open\')">';
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
      h += '<td style="color:' + impCol + ';font-weight:700">' + td.impact + (td.isRecovery ? '<br><span style="font-size:7px;color:#ffa040;font-weight:400">RECOVERY</span>' : '') + '</td>';
      h += '<td style="font-size:8px;color:var(--tx3)">' + (td.isRecovery ? '<span style="color:#ffa040">&#x21C4; ' + td.status + '</span>' : '\u2705 Attributed') + '</td>';
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

  // ── CLEARANCE SUMMARY MODAL ──────────────────────────────────────────────
  function renderClearanceModal(dis, recoveryActions, report, durationMin, disStartSim, disEndSim){
    // Remove any existing modal
    var existing = document.getElementById('clearanceModal');
    if(existing) existing.parentNode.removeChild(existing);
    var existingOv = document.getElementById('clearanceOverlay');
    if(existingOv) existingOv.parentNode.removeChild(existingOv);

    var overlay = document.createElement('div');
    overlay.id = 'clearanceOverlay';
    overlay.onclick = function(){ closeClearanceModal(); };
    document.body.appendChild(overlay);

    var modal = document.createElement('div');
    modal.id = 'clearanceModal';

    var rcol = (window.R && window.R[dis.route]) ? window.R[dis.route].c : '#888';
    var affRoutes = dis.routes || [dis.route];
    var routeLabels = affRoutes.map(function(r){
      var c = window.R && window.R[r] ? window.R[r].c : '#888';
      return '<span style="color:'+c+'">Rt '+r+'</span>';
    }).join(' / ');

    var h = '';
    h += '<div class="clr-hdr">';
    h += '<span class="clr-check">&#10003;</span>';
    h += '<div class="clr-hdr-text"><div class="clr-title">Disruption Cleared</div>';
    h += '<div class="clr-sub">'+routeLabels+' &bull; '+dis.type+'</div></div>';
    h += '<button class="clr-close" onclick="closeClearanceModal()">&#x2715;</button>';
    h += '</div>';

    // Duration + clock times + location
    h += '<div class="clr-meta">';
    h += '<div class="clr-meta-item"><span class="clr-meta-lbl">Duration</span><span class="clr-meta-val">'+durationMin+' min</span></div>';
    if(disStartSim != null && disEndSim != null){
      h += '<div class="clr-meta-item"><span class="clr-meta-lbl">Sim Time</span><span class="clr-meta-val">'+secsToHHMM(disStartSim)+'&thinsp;&rarr;&thinsp;'+secsToHHMM(disEndSim)+'</span></div>';
    }
    if(dis.southXO || dis.northXO){
      var loc = dis.southXO && dis.northXO
        ? dis.southXO.pole+' &#x2194; '+dis.northXO.pole
        : (dis.southXO||dis.northXO).pole;
      h += '<div class="clr-meta-item"><span class="clr-meta-lbl">Zone</span><span class="clr-meta-val">'+loc+'</span></div>';
    }
    h += '</div>';

    // Attribution KPIs
    if(report && report.summary.total > 0){
      var s = report.summary;
      h += '<div class="clr-section-title">Attribution</div>';
      h += '<div class="clr-kpis">';
      h += '<div class="clr-kpi"><span class="clr-kpi-val" style="color:#ff5252">'+s.short+'</span><span class="clr-kpi-lbl">Short</span></div>';
      if(s.cancelled > 0) h += '<div class="clr-kpi"><span class="clr-kpi-val" style="color:#e040fb">'+s.cancelled+'</span><span class="clr-kpi-lbl">Cancelled</span></div>';
      h += '<div class="clr-kpi"><span class="clr-kpi-val" style="color:#f5a623">'+s.late+'</span><span class="clr-kpi-lbl">Late</span></div>';
      h += '<div class="clr-kpi"><span class="clr-kpi-val" style="color:var(--txt)">'+s.runs+'</span><span class="clr-kpi-lbl">Runs</span></div>';
      h += '</div>';
    } else if(report){
      h += '<div class="clr-zero">No trips attributed &mdash; disruption cleared before scheduled service.</div>';
    }

    // Recovery actions
    if(recoveryActions && recoveryActions.length > 0){
      h += '<div class="clr-section-title">Recovery Actions</div>';
      h += '<div class="clr-recovery-list">';
      var actionsToShow = recoveryActions.length > 5 ? recoveryActions.slice(0, 4) : recoveryActions;
      actionsToShow.forEach(function(a){
        var rc = window.R && window.R[a.route] ? window.R[a.route].c : '#888';
        var icon = a.type === 'short' ? '&#x21C4;' : a.type === 'trip_change' ? '&#x21BB;' : '&#x25B6;';
        var label = a.type === 'short'
          ? 'Short-worked to '+a.xo
          : a.type === 'trip_change'
          ? 'Assigned next trip'
          : 'Resumed service';
        h += '<div class="clr-recovery-item">';
        h += '<span class="clr-rec-icon">'+icon+'</span>';
        h += '<span class="clr-rec-run" style="color:'+rc+'">Rt '+a.route+'</span>';
        h += '<span class="clr-rec-run-id">'+a.run+'</span>';
        h += '<span class="clr-rec-label">'+label+'</span>';
        if(a.blockMin > 0) h += '<span class="clr-rec-delay">+'+a.blockMin+'m</span>';
        h += '</div>';
      });
      if(recoveryActions.length > 5){
        h += '<div class="clr-recovery-more">+' + (recoveryActions.length - 4) + ' more trams recovered</div>';
      }
      h += '</div>';
    }

    // Actions
    h += '<div class="clr-actions">';
    if(report && report.summary.total > 0){
      h += '<button class="clr-btn-primary" onclick="closeClearanceModal();openAttrPanel('+dis.id+')">&#x26A1; View Attribution</button>';
    }
    h += '<button class="clr-btn-secondary" onclick="closeClearanceModal()">Close</button>';
    h += '</div>';

    modal.innerHTML = h;
    document.body.appendChild(modal);

    // Animate in
    requestAnimationFrame(function(){
      overlay.classList.add('open');
      modal.classList.add('open');
    });
  }

  window.closeClearanceModal = function(){
    var modal = document.getElementById('clearanceModal');
    var overlay = document.getElementById('clearanceOverlay');
    if(modal){ modal.classList.remove('open'); setTimeout(function(){ if(modal.parentNode) modal.parentNode.removeChild(modal); }, 200); }
    if(overlay){ overlay.classList.remove('open'); setTimeout(function(){ if(overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200); }
  };

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

    // Call original removeDis — this internally calls clearDisruptionFromTrams
    // which calls simClearDisruption and stores recovery actions in _recoveryActionStore
    if(_origRemoveDis) _origRemoveDis(id);

    if(SIM_MODE && dis){
      // Collect recovery actions stored by simClearDisruption during the above call
      var recoveryActions = _recoveryActionStore[id] || [];
      delete _recoveryActionStore[id];

      var report = null;
      if(disStartSim != null){
        report = buildAttributionReport(dis, disStartSim, simTime);
        if(report && logEntry) logEntry._attribution = report;
      }

      var durationMin = (disStartSim != null) ? Math.max(0, Math.round((simTime - disStartSim) / 60)) : 0;
      renderClearanceModal(dis, recoveryActions, report, durationMin, disStartSim, simTime);
      setTimeout(renderDisLogWithAttribution, 100);
    }
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
  // Signposts are small (~200KB) so load eagerly for crossover display.
  // Timetable is 5.5MB — load lazily on first play press to avoid
  // blocking page load for users who never use the simulator.
  loadSignposts().then(function(){
    try {
      buildSimUI();
      simInitialised = true;
      console.log('Simulator UI ready — timetable will load on first play');
    } catch(e) {
      console.error('Simulator UI init failed:', e);
    }
  }).catch(function(e){
    console.error('Simulator signpost load failed:', e);
  });
}

// Boot
if(window._opsviewReady) init();
else document.addEventListener('opsview-ready', init);

})();
