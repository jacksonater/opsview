// attribution.js — Attribution Engine (Rules A/B/C/1/2 + confidence scoring)
// Deferred: waits for app.js to be ready

(function(){
function _initAttribution(){
var R=window.R,rks=window.rks,map=window.map,trams=window.trams;
var disruptions=window.disruptions,disruptionLog=window.disruptionLog;
var geoDist=window.geoDist,routeParam=window.routeParam;
var buildDisPopup=window.buildDisPopup,addToDisLog=window.addToDisLog;
var renderDisLog=window.renderDisLog;

// ATTRIBUTION ENGINE — deterministic trip attribution
// ══════════════════════════════════════════════════

// Read tunables from central config; fall back to hard-coded defaults so the
// engine still works if config.js hasn't loaded yet (e.g. during unit tests).
var _cfg = (window.OpsViewConfig && window.OpsViewConfig.attribution) || {};
var ATTR_TUNABLES = {
  theta_jump:   _cfg.theta_jump   !== undefined ? _cfg.theta_jump   : 2.0,
  theta_accept: _cfg.theta_accept !== undefined ? _cfg.theta_accept : 0.80,
  theta_review: _cfg.theta_review !== undefined ? _cfg.theta_review : 0.55,
  epsilon:      _cfg.epsilon      !== undefined ? _cfg.epsilon      : 0.05,
  T_max:        _cfg.T_max        !== undefined ? _cfg.T_max        : 120,
  D_max:        _cfg.D_max        !== undefined ? _cfg.D_max        : 30,
  w_spatial:    _cfg.w_spatial    !== undefined ? _cfg.w_spatial    : 0.25,
  w_temporal:   _cfg.w_temporal   !== undefined ? _cfg.w_temporal   : 0.20,
  w_deviation:  _cfg.w_deviation  !== undefined ? _cfg.w_deviation  : 0.20,
  w_nojump:     _cfg.w_nojump     !== undefined ? _cfg.w_nojump     : 0.15,
  w_continuity: _cfg.w_continuity !== undefined ? _cfg.w_continuity : 0.10,
  w_unique:     _cfg.w_unique     !== undefined ? _cfg.w_unique     : 0.10
};

var attrResults = {};
// Human overrides: { disId: { removed: Set<tripId>, added: [{trip_id, reason}] } }
var attrOverrides = {};
// Expose results globally for Maximo panel to read
window._attrResults = attrResults;

function generateSyntheticTrips(dis) {
  var affectedRoutes = dis.routes || [dis.route];
  var allTrips = [];
  var runCounter = 0;
  // Use dis.id as seed for reproducible results per disruption
  var seed = dis.id * 137 + 42;
  function pseudoRand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 10000) / 10000; }

  affectedRoutes.forEach(function(rk) {
    var route = R[rk];
    if (!route) return;
    var stops = route.stops;
    if (!stops || stops.length < 3) return;
    var nRuns = 3 + Math.floor(pseudoRand() * 2);
    for (var ri = 0; ri < nRuns; ri++) {
      runCounter++;
      var runId = rk + '-' + String(runCounter).padStart(2, '0');
      var nTrips = 3 + Math.floor(pseudoRand() * 3);
      var baseTime = 8 * 60 + ri * 25;
      for (var ti = 0; ti < nTrips; ti++) {
        var tripId = runId + '-T' + (ti + 1);
        var tripStart = baseTime + ti * (route.m + 5);
        var direction = ti % 2 === 0 ? 'Down' : 'Up';
        var tripStops = direction === 'Down' ? stops.slice() : stops.slice().reverse();
        var disStopIdx = -1, minStopDist = Infinity;
        tripStops.forEach(function(s, idx) {
          var d = geoDist(s.la, s.lo, dis.la, dis.lo);
          if (d < minStopDist) { minStopDist = d; disStopIdx = idx; }
        });
        var signposts = [];
        var prevDelay = 0;
        var hitDisruption = false;
        var isCancelled = false;
        var isShort = false;
        var segMinutes = route.m / Math.max(1, tripStops.length - 1);
        for (var si = 0; si < tripStops.length; si++) {
          var schedTime = tripStart + si * segMinutes;
          var delta = prevDelay;
          var distToDis = Math.abs(si - disStopIdx);
          if (distToDis <= 1 && !hitDisruption) {
            hitDisruption = true;
            var tripProximity = Math.abs(tripStart + disStopIdx * segMinutes - (8 * 60 + 30));
            if (tripProximity < 60) delta += 5 + Math.floor(pseudoRand() * 12);
            else if (tripProximity < 120) delta += 2 + Math.floor(pseudoRand() * 6);
            else delta += Math.floor(pseudoRand() * 3);
          } else if (hitDisruption) {
            delta = Math.max(0, prevDelay - pseudoRand() * 1.5);
          } else {
            delta += (pseudoRand() - 0.4) * 0.8;
          }
          var missed = false;
          if (distToDis <= 1 && pseudoRand() < 0.12) missed = true;
          else if (pseudoRand() < 0.02) missed = true;
          if (si > disStopIdx + 1 && distToDis <= 2 && !isShort && pseudoRand() < 0.08) { isShort = true; break; }
          if (ti === 0 && si === 0 && pseudoRand() < 0.04) { isCancelled = true; break; }
          delta = Math.max(-2, delta);
          signposts.push({ code: tripStops[si].n, la: tripStops[si].la, lo: tripStops[si].lo, scheduled: schedTime, actual: missed ? null : schedTime + delta, delta: missed ? null : delta, missed: missed, stopIdx: si });
          prevDelay = delta;
        }
        allTrips.push({ trip_id: tripId, route_id: rk, run_id: runId, sequence: ti + 1, direction: direction, scheduled_start: tripStart, scheduled_end: tripStart + route.m, signposts: signposts, dis_stop_idx: disStopIdx, is_cancelled: isCancelled, is_short: isShort, short_at: isShort ? signposts.length - 1 : null, attribution: null, confidence: null });
      }
    }
  });
  return allTrips;
}

function getDeviation(trip, stopIdx) {
  if (stopIdx < 0 || stopIdx >= trip.signposts.length) return null;
  var sp = trip.signposts[stopIdx]; return sp.missed ? null : sp.delta;
}
function getDeltaW(trip, dsi) {
  var mx = 0;
  for (var i = Math.max(0, dsi - 1); i <= Math.min(trip.signposts.length - 1, dsi + 1); i++) { var d = getDeviation(trip, i); if (d !== null) mx = Math.max(mx, Math.abs(d)); }
  return mx;
}
function hasJump(trip, dsi, tj) {
  var dw = getDeltaW(trip, dsi); if (dw === 0) return false;
  for (var i = dsi + 2; i < trip.signposts.length; i++) { var d = getDeviation(trip, i); if (d !== null && Math.abs(d) >= tj * dw) return true; }
  return false;
}
function endLate(trip) { if (!trip.signposts.length) return false; var l = trip.signposts[trip.signposts.length - 1]; return l.delta !== null && l.delta > 0; }
function startLate(trip) { if (!trip.signposts.length) return false; var f = trip.signposts[0]; return f.delta !== null && f.delta > 0; }
function missedSP(trip, si) { return si >= 0 && si < trip.signposts.length && trip.signposts[si].missed; }

function disIncTimeMins(dis) {
  // Convert disruption wall-clock start to minutes-since-midnight for trip matching.
  // In sim mode the simulator runs at arbitrary times; fall back to current wall clock.
  var d = new Date(dis.start);
  return d.getHours() * 60 + d.getMinutes();
}

function ruleA(dis, trips) {
  var incTime = disIncTimeMins(dis);
  var cands = trips.filter(function(t) { return t.scheduled_start >= incTime; }).sort(function(a, b) { return a.scheduled_start - b.scheduled_start; });
  for (var i = 0; i < cands.length; i++) {
    var t = cands[i], dsi = t.dis_stop_idx;
    if (dsi < 0 || dsi >= t.signposts.length) continue;
    var dev = getDeviation(t, dsi);
    if ((dev !== null && dev > 0) || missedSP(t, dsi) || t.is_short || t.is_cancelled) return t;
  }
  return null;
}

function ruleB(dis, firstTrip, allTrips, attributed) {
  var result = [];
  var runTrips = allTrips.filter(function(t) { return t.run_id === firstTrip.run_id && t.sequence > firstTrip.sequence; }).sort(function(a, b) { return a.sequence - b.sequence; });
  var prev = firstTrip;
  for (var i = 0; i < runTrips.length; i++) {
    var next = runTrips[i];
    if (!endLate(prev) || !startLate(next)) break;
    if (hasJump(next, next.dis_stop_idx, ATTR_TUNABLES.theta_jump)) break;
    if (attributed[next.trip_id]) break;
    result.push(next); prev = next;
  }
  return result;
}

function ruleC(dis, allTrips, primaryRunId, attributed) {
  var result = [];
  var otherRuns = {};
  allTrips.forEach(function(t) { if (t.run_id !== primaryRunId) { if (!otherRuns[t.run_id]) otherRuns[t.run_id] = []; otherRuns[t.run_id].push(t); } });
  Object.keys(otherRuns).forEach(function(runId) {
    var rTrips = otherRuns[runId].sort(function(a, b) { return a.scheduled_start - b.scheduled_start; });
    var ft = null;
    var incTimeMins = disIncTimeMins(dis);
    for (var i = 0; i < rTrips.length; i++) { if (rTrips[i].scheduled_start >= incTimeMins) { ft = rTrips[i]; break; } }
    if (!ft) return;
    var dsi = ft.dis_stop_idx, dev = getDeviation(ft, dsi), dw = getDeltaW(ft, dsi);
    var impacted = (dev !== null && dw > 0 && Math.abs(dev) >= ATTR_TUNABLES.theta_jump * Math.max(dw, 0.5)) || missedSP(ft, dsi) || ft.is_short;
    if (!impacted) return;
    if (!attributed[ft.trip_id]) {
      result.push({ trip: ft, rule: 'C' }); attributed[ft.trip_id] = { incident_id: dis.id, rule: 'C' };
      var bChain = ruleB(dis, ft, allTrips, attributed);
      bChain.forEach(function(t) { result.push({ trip: t, rule: 'B' }); attributed[t.trip_id] = { incident_id: dis.id, rule: 'B' }; });
    }
  });
  return result;
}

function rules12(dis, allTrips, attributed) {
  var result = [];
  allTrips.forEach(function(t) {
    if (attributed[t.trip_id]) return;
    if (!t.is_cancelled && !t.is_short) return;
    var sameRun = allTrips.filter(function(x) { return x.run_id === t.run_id; });
    var adj = sameRun.some(function(x) { return attributed[x.trip_id] && Math.abs(x.sequence - t.sequence) <= 1; });
    if (adj) { var r = t.is_cancelled ? '2' : '1'; result.push({ trip: t, rule: r }); attributed[t.trip_id] = { incident_id: dis.id, rule: r }; }
  });
  return result;
}

function computeConf(trip, dis, allTrips, attributed) {
  var T = ATTR_TUNABLES, dsi = trip.dis_stop_idx, dev = getDeviation(trip, dsi);
  var spatial = 0;
  if (dev !== null && dev > 0) spatial = 1.0;
  else if (missedSP(trip, dsi)) spatial = 0.7;
  else if (trip.is_short) spatial = 0.5;
  var segMin = trip.signposts.length > 1 ? (trip.scheduled_end - trip.scheduled_start) / (trip.signposts.length - 1) : 0;
  var schedAtDis = trip.scheduled_start + (dsi >= 0 ? dsi * segMin : 0);
  var incTime = disIncTimeMins(dis);
  var temporal = 1 - Math.min(Math.abs(schedAtDis - incTime) / T.T_max, 1);
  var deviation = dev !== null ? Math.min(Math.abs(dev) / T.D_max, 1) : 0.3;
  var noJump = hasJump(trip, dsi, T.theta_jump) ? 0 : 1;
  var continuity = 0;
  var prevTrip = allTrips.find(function(x) { return x.run_id === trip.run_id && x.sequence === trip.sequence - 1; });
  if (prevTrip && attributed[prevTrip.trip_id]) continuity = 1;
  var uniqueness = 1.0;
  var score = T.w_spatial * spatial + T.w_temporal * temporal + T.w_deviation * deviation + T.w_nojump * noJump + T.w_continuity * continuity + T.w_unique * uniqueness;
  return { spatial: spatial, temporal: Math.round(temporal * 100) / 100, deviation: Math.round(deviation * 100) / 100, noJump: noJump, continuity: continuity, uniqueness: uniqueness, score: Math.round(score * 100) / 100 };
}

function runAttribution(dis) {
  var trips = generateSyntheticTrips(dis);
  var attributed = {};
  var ov = attrOverrides[dis.id] || { removed: {}, added: [] };
  var results = { dis_id: dis.id, trips: trips, decisions: [], chain_confidence: 0 };

  var firstTrip = ruleA(dis, trips);
  if (!firstTrip) {
    // Zero-trip result is valid — log gracefully, still apply any manual adds
    results.zeroTrips = true;
  } else {
    attributed[firstTrip.trip_id] = { incident_id: dis.id, rule: 'A' };
    results.decisions.push({ trip: firstTrip, rule: 'A', confidence: computeConf(firstTrip, dis, trips, attributed) });
    var bChain = ruleB(dis, firstTrip, trips, attributed);
    bChain.forEach(function(t) { attributed[t.trip_id] = { incident_id: dis.id, rule: 'B' }; results.decisions.push({ trip: t, rule: 'B', confidence: computeConf(t, dis, trips, attributed) }); });
    rules12(dis, trips, attributed).forEach(function(e) { results.decisions.push({ trip: e.trip, rule: e.rule, confidence: computeConf(e.trip, dis, trips, attributed) }); });
    ruleC(dis, trips, firstTrip.run_id, attributed).forEach(function(e) { results.decisions.push({ trip: e.trip, rule: e.rule, confidence: computeConf(e.trip, dis, trips, attributed) }); });
    rules12(dis, trips, attributed).forEach(function(e) { results.decisions.push({ trip: e.trip, rule: e.rule, confidence: computeConf(e.trip, dis, trips, attributed) }); });
  }

  // Apply overrides: remove engine decisions flagged for removal
  results.decisions = results.decisions.filter(function(d) {
    if (ov.removed[d.trip.trip_id]) { d._overrideRemoved = true; return false; }
    return true;
  });

  // Apply overrides: add manually added trips
  ov.added.forEach(function(addedTrip) {
    if (!attributed[addedTrip.trip_id]) {
      results.decisions.push({ trip: addedTrip, rule: 'M', confidence: { score: 1.0, spatial:1,temporal:1,deviation:1,noJump:1,continuity:1,uniqueness:1 }, _overrideAdded: true, state: 'PRE_ACCEPTED' });
    }
  });

  results.decisions.forEach(function(d) {
    if (d._overrideAdded) { d.state = 'PRE_ACCEPTED'; return; }
    if (d.confidence.score >= ATTR_TUNABLES.theta_accept) d.state = 'PRE_ACCEPTED';
    else if (d.confidence.score >= ATTR_TUNABLES.theta_review) d.state = 'REVIEW';
    else d.state = 'LOW_CONFIDENCE';
  });
  if (results.decisions.length > 0) {
    results.chain_confidence = Math.min.apply(null, results.decisions.map(function(d) { return d.confidence.score; }));
  }
  attrResults[dis.id] = results;
  return results;
}

function renderAttrPanel(disId) {
  var results = attrResults[disId]; if (!results) return;
  var dis = disruptions.find(function(d) { return d.id === disId; }); if (!dis) return;
  var affRoutes = dis.routes || [dis.route];
  var routeLabels = affRoutes.map(function(r) { var c = R[r] ? R[r].c : '#888'; return '<span style="color:' + c + '">Rt ' + r + '</span>'; }).join(' / ');
  // Maximo reference (if synced)
  var mxInc = window.SimMaximo ? window.SimMaximo.getIncident(dis.id) : null;
  var mxRefStr = mxInc ? ' &nbsp;<span style="color:#4299e1;font-family:\'JetBrains Mono\',monospace;font-size:9px">' + mxInc.mxRef + '</span>' : '';
  document.getElementById('attrCtx').innerHTML = '<b>Disruption #' + dis.id + '</b>' + mxRefStr + ' &nbsp;' + routeLabels + ' &nbsp;&bull;&nbsp; ' + dis.type + '<br><span style="color:var(--tx3)">' + results.decisions.length + ' trip' + (results.decisions.length !== 1 ? 's' : '') + ' attributed &nbsp;|&nbsp; ' + results.trips.length + ' trips evaluated</span>';
  var h = '';
  if (results.zeroTrips) {
    h += '<div class="attr-zero-trips"><div class="attr-zero-icon">&#10003;</div><div class="attr-zero-msg">No trips attributed &mdash; incident logged for record.<br><span>This is valid: the disruption may have cleared before any scheduled service passed through, or no trams showed measurable degradation at this location.</span></div></div>';
    h += '<div style="margin-top:12px"><button class="attr-add-manual-btn" onclick="attrAddManual('+disId+')">+ Manually Add Trip</button></div>';
    document.getElementById('attrBody').innerHTML = h;
    return;
  }
  var nA = results.decisions.filter(function(d) { return d.state === 'PRE_ACCEPTED'; }).length;
  var nR = results.decisions.filter(function(d) { return d.state === 'REVIEW'; }).length;
  var nL = results.decisions.filter(function(d) { return d.state === 'LOW_CONFIDENCE'; }).length;
  h += '<div class="attr-summary"><div class="attr-kpi"><div class="attr-kpi-val" style="color:#00e5a0">' + nA + '</div><div class="attr-kpi-lbl">Pre-Accepted</div></div>';
  h += '<div class="attr-kpi"><div class="attr-kpi-val" style="color:#f59623">' + nR + '</div><div class="attr-kpi-lbl">Review</div></div>';
  h += '<div class="attr-kpi"><div class="attr-kpi-val" style="color:#e53e3e">' + nL + '</div><div class="attr-kpi-lbl">Low Conf</div></div></div>';
  var cc = Math.round(results.chain_confidence * 100), ccCol = cc >= 80 ? '#00e5a0' : cc >= 55 ? '#f59623' : '#e53e3e';
  h += '<div style="margin-bottom:12px"><div style="font-size:9px;color:var(--tx3);margin-bottom:3px">Chain Confidence (weakest link)</div>';
  h += '<div class="attr-conf-bar"><div class="attr-conf-track"><div class="attr-conf-fill" style="width:' + cc + '%;background:' + ccCol + '"></div></div>';
  h += '<div class="attr-conf-pct" style="color:' + ccCol + '">' + cc + '%</div></div></div>';
  var groups = { 'A': [], 'B': [], 'C': [], '1': [], '2': [] };
  results.decisions.forEach(function(d) { if (groups[d.rule]) groups[d.rule].push(d); });
  var ruleLabels = { 'A': { name: 'First Affected Trip', cls: 'attr-rule-a' }, 'B': { name: 'Same-Run Propagation', cls: 'attr-rule-b' }, 'C': { name: 'Cross-Run Propagation', cls: 'attr-rule-c' }, '1': { name: 'Linked Shorts/Cancels', cls: 'attr-rule-12' }, '2': { name: 'Missed Cancellations', cls: 'attr-rule-12' } };
  ['A', 'B', 'C', '1', '2'].forEach(function(rule) {
    if (groups[rule].length === 0) return;
    var rl = ruleLabels[rule];
    h += '<div class="attr-chain"><div class="attr-chain-hdr"><span class="attr-rule ' + rl.cls + '">RULE ' + rule + '</span> ' + rl.name + ' (' + groups[rule].length + ')</div>';
    groups[rule].forEach(function(d) {
      var t = d.trip, c = d.confidence, sc = Math.round(c.score * 100);
      var scCol = sc >= 80 ? '#00e5a0' : sc >= 55 ? '#f59623' : '#e53e3e';
      var stCls = d.state === 'PRE_ACCEPTED' ? 'attr-st-accept' : d.state === 'REVIEW' ? 'attr-st-review' : 'attr-st-low';
      var stLbl = d.state === 'PRE_ACCEPTED' ? '✓ ACCEPT' : d.state === 'REVIEW' ? '⚠ REVIEW' : '✗ LOW';
      var peakDev = 0; t.signposts.forEach(function(sp) { if (sp.delta !== null && Math.abs(sp.delta) > Math.abs(peakDev)) peakDev = sp.delta; });
      var devCol = peakDev <= 1 ? '#00e5a0' : peakDev <= 5 ? '#f5d623' : peakDev <= 10 ? '#f59623' : '#e040fb';
      var rtCol = R[t.route_id] ? R[t.route_id].c : '#888';
      var isOverrideAdded = d._overrideAdded ? true : false;
      var overrideBadge = isOverrideAdded ? '<span class="attr-override-badge">MANUAL</span>' : '';
      h += '<div class="attr-trip" onclick="toggleAttrDetail(\'' + t.trip_id + '\')">';
      h += '<span class="attr-trip-rule ' + rl.cls + '">' + rule + '</span>';
      h += '<span class="attr-trip-id">' + t.trip_id + '</span>';
      h += '<span class="attr-trip-run" style="color:' + rtCol + '">Rt ' + t.route_id + '</span>';
      h += '<span class="attr-trip-dev" style="color:' + devCol + '">' + (t.is_cancelled ? 'CANCEL' : t.is_short ? 'SHORT' : (peakDev > 0 ? '+' : '') + peakDev.toFixed(1) + 'm') + '</span>';
      h += '<span class="attr-trip-conf" style="color:' + scCol + '">' + sc + '%</span>';
      h += '<span class="attr-trip-state ' + stCls + '">' + stLbl + '</span>';
      h += overrideBadge;
      h += '<button class="attr-override-remove" title="Remove from attribution" onclick="event.stopPropagation();attrRemoveTrip(' + disId + ',\'' + t.trip_id + '\')">&#x2715;</button>';
      h += '</div>';
      // Expandable detail
      h += '<div class="attr-detail" id="attrDet_' + t.trip_id.replace(/[^a-zA-Z0-9]/g, '_') + '" style="display:none">';
      h += '<div class="attr-detail-title">Confidence Breakdown</div>';
      [{ n: 'Spatial Match', v: c.spatial, w: ATTR_TUNABLES.w_spatial }, { n: 'Temporal Proximity', v: c.temporal, w: ATTR_TUNABLES.w_temporal }, { n: 'Deviation Magnitude', v: c.deviation, w: ATTR_TUNABLES.w_deviation }, { n: 'No Jump Outside W', v: c.noJump, w: ATTR_TUNABLES.w_nojump }, { n: 'Run Continuity', v: c.continuity, w: ATTR_TUNABLES.w_continuity }, { n: 'Uniqueness', v: c.uniqueness, w: ATTR_TUNABLES.w_unique }].forEach(function(s) {
        h += '<div class="attr-detail-row"><span class="attr-detail-lbl">' + s.n + ' (w=' + s.w + ')</span><span class="attr-detail-val">' + Math.round(s.v * 100) + '% → ' + Math.round(s.v * s.w * 100) + 'pts</span></div>';
      });
      h += '<div class="attr-detail-row" style="border-top:1px solid var(--bdr);margin-top:4px;padding-top:4px"><span class="attr-detail-lbl"><b>Composite</b></span><span class="attr-detail-val" style="color:' + scCol + '"><b>' + sc + '%</b></span></div>';
      h += '<div class="attr-detail-title" style="margin-top:8px">Trip Info</div>';
      h += '<div class="attr-detail-row"><span class="attr-detail-lbl">Run</span><span class="attr-detail-val">' + t.run_id + '</span></div>';
      h += '<div class="attr-detail-row"><span class="attr-detail-lbl">Seq #</span><span class="attr-detail-val">' + t.sequence + '</span></div>';
      h += '<div class="attr-detail-row"><span class="attr-detail-lbl">Direction</span><span class="attr-detail-val">' + t.direction + '</span></div>';
      h += '<div class="attr-detail-row"><span class="attr-detail-lbl">Signposts</span><span class="attr-detail-val">' + t.signposts.length + ' (' + t.signposts.filter(function(sp) { return sp.missed; }).length + ' missed)</span></div>';
      h += '<div class="attr-detail-row"><span class="attr-detail-lbl">Peak Delay</span><span class="attr-detail-val" style="color:' + devCol + '">' + peakDev.toFixed(1) + ' min</span></div>';
      h += '</div>';
    });
    h += '</div>';
  });
  h += '<div class="attr-tunables"><div class="attr-tunables-title">⚙ Tunables (live re-run)</div>';
  h += '<div class="attr-tunable-row"><label>θ_jump</label><input type="range" min="1.0" max="4.0" step="0.1" value="' + ATTR_TUNABLES.theta_jump + '" oninput="updateAttrTunable(\'theta_jump\',this.value,' + disId + ')"><span class="attr-tv" id="atv_theta_jump">' + ATTR_TUNABLES.theta_jump + '</span></div>';
  h += '<div class="attr-tunable-row"><label>θ_accept</label><input type="range" min="0.50" max="0.95" step="0.05" value="' + ATTR_TUNABLES.theta_accept + '" oninput="updateAttrTunable(\'theta_accept\',this.value,' + disId + ')"><span class="attr-tv" id="atv_theta_accept">' + ATTR_TUNABLES.theta_accept + '</span></div>';
  h += '<div class="attr-tunable-row"><label>θ_review</label><input type="range" min="0.30" max="0.75" step="0.05" value="' + ATTR_TUNABLES.theta_review + '" oninput="updateAttrTunable(\'theta_review\',this.value,' + disId + ')"><span class="attr-tv" id="atv_theta_review">' + ATTR_TUNABLES.theta_review + '</span></div>';
  h += '</div>';
  h += '<div style="margin-top:12px;padding:8px;background:var(--bg2);border:1px solid var(--bdr);border-radius:3px;font-size:9px;color:var(--tx3)">';
  h += '<b style="color:var(--acc)">AUDIT</b> — ' + results.decisions.length + ' decisions logged from ' + results.trips.length + ' trips evaluated. Pipeline: A\u2192B\u21921/2\u2192C\u21921/2. Confidence weights sum to 1.0. All parameters tunable above \u2014 changes re-run the engine instantly.</div>';

  // Override controls
  var ov = attrOverrides[disId] || {};
  var nRemoved = ov.removed ? Object.keys(ov.removed).length : 0;
  var nAdded   = ov.added ? ov.added.length : 0;
  h += '<div class="attr-override-bar">';
  h += '<button class="attr-add-manual-btn" onclick="attrAddManual(' + disId + ')">+ Add Trip Manually</button>';
  if (nRemoved > 0 || nAdded > 0) {
    h += ' <span class="attr-override-summary">' + (nRemoved ? nRemoved + ' removed' : '') + (nRemoved && nAdded ? ' &bull; ' : '') + (nAdded ? nAdded + ' added' : '') + '</span>';
    h += ' <button class="attr-reset-btn" onclick="attrResetOverrides(' + disId + ')">Reset Overrides</button>';
  }
  h += '</div>';
  document.getElementById('attrBody').innerHTML = h;
  document.getElementById('attrPanel').classList.add('open');
}

window.toggleAttrDetail = function(tripId) {
  var el = document.getElementById('attrDet_' + tripId.replace(/[^a-zA-Z0-9]/g, '_'));
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};
window.updateAttrTunable = function(key, val, disId) {
  ATTR_TUNABLES[key] = parseFloat(val);
  var lbl = document.getElementById('atv_' + key); if (lbl) lbl.textContent = val;
  var dis = disruptions.find(function(d) { return d.id === disId; });
  if (dis) { runAttribution(dis); renderAttrPanel(disId); }
};
window.openAttrPanel = function(disId) {
  var dis = disruptions.find(function(d) { return d.id === disId; });
  if (!dis) return;
  if (!attrResults[disId]) runAttribution(dis);
  renderAttrPanel(disId);
};
window.closeAttrPanel = function() { document.getElementById('attrPanel').classList.remove('open'); };

// Override buildDisPopup to add attribution preview + button
var _origBuildDisPopup = buildDisPopup;
buildDisPopup = function(dis) {
  var base = _origBuildDisPopup(dis);
  if (!attrResults[dis.id]) runAttribution(dis);
  var results = attrResults[dis.id];
  var preview = '';
  if (results && results.decisions.length > 0) {
    var nAcc = results.decisions.filter(function(d) { return d.state === 'PRE_ACCEPTED'; }).length;
    var nRev = results.decisions.filter(function(d) { return d.state === 'REVIEW'; }).length;
    var byRule = {}; results.decisions.forEach(function(d) { byRule[d.rule] = (byRule[d.rule] || 0) + 1; });
    var ruleSum = Object.keys(byRule).map(function(r) { return 'Rule ' + r + ': ' + byRule[r]; }).join(' · ');
    preview = '<div class="dp-attr-preview"><div class="dp-attr-preview-hdr">⚡ Attribution Engine <span class="dp-attr-preview-count">' + results.decisions.length + ' trips</span></div>';
    preview += '<div class="dp-attr-row"><span style="color:#00e5a0">✓ ' + nAcc + ' pre-accepted</span>&nbsp;&nbsp;<span style="color:#f59623">⚠ ' + nRev + ' review</span></div>';
    preview += '<div class="dp-attr-row" style="font-size:8px;color:var(--tx3)">' + ruleSum + '</div>';
    preview += '<div class="dp-attr-row" style="font-size:8px">Chain confidence: <span style="color:' + (results.chain_confidence >= 0.8 ? '#00e5a0' : results.chain_confidence >= 0.55 ? '#f59623' : '#e53e3e') + '">' + Math.round(results.chain_confidence * 100) + '%</span></div></div>';
  }
  var attrBtn = '<button class="dp-attr-btn" onclick="openAttrPanel(' + dis.id + ')">⚡ View Attribution Details</button>';
  base = base.replace('<button class="dp-edit-btn"', preview + attrBtn + '<button class="dp-edit-btn"');
  return base;
};

// Hook addToDisLog to add attribution entry
var _origAddToDisLog2 = addToDisLog;
addToDisLog = function(dis) {
  _origAddToDisLog2(dis);
  if (!attrResults[dis.id]) runAttribution(dis);
  var results = attrResults[dis.id];
  if (results && results.decisions.length > 0) {
    disruptionLog.unshift({ id: dis.id + 900, time: new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false }), route: dis.route, routes: dis.routes || [dis.route], type: 'Attribution: ' + results.decisions.length + ' trips attributed', start: dis.start, endTs: null, status: 'active' });
    renderDisLog();
  }
};

