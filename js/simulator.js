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
        d.forEach(function(s){ signpostLookup[s.code] = {lat: s.lat, lng: s.lng, name: s.name}; });
      })
      .catch(function(e){ console.warn('Simulator: signposts.json not found', e); });
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

        if(trip.isSynthetic){
          // Synthetic: use GTFS shape from app.js
          var shape = R[trip.route] ? R[trip.route].fwd : null;
          if(!shape) return null;
          var totalPts = shape.length;
          var ptsPerSeg = totalPts / (wps.length - 1);
          var startIdx = Math.floor(i * ptsPerSeg);
          var endIdx = Math.min(Math.floor((i+1) * ptsPerSeg), totalPts - 1);

          // Sub-interpolate within this shape segment
          var subFrac = frac;
          var si = startIdx + Math.floor(subFrac * (endIdx - startIdx));
          si = Math.min(si, totalPts - 2);
          var subFrac2 = (subFrac * (endIdx - startIdx)) - Math.floor(subFrac * (endIdx - startIdx));

          // For Up direction, reverse the shape traversal
          var isUp = (trip.dir === 'Up');
          var ai, bi;
          if(isUp){
            ai = totalPts - 1 - si;
            bi = totalPts - 2 - si;
            if(bi < 0) bi = 0;
          } else {
            ai = si;
            bi = si + 1;
            if(bi >= totalPts) bi = totalPts - 1;
          }

          var ptA = shape[ai];
          var ptB = shape[bi];
          return {
            lat: ptA[0] + (ptB[0] - ptA[0]) * subFrac2,
            lng: ptA[1] + (ptB[1] - ptA[1]) * subFrac2,
            nearStop: R[trip.route].fwd[si] ? R[trip.route].fwd[si].n : 'En route',
            nextStop: R[trip.route].fwd[Math.min(si+2, totalPts-1)] ? R[trip.route].fwd[Math.min(si+2, totalPts-1)].n : 'Terminus',
            wpIdx: i
          };
        }

        // Real trip: interpolate between signpost coordinates
        var sp1 = signpostLookup ? signpostLookup[wps[i].c] : null;
        var sp2 = signpostLookup ? signpostLookup[wps[i+1].c] : null;
        // Fallback to waypoint embedded coords
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

    // Past last waypoint or before first — use last known
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

    // Format deviation
    var devStr = window.devTxt(t.dv);
    var devCol = window.scHex(sc(t.dv));
    var arr = t.updn === 'Down' ? '\u25BC' : '\u25B2';

    did.innerHTML = '<span style="color:' + (R[t.route]?R[t.route].c:'#888') + '">' + t.id + '</span>';

    dbd.innerHTML =
      '<div class="dr"><span class="dl">Route</span><span class="dv" style="color:' + (R[t.route]?R[t.route].c:'#888') + '">' + t.route + ' ' + arr + ' ' + t.updn + '</span></div>' +
      '<div class="dr"><span class="dl">Run</span><span class="dv">' + t.run + '</span></div>' +
      '<div class="dr"><span class="dl">Destination</span><span class="dv">' + t.updnDest + '</span></div>' +
      '<div class="dr"><span class="dl">Current Stop</span><span class="dv">' + (t._nearStop || '—') + '</span></div>' +
      '<div class="dr"><span class="dl">Next Stop</span><span class="dv">' + (t._nextStop || '—') + '</span></div>' +
      '<div class="dr"><span class="dl">Direction</span><span class="dv">' + t.dir + ' (' + t.updn + ')</span></div>' +
      '<div class="dr"><span class="dl">Deviation</span><span class="dv" style="color:' + devCol + '">' + devStr + '</span></div>' +
      '<div class="dr"><span class="dl">Source</span><span class="dv" style="color:var(--tx3);font-size:9px">' +
        (t._simTrip && t._simTrip.isSynthetic ? 'Synthetic timetable' : 'HASTUS schedule') + '</span></div>' +
      '<div class="dr"><span class="dl">Driver</span><span class="dv" style="color:var(--tx3)">Pending feed integration</span></div>';

    dp.classList.add('open');
    window._simSelectedTram = t;
  }

  // ── ANIMATION LOOP ──
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
    simTime += (realDeltaMs / 1000) * scale;
    simTime = simTime % 86400;

    // Update clock display
    updateSimClock();

    // Every 2 real seconds, rescan for new/ended trips
    if(!simAnim._lastRescan) simAnim._lastRescan = now;
    if(now - simAnim._lastRescan > 2000){
      simAnim._lastRescan = now;
      rescanTrips();
    }

    // Update positions of existing trams
    simTrams.forEach(function(t){
      if(!t._simTrip) return;
      var pos = interpolatePosition(t._simTrip, simTime);
      if(!pos) return;

      t._simPos = pos;
      t._nearStop = pos.nearStop;
      t._nextStop = pos.nextStop;
      t.dv = calcDeviation(t._simTrip, simTime);

      // Update path for tPos compatibility
      t.path = [{la: pos.lat, lo: pos.lng, n: pos.nearStop}];

      if(t.mk && t.vis && !t.searchHide){
        t.mk.setLatLng([pos.lat, pos.lng]);
        t.mk.setIcon(mkIcon(t));
      }
    });

    uSt();

    // Update selected tram detail
    if(window._simSelectedTram){
      var sel = window._simSelectedTram;
      if(sel._simTrip) openSimDetail(sel);
    }

    simAnimFrame = requestAnimationFrame(simAnim);
  }

  // ── RESCAN: add new trips, remove ended ones ──
  function rescanTrips(){
    var active = getActiveTrips(simTime);
    var activeKeys = {};
    active.forEach(function(trip){
      activeKeys[trip.run + '/' + trip.seq] = trip;
    });

    // Remove ended trips
    for(var i = simTrams.length - 1; i >= 0; i--){
      var t = simTrams[i];
      var key = t._simTrip ? (t._simTrip.run + '/' + t._simTrip.seq) : '';
      if(!activeKeys[key]){
        if(t.mk) map.removeLayer(t.mk);
        simTrams.splice(i, 1);
      }
    }

    // Add new trips
    var existingKeys = {};
    simTrams.forEach(function(t){
      if(t._simTrip) existingKeys[t._simTrip.run + '/' + t._simTrip.seq] = true;
    });

    active.forEach(function(trip){
      var key = trip.run + '/' + trip.seq;
      if(existingKeys[key]) return; // already tracked

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
    document.getElementById('simTimeInput').addEventListener('change', function(){
      if(SIM_MODE){
        simTime = hhmmToSecs(this.value);
        rebuildSimTrams();
        updateSimClock();
      }
    });
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

      // Cancel original animation
      // (the original anim() is a requestAnimationFrame loop, it will keep
      //  running but we've swapped window.trams so it becomes a no-op on
      //  markers that have been removed)

      rebuildSimTrams();

      document.getElementById('simPlayBtn').innerHTML = '&#10074;&#10074;'; // pause
      document.getElementById('simPlayBtn').style.color = 'var(--yel)';
      document.getElementById('simStopBtn').style.display = '';
      document.getElementById('liveStatus').textContent = 'TIMETABLE SIM';
      document.getElementById('liveStatus').style.color = '#f5a623';

      simAnimFrame = requestAnimationFrame(simAnim);
    } else if(simPlaying){
      // Pause
      simPlaying = false;
      document.getElementById('simPlayBtn').innerHTML = '&#9654;';
      document.getElementById('simPlayBtn').style.color = 'var(--grn)';
    } else {
      // Resume
      simPlaying = true;
      simLastRealMs = Date.now();
      document.getElementById('simPlayBtn').innerHTML = '&#10074;&#10074;';
      document.getElementById('simPlayBtn').style.color = 'var(--yel)';
      simAnimFrame = requestAnimationFrame(simAnim);
    }
  };

  window.simStop = function(){
    // Exit sim mode, restore original mock trams
    SIM_MODE = false;
    simPlaying = false;
    if(simAnimFrame) cancelAnimationFrame(simAnimFrame);
    simAnimFrame = null;

    // Remove sim markers
    simTrams.forEach(function(t){
      if(t.mk) map.removeLayer(t.mk);
    });
    simTrams = [];

    // Restore original trams (they were removed from map but still in memory)
    // Actually, we need to recreate them since we replaced window.trams
    // Force page reload is cleanest — but let's try restoring
    document.getElementById('simPlayBtn').innerHTML = '&#9654;';
    document.getElementById('simPlayBtn').style.color = 'var(--grn)';
    document.getElementById('simStopBtn').style.display = 'none';
    document.getElementById('liveStatus').textContent = '';
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
  window.SIM_MODE = function(){ return SIM_MODE; };

  // ── INITIALISE ──
  Promise.all([loadTimetable(), loadSignposts()]).then(function(){
    buildSimUI();
    simInitialised = true;
    console.log('Simulator ready — ' +
      Object.keys(timetableData).length + ' routes, ' +
      'click play to start');
  });
}

// Boot
if(window._opsviewReady) init();
else document.addEventListener('opsview-ready', init);

})();
