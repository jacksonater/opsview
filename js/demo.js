// demo.js — Scripted investor demo sequence
// Automates a realistic disruption scenario using actual tram stop coordinates.
// All incident points are on verified route shapes (from GTFS stops data).
// Activate via the "▶ Demo" button on the network strip.
//
// Sequence:
//   0s  — Start simulator at 08:10 (AM shoulder peak, plenty of trams active)
//   5s  — Fly map to Route 86 Smith St / Johnston St stop
//   9s  — Create Vehicle Breakdown on Rt 86 at Smith St stop (lat/lng from GTFS)
//  13s  — Open disruption popup — show trapped trams, crossover boundaries
//  18s  — Open Attribution panel — show ACCEPT/REVIEW/REJECT trip decisions
//  28s  — Open Maximo panel — show pre-populated work order
//  37s  — Create second incident: Rt 96 OHW fault at Johnston St stop (GTFS)
//  42s  — Fly to show both incidents on-screen together
//  50s  — Clear both disruptions (this triggers history records)
//  55s  — Open Attribution History panel (records only appear after close)
//  65s  — Conclude — leave system live for Q&A
//
// Coordinates are taken directly from GTFS_ROUTES stop arrays in app.js so
// every incident point snaps cleanly onto an active tram route.

(function(){
'use strict';

// ── Verified on-route stop coordinates ──────────────────────────────────────
// Route 86  — Smith St / Johnston St stop (Collingwood)
var RT86_SMITH_ST   = {lat: -37.79047, lng: 144.98635};
// Route 86  — Melbourne Museum (Fitzroy South, backup for variety)
var RT86_MUSEUM     = {lat: -37.80576, lng: 144.97360};
// Route 96  — Johnston St stop (Brunswick / Fitzroy boundary on Rt 96)
var RT96_JOHNSTON   = {lat: -37.79758, lng: 144.97490};

var _demoRunning = false;
var _demoTimers = [];
var _demoDisIds = [];  // track created disruptions so we can clear them

function later(fn, ms){
  var id = setTimeout(fn, ms);
  _demoTimers.push(id);
}

function cancelDemo(){
  _demoTimers.forEach(clearTimeout);
  _demoTimers = [];
  _demoDisIds = [];
  _demoRunning = false;
  var btn = document.getElementById('demoBtnStrip');
  if(btn){ btn.textContent = '▶ Demo'; btn.classList.remove('demo-running'); }
  showToast('Demo stopped.', 2000);
}

function showToast(msg, dur){
  var el = document.getElementById('demoToast');
  if(!el){
    el = document.createElement('div');
    el.id = 'demoToast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('demo-toast-show');
  clearTimeout(el._tid);
  el._tid = setTimeout(function(){ el.classList.remove('demo-toast-show'); }, dur || 3000);
}

function startDemo(){
  if(_demoRunning){ cancelDemo(); return; }
  _demoRunning = true;
  _demoDisIds = [];
  var btn = document.getElementById('demoBtnStrip');
  if(btn){ btn.textContent = '■ Stop Demo'; btn.classList.add('demo-running'); }

  showToast('Demo starting — simulator initialising…', 3500);

  // ── Step 1 (0.8s): Start simulator at 08:10, speed 3× ──────────────────────
  later(function(){
    if(!_demoRunning) return;
    var tp = document.getElementById('simTimePicker');
    if(tp) tp.value = '08:10';
    var startBtn = document.getElementById('simStartBtn');
    if(startBtn && startBtn.textContent.indexOf('▶') >= 0) startBtn.click();
    var spdSel = document.getElementById('spdSel');
    if(spdSel){ spdSel.value = '3'; if(spdSel.onchange) spdSel.onchange(); }
    showToast('Simulator running — 08:10 AM shoulder peak, 3× speed', 3500);
  }, 800);

  // ── Step 2 (5s): Fly to Route 86 Smith St corridor ─────────────────────────
  later(function(){
    if(!_demoRunning) return;
    var m = window.map;
    if(m) m.flyTo([RT86_SMITH_ST.lat, RT86_SMITH_ST.lng], 15, {duration: 2.2, easeLinearity: 0.25});
    showToast('Route 86 — Smith St / Johnston St, Collingwood', 3000);
  }, 5000);

  // ── Step 3 (9s): Create Rt 86 Vehicle Breakdown at Smith St stop ────────────
  later(function(){
    if(!_demoRunning) return;
    if(!window.createScriptedDisruption){
      showToast('Error: app not ready', 2000); return;
    }
    var dis = window.createScriptedDisruption(
      RT86_SMITH_ST.lat, RT86_SMITH_ST.lng,
      '86',
      'Vehicle breakdown',
      'Tram T2147 (Run 86-9/4) has suffered a mechanical fault at the Smith St / Johnston St intersection. ' +
      'Tram stationary, blocking both directions. Crew notified. Estimated clearance 25 min.',
      'Both directions'
    );
    if(dis){
      _demoDisIds.push(dis.id);
      showToast('⚠ Disruption logged — Rt 86 Vehicle Breakdown at Smith St', 4000);
    }
  }, 9000);

  // ── Step 4 (13s): Open disruption popup to show trapped trams ──────────────
  later(function(){
    if(!_demoRunning) return;
    var disArr = window.disruptions;
    if(disArr && disArr.length > 0){
      var d = disArr[disArr.length - 1];
      if(window.runAttribution) window.runAttribution(d.id);
      if(d.marker) d.marker.openPopup();
    }
    showToast('Tram disruption flagged — crossovers set, trams being trapped', 3500);
  }, 13000);

  // ── Step 5 (18s): Open Attribution panel — show trip decisions ─────────────
  later(function(){
    if(!_demoRunning) return;
    if(window.closeAllRightPanels) window.closeAllRightPanels('attr');
    var disArr = window.disruptions;
    if(disArr && disArr.length > 0){
      var d = disArr[disArr.length - 1];
      if(window.openAttrPanel) window.openAttrPanel(d.id);
    }
    showToast('Attribution engine — ACCEPT / REVIEW / REJECT per timetable trip', 4500);
  }, 18000);

  // ── Step 6 (28s): Open Maximo panel — pre-populated work order ─────────────
  later(function(){
    if(!_demoRunning) return;
    var disArr = window.disruptions;
    if(disArr && disArr.length > 0){
      var d = disArr[disArr.length - 1];
      if(window.openMaximoPanel) window.openMaximoPanel(d.id);
    }
    showToast('Maximo integration — work order auto-created from OpsView incident', 4000);
  }, 28000);

  // ── Step 7 (37s): Create second incident — Rt 96 OHW fault at Johnston St ──
  later(function(){
    if(!_demoRunning) return;
    if(window.closeAllRightPanels) window.closeAllRightPanels();
    var dis2 = window.createScriptedDisruption(
      RT96_JOHNSTON.lat, RT96_JOHNSTON.lng,
      '96',
      'Overhead wire down',
      'OHW fault at Johnston St / Smith St junction. Route 96 services impacted. Emergency crew dispatched.',
      'Down only'
    );
    if(dis2){
      _demoDisIds.push(dis2.id);
      showToast('⚠ Second incident — Rt 96 OHW fault at Johnston St', 4000);
    }
  }, 37000);

  // ── Step 8 (42s): Fly back to show both incidents together ─────────────────
  later(function(){
    if(!_demoRunning) return;
    var m = window.map;
    // Midpoint between the two incidents, zoomed out slightly to show both
    if(m) m.flyTo([-37.794, 144.981], 14, {duration: 1.8, easeLinearity: 0.3});
    showToast('Two simultaneous disruptions — both tracked independently', 3500);
  }, 42000);

  // ── Step 9 (50s): Clear both disruptions → triggers history records ─────────
  later(function(){
    if(!_demoRunning) return;
    if(window.closeAllRightPanels) window.closeAllRightPanels();
    showToast('Clearing incidents — attribution records saved to history…', 3500);
    // Clear each disruption we created; removeDis records to DisHistory
    _demoDisIds.forEach(function(id){
      if(window.removeDis) window.removeDis(id);
    });
    _demoDisIds = [];
  }, 50000);

  // ── Step 10 (55s): Open Attribution History — records now visible ───────────
  later(function(){
    if(!_demoRunning) return;
    if(window.DisHistory && window.DisHistory.open) window.DisHistory.open();
    showToast('Attribution History — full audit trail, export to CSV for Maximo import', 4500);
  }, 55000);

  // ── Step 11 (65s): Conclude ─────────────────────────────────────────────────
  later(function(){
    if(!_demoRunning) return;
    if(window.closeAllRightPanels) window.closeAllRightPanels();
    showToast('Demo complete — system is live. Questions welcome.', 5000);
    _demoRunning = false;
    var btn = document.getElementById('demoBtnStrip');
    if(btn){ btn.textContent = '▶ Demo'; btn.classList.remove('demo-running'); }
  }, 65000);
}

// ── PUBLIC API ──────────────────────────────────────────────────────────────
window.OpsViewDemo = { start: startDemo, stop: cancelDemo };

// Wire up the strip button
function _initDemo(){
  var btn = document.getElementById('demoBtnStrip');
  if(btn) btn.addEventListener('click', startDemo);
}
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', _initDemo);
} else {
  _initDemo();
}

})();