// ── OVERRIDE HANDLERS ─────────────────────────────────────────────────────
window.attrRemoveTrip = function(disId, tripId) {
  if (!attrOverrides[disId]) attrOverrides[disId] = { removed: {}, added: [] };
  attrOverrides[disId].removed[tripId] = { ts: new Date().toISOString() };
  var dis = disruptions.find(function(d) { return d.id === disId; });
  if (dis) { runAttribution(dis); renderAttrPanel(disId); }
};

window.attrAddManual = function(disId) {
  var dis = disruptions.find(function(d) { return d.id === disId; });
  if (!dis) return;
  var trips = attrResults[disId] ? attrResults[disId].trips : [];
  // Find an un-attributed trip to suggest
  var ov = attrOverrides[disId] || { removed: {}, added: [] };
  var attributed = {};
  if (attrResults[disId]) attrResults[disId].decisions.forEach(function(d) { attributed[d.trip.trip_id] = true; });
  ov.added.forEach(function(t) { attributed[t.trip_id] = true; });
  var candidates = trips.filter(function(t) { return !attributed[t.trip_id] && !ov.removed[t.trip_id]; });
  if (candidates.length === 0) {
    alert('No additional trips available to add — all evaluated trips are already attributed.');
    return;
  }
  // Add the first unattributed candidate (in a real UI this would be a picker)
  var pick = candidates[0];
  if (!attrOverrides[disId]) attrOverrides[disId] = { removed: {}, added: [] };
  attrOverrides[disId].added.push(pick);
  runAttribution(dis); renderAttrPanel(disId);
};

window.attrResetOverrides = function(disId) {
  attrOverrides[disId] = { removed: {}, added: [] };
  var dis = disruptions.find(function(d) { return d.id === disId; });
  if (dis) { runAttribution(dis); renderAttrPanel(disId); }
};

// ===== END ATTRIBUTION ENGINE =====

} // end _initAttribution
if(window._opsviewReady)_initAttribution();
else document.addEventListener("opsview-ready",_initAttribution);
})();
