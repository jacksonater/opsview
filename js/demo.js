// demo.js — Scripted investor demo sequence
// Automates a realistic disruption scenario on Route 86 (Smith St corridor)
// for use in presentations. Activate via the "▶ Demo" button on the strip.
//
// Sequence:
//   0s  — Start simulator at 08:10 (busy AM shoulder)
//   6s  — Fly map to Smith St / Johnston St, Route 86
//  10s  — Auto-create Vehicle Breakdown on Rt 86 at Smith St
//  14s  — Open the disruption popup to show attribution
//  20s  — Open the Maximo panel to demo the work-order flow
//  32s  — Flash the Attribution panel
//  44s  — Simulate a second incident (Overhead wire down on Rt 96 at Fitzroy)
//  58s  — Show attribution history panel
//  68s  — Conclude — leave system live for audience Q&A

(function(){
'use strict';

var _demoRunning = false;
var _demoTimers = [];

function later(fn, ms){
  var id = setTimeout(fn, ms);
  _demoTimers.push(id);
}

function cancelDemo(){
  _demoTimers.forEach(clearTimeout);
  _demoTimers = [];
  _demoRunning = false;
  var btn = document.getElementById('demoBtnStrip');
  if(btn){ btn.textContent = '▶ Demo'; btn.classList.remove('demo-running'); }
  showToast('Demo stopped.', 2000);
}

function showToast(msg, dur){
  var el = document.getElementById('demoToast');
  if(!el){ el = document.createElement('div'); el.id = 'demoToast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('demo-toast-show');
  clearTimeout(el._tid);
  el._tid = setTimeout(function(){ el.classList.remove('demo-toast-show'); }, dur || 3000);
}

function startDemo(){
  if(_demoRunning){ cancelDemo(); return; }
  _demoRunning = true;
  var btn = document.getElementById('demoBtnStrip');
  if(btn){ btn.textContent = '■ Stop Demo'; btn.classList.add('demo-running'); }

  showToast('Demo starting — simulator initialising…', 3500);

  // ── Step 1: Start simulator at 08:10 ──
  later(function(){
    if(!_demoRunning) return;
    // Set time picker and start sim
    var tp = document.getElementById('simTimePicker');
    if(tp){ tp.value = '08:10'; }
    var startBtn = document.getElementById('simStartBtn');
    if(startBtn && startBtn.textContent.indexOf('▶') >= 0) startBtn.click();
    // Slow playback so audience can follow
    var spdSel = document.getElementById('spdSel');
    if(spdSel){ spdSel.value = '3'; if(spdSel.onchange) spdSel.onchange(); }
    showToast('Simulator running — 08:10 AM shoulder peak', 3500);
  }, 800);

  // ── Step 2: Fly to Route 86 Smith St corridor ──
  later(function(){
    if(!_demoRunning) return;
    var m = window.map;
    if(m) m.flyTo([-37.7944, 144.9897], 15, {duration: 2.2, easeLinearity: 0.25});
    showToast('Route 86 — Smith St / Johnston St corridor', 3000);
  }, 5000);

  // ── Step 3: Create vehicle breakdown on Route 86 at Smith St ──
  later(function(){
    if(!_demoRunning) return;
    if(!window.createScriptedDisruption){
      showToast('Error: app not ready', 2000); return;
    }
    // Smith St / Johnston St intersection — major Route 86 signpost
    var dis = window.createScriptedDisruption(
      -37.7944, 144.9897,
      '86',
      'Vehicle breakdown',
      'Tram T2147 (Run 9/4) has suffered a mechanical fault at the Smith St / Johnston St intersection. Tram is stationary blocking both Up and Down services. Crew have been notified. Estimated clearance 25 minutes.',
      'Both directions'
    );
    if(dis){
      showToast('⚠ Disruption logged — Rt 86 Vehicle Breakdown at Smith St', 4000);
    }
  }, 9500);

  // ── Step 4: Run attribution and open the disruption popup ──
  later(function(){
    if(!_demoRunning) return;
    // Find the most recently created disruption and open it
    var disArr = window.disruptions;
    if(disArr && disArr.length > 0){
      var d = disArr[disArr.length - 1];
      // Run attribution engine first
      if(window.runAttribution) window.runAttribution(d.id);
      if(d.marker) d.marker.openPopup();
    }
    showToast('Attribution engine running — assigning impacted trips…', 3500);
  }, 13000);

  // ── Step 5: Open Maximo panel to demo the work-order sync ──
  later(function(){
    if(!_demoRunning) return;
    var disArr = window.disruptions;
    if(disArr && disArr.length > 0){
      var d = disArr[disArr.length - 1];
      if(window.openMaximoPanel) window.openMaximoPanel(d.id);
    }
    showToast('Maximo integration — work order pre-populated from OpsView', 4000);
  }, 19000);

  // ── Step 6: Open Attribution panel to show trip decisions ──
  later(function(){
    if(!_demoRunning) return;
    if(window.closeAllRightPanels) window.closeAllRightPanels('attr');
    var disArr = window.disruptions;
    if(disArr && disArr.length > 0){
      var d = disArr[disArr.length - 1];
      if(window.openAttrPanel) window.openAttrPanel(d.id);
    }
    showToast('Attribution — ACCEPT / REVIEW / REJECT decisions with confidence scores', 4500);
  }, 31000);

  // ── Step 7: Second incident — OHW fault on Route 96 at Fitzroy ──
  later(function(){
    if(!_demoRunning) return;
    if(window.closeAllRightPanels) window.closeAllRightPanels();
    var m = window.map;
    if(m) m.flyTo([-37.7988, 144.9822], 15, {duration: 1.8});
    later(function(){
      if(!_demoRunning) return;
      window.createScriptedDisruption(
        -37.7988, 144.9822,
        '96',
        'Overhead wire down',
        'OHW fault reported at Fitzroy / Smith St junction. Rt 96 services affected northbound. Emergency crew dispatched.',
        'Down only'
      );
      showToast('⚠ Second incident — Rt 96 OHW fault at Fitzroy', 4000);
    }, 2200);
  }, 43000);

  // ── Step 8: Show attribution history ──
  later(function(){
    if(!_demoRunning) return;
    if(window.closeAllRightPanels) window.closeAllRightPanels();
    if(window.DisHistory && window.DisHistory.open) window.DisHistory.open();
    showToast('Attribution history — full audit trail for all sessions', 4000);
  }, 57000);

  // ── Step 9: Conclude ──
  later(function(){
    if(!_demoRunning) return;
    if(window.closeAllRightPanels) window.closeAllRightPanels();
    showToast('Demo complete — system is live. Q&A welcome.', 5000);
    _demoRunning = false;
    var btn = document.getElementById('demoBtnStrip');
    if(btn){ btn.textContent = '▶ Demo'; btn.classList.remove('demo-running'); }
  }, 67000);
}

// ── PUBLIC API ──
window.OpsViewDemo = { start: startDemo, stop: cancelDemo };

// Wire up the button once DOM is ready
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
