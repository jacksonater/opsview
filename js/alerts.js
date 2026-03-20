// alerts.js — Tram deviation jump alert system
// Fires when deviation JUMPS more than JUMP_THRESHOLD between two
// consecutive signposts on the same tram.  Gradual accumulation across
// many signposts does not trigger (that's normal traffic).
// Suppressed when the tram is already captured by an active disruption.

(function(){

var JUMP_THRESHOLD_SECS = 5 * 60; // 5 minutes
var AUTO_DISMISS_MS     = 5 * 60 * 1000;
var MAX_VISIBLE         = 3;

var alertQueue   = []; // currently showing (not yet dismissed)
var alertHistory = []; // all alerts this session
var unreadCount  = 0;
var nextId       = 1;

// Per-tram last-signpost state: { tramId → { wpIdx, devSecs, code } }
var tramWpState  = {};

// ── CORE DETECTION ────────────────────────────────────────────────────────
// Called by simulator.js each time a tram advances to a new waypoint.
// wpIdx   — the waypoint index the tram just reached
// wpCode  — signpost code (e.g. 'FLSW')
// devSecs — current t.dv in seconds (signed, positive = late)
function checkSignpostJump(tram, wpIdx, wpCode, devSecs) {
  var tid = tram.id;
  var prev = tramWpState[tid];

  // Always update state so we have a baseline for the next comparison
  tramWpState[tid] = { wpIdx: wpIdx, devSecs: devSecs, code: wpCode };

  if (!prev) return;                        // no previous — nothing to compare
  if (wpIdx !== prev.wpIdx + 1) return;     // skipped or regressed — reset only

  // Suppress: tram already captured by a disruption
  if (tram.blockedByDis) return;

  // Suppress: tram already has an unresolved alert in the queue
  if (alertQueue.some(function(a) { return a.tramId === tid; })) return;

  var jump = devSecs - prev.devSecs;
  if (jump < JUMP_THRESHOLD_SECS) return;

  fireAlert({
    tramId:      tid,
    tramRun:     tram.run,
    tramRoute:   tram.route,
    fromCode:    prev.code,
    toCode:      wpCode,
    fromDevSecs: prev.devSecs,
    toDevSecs:   devSecs,
    jumpSecs:    jump
  });
}

// Auto-resolve when a disruption captures this tram (no longer unknown).
function resolveForTram(tramId) {
  var before = alertQueue.length;
  alertQueue = alertQueue.filter(function(a) { return a.tramId !== tramId; });
  if (alertQueue.length !== before) renderAlerts();
  updateBell();
}

// Reset signpost tracking when a tram changes trip (e.g. terminus reversal)
// so we don't false-positive on the discontinuity.
function resetTram(tramId) {
  delete tramWpState[tramId];
}

// ── LIFECYCLE ─────────────────────────────────────────────────────────────
function fireAlert(data) {
  var id = nextId++;
  var a  = { id: id, ts: new Date() };
  Object.keys(data).forEach(function(k) { a[k] = data[k]; });
  alertQueue.unshift(a);
  alertHistory.unshift(a);
  unreadCount++;
  renderAlerts();
  updateBell();
  // Auto-dismiss to bell after 5 minutes
  setTimeout(function() { _dismiss(id, false, true); }, AUTO_DISMISS_MS);
}

// actioned: true when controller took an action (attribute/create Maximo)
// silent:   true for auto-dismiss (doesn't decrement unread — already counting via bell)
function _dismiss(alertId, actioned, silent) {
  var idx = -1;
  for (var i = 0; i < alertQueue.length; i++) {
    if (alertQueue[i].id === alertId) { idx = i; break; }
  }
  if (idx < 0) return;
  alertQueue.splice(idx, 1);
  if (actioned) unreadCount = Math.max(0, unreadCount - 1);
  renderAlerts();
  updateBell();
}

// ── FORMATTING ────────────────────────────────────────────────────────────
function fmtDev(secs) {
  var abs  = Math.abs(secs);
  var m    = Math.floor(abs / 60);
  var s    = Math.abs(secs % 60);
  var sign = secs < 0 ? '-' : '+';
  return sign + m + ':' + (s < 10 ? '0' : '') + s;
}

function fmtJump(secs) {
  var m = Math.floor(secs / 60);
  var s = Math.abs(secs % 60);
  return '+' + m + (s ? ':' + (s < 10 ? '0' : '') + s : '') + '\u202Fmin';
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── ALERT CARD RENDERING ─────────────────────────────────────────────────
function renderAlerts() {
  var container = document.getElementById('alertContainer');
  if (!container) return;

  var visible = alertQueue.slice(0, MAX_VISIBLE);
  var html = '';

  visible.forEach(function(a) {
    var isSim   = !!window._simRunning;
    var badgeTxt = isSim ? 'SIM \u26A0 JUMP' : '\u26A0 JUMP';
    var badgeCls = 'alert-badge' + (isSim ? ' alert-badge-sim' : '');
    html +=
      '<div class="alert-card" id="alert-card-' + a.id + '">' +
        '<div class="alert-card-hdr">' +
          '<span class="' + badgeCls + '">' + badgeTxt + '</span>' +
          '<span class="alert-tram">T' + escHtml(String(a.tramId)) +
            ' \u00B7 Rt\u00A0' + escHtml(String(a.tramRoute)) + '</span>' +
          '<button class="alert-dismiss" ' +
            'onclick="window.Alerts.dismiss(' + a.id + ',false,false)" ' +
            'title="Dismiss">\u2715</button>' +
        '</div>' +
        '<div class="alert-stops">' +
          escHtml(a.fromCode || '\u2014') +
          ' <span class="alert-arrow">\u2192</span> ' +
          escHtml(a.toCode) +
        '</div>' +
        '<div class="alert-delta">' +
          escHtml(fmtDev(a.fromDevSecs)) +
          ' \u2192 <strong>' + escHtml(fmtDev(a.toDevSecs)) + '</strong>' +
          ' &nbsp;<span class="alert-jump">' + escHtml(fmtJump(a.jumpSecs)) + ' jump</span>' +
        '</div>' +
        '<div class="alert-actions">' +
          '<button class="alert-btn" ' +
            'onclick="window.Alerts.showAttributeDialog(' + a.id + ')">' +
            'Attribute to log\u2026</button>' +
          '<button class="alert-btn alert-btn-mx" ' +
            'onclick="window.Alerts.createMaximo(' + a.id + ')">' +
            'New Maximo log</button>' +
        '</div>' +
      '</div>';
  });

  if (alertQueue.length > MAX_VISIBLE) {
    html += '<div class="alert-overflow">+' + (alertQueue.length - MAX_VISIBLE) +
      ' more \u2014 open notification log</div>';
  }

  container.innerHTML = html;
}

function updateBell() {
  var bell  = document.getElementById('alertBell');
  var badge = document.getElementById('alertBellBadge');
  if (!bell) return;
  if (unreadCount > 0) {
    bell.classList.add('has-alerts');
    if (badge) badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
  } else {
    bell.classList.remove('has-alerts');
    if (badge) badge.textContent = '';
  }
}

// ── BELL PANEL ───────────────────────────────────────────────────────────
function toggleBellPanel() {
  var panel = document.getElementById('alertBellPanel');
  if (!panel) return;
  var open = panel.classList.toggle('open');
  if (open) {
    // Mark all as read when panel opens
    unreadCount = 0;
    updateBell();
    renderBellPanel();
  }
}

function renderBellPanel() {
  var panel = document.getElementById('alertBellPanel');
  if (!panel) return;
  var html = '<div class="abp-hdr">Deviation Alerts' +
    '<button class="abp-close" onclick="window.Alerts.toggleBell()">\u2715</button></div>';
  if (alertHistory.length === 0) {
    html += '<div class="abp-empty">No alerts this session</div>';
  } else {
    alertHistory.slice(0, 30).forEach(function(a) {
      var ts      = a.ts.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
      var active  = alertQueue.some(function(q) { return q.id === a.id; });
      html += '<div class="abp-item' + (active ? ' abp-item-active' : '') + '">' +
        '<span class="abp-time">' + ts + '</span>' +
        '<span class="abp-tram">T' + escHtml(String(a.tramId)) +
          ' Rt' + escHtml(String(a.tramRoute)) + '</span>' +
        '<span class="abp-stops">' + escHtml(a.fromCode || '\u2014') +
          '\u2192' + escHtml(a.toCode) + '</span>' +
        '<span class="abp-jump">' + escHtml(fmtJump(a.jumpSecs)) + '</span>' +
      '</div>';
    });
  }
  panel.innerHTML = html;
}

// ── ATTRIBUTION DIALOG ───────────────────────────────────────────────────
function showAttributeDialog(alertId) {
  var existing = document.getElementById('alertAttrDialog');
  if (existing) existing.remove();

  var a = alertHistory.find(function(x) { return x.id === alertId; });
  if (!a) return;

  var incidents = window.SimMaximo ? Object.values(window.SimMaximo.incidents) : [];
  var listHtml;
  if (incidents.length) {
    listHtml = '<div class="aad-label">Select open Maximo log:</div><div class="aad-list">';
    incidents.forEach(function(inc) {
      listHtml +=
        '<div class="aad-item" onclick="window.Alerts.attributeToLog(' + alertId +
          ',\'' + escHtml(inc.mxRef) + '\')">' +
          '<strong>' + escHtml(inc.mxRef) + '</strong><br>' +
          '<span>' + escHtml(inc.template ? inc.template.desc : 'General') + '</span>' +
        '</div>';
    });
    listHtml += '</div>';
  } else {
    listHtml = '<div class="aad-empty">No open Maximo logs. Create one below.</div>';
  }

  var html =
    '<div class="aad-overlay" id="alertAttrDialog" ' +
      'onclick="if(event.target===this)this.remove()">' +
      '<div class="aad-panel">' +
        '<div class="aad-hdr">' +
          'Attribute deviation \u2014 T' + escHtml(String(a.tramId)) +
          ' &middot; Rt ' + escHtml(String(a.tramRoute)) +
          '<button class="aad-close" ' +
            'onclick="document.getElementById(\'alertAttrDialog\').remove()">' +
            '\u2715</button>' +
        '</div>' +
        '<div class="aad-note">' +
          escHtml(a.fromCode || '\u2014') + ' \u2192 ' + escHtml(a.toCode) +
          ' &nbsp;|&nbsp; ' + escHtml(fmtJump(a.jumpSecs)) +
          ' jump at ' + escHtml(fmtDev(a.toDevSecs)) +
        '</div>' +
        listHtml +
        '<div class="aad-actions">' +
          '<button class="aad-mx-btn" ' +
            'onclick="window.Alerts.createMaximo(' + alertId + ')">' +
            '+ New Maximo log</button>' +
          '<button class="aad-cancel-btn" ' +
            'onclick="document.getElementById(\'alertAttrDialog\').remove()">' +
            'Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.insertAdjacentHTML('beforeend', html);
}

function attributeToLog(alertId, mxRef) {
  var a = alertHistory.find(function(x) { return x.id === alertId; });
  if (!a) return;

  // Attach a note to the chosen Maximo incident
  var incidents = window.SimMaximo ? window.SimMaximo.incidents : {};
  var inc = Object.values(incidents).find(function(i) { return i.mxRef === mxRef; });
  if (inc) {
    if (!inc.overrides) inc.overrides = [];
    inc.overrides.push({
      type: 'deviation_alert',
      tramId: a.tramId, route: a.tramRoute,
      fromSp: a.fromCode, toSp: a.toCode,
      jumpSecs: a.jumpSecs, ts: a.ts.toISOString()
    });
  }

  var dialog = document.getElementById('alertAttrDialog');
  if (dialog) dialog.remove();
  _dismiss(alertId, true, false);

  // Brief confirmation in status strip
  if (window.setLiveStatus) {
    window.setLiveStatus('active', 'Deviation attributed to ' + mxRef);
    setTimeout(function() {
      if (window.refreshLiveStatus) window.refreshLiveStatus();
    }, 3000);
  }
}

function createMaximo(alertId) {
  var a = alertHistory.find(function(x) { return x.id === alertId; });
  if (!a) return;

  var dialog = document.getElementById('alertAttrDialog');
  if (dialog) dialog.remove();
  _dismiss(alertId, true, false);

  // Create a standalone Maximo incident for this deviation
  if (window.SimMaximo && window.SimMaximo.createAlertIncident) {
    window.SimMaximo.createAlertIncident(a);
  }
}

// ── PUBLIC API ────────────────────────────────────────────────────────────
window.Alerts = {
  checkSignpostJump:   checkSignpostJump,
  resolveForTram:      resolveForTram,
  resetTram:           resetTram,
  dismiss:             _dismiss,
  showAttributeDialog: showAttributeDialog,
  attributeToLog:      attributeToLog,
  createMaximo:        createMaximo,
  toggleBell:          toggleBellPanel,
  getHistory:          function() { return alertHistory.slice(); },
  getUnread:           function() { return unreadCount; }
};

})();
