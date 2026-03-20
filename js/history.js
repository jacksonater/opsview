// history.js — Attribution history panel
// Records a snapshot of the attribution engine results when a disruption
// is finalised (cleared).  Provides an in-app history view and CSV export.

(function(){

var disHistory = [];
// Each entry: { dis, attrSnapshot, closedAt, logEntry }

// ── RECORD ───────────────────────────────────────────────────────────────
// Called by app.js clearDisruption() just before the disruption is removed.
function recordClosure(dis, logEntry) {
  // Deep-copy the attribution snapshot so it's frozen at close time
  var snap = null;
  if (window._attrResults && window._attrResults[dis.id]) {
    try { snap = JSON.parse(JSON.stringify(window._attrResults[dis.id])); } catch(e) {}
  }

  var disCopy = {
    id:       dis.id,
    route:    dis.route,
    routes:   dis.routes,
    type:     dis.type,
    start:    dis.start,
    la:       dis.la,
    lo:       dis.lo,
    location: dis.location || ''
  };

  disHistory.unshift({ dis: disCopy, attrSnapshot: snap, closedAt: new Date(), logEntry: logEntry || {} });
  _updateBadge();
}

// ── PANEL OPEN / CLOSE ───────────────────────────────────────────────────
function openPanel() {
  var panel = document.getElementById('historyPanel');
  if (!panel) return;
  panel.style.display = 'flex';
  _renderList();
  _clearDetail();
}

function closePanel() {
  var panel = document.getElementById('historyPanel');
  if (panel) panel.style.display = 'none';
}

// ── LIST VIEW ────────────────────────────────────────────────────────────
function _renderList() {
  var list = document.getElementById('historyList');
  if (!list) return;

  if (disHistory.length === 0) {
    list.innerHTML = '<div class="hist-empty">No finalised disruptions this session</div>';
    return;
  }

  var html = '';
  disHistory.forEach(function(h, idx) {
    var startT     = new Date(h.dis.start).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    var endT       = h.closedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
    var tripCount  = h.attrSnapshot ? h.attrSnapshot.decisions.length : 0;
    var chainConf  = h.attrSnapshot && tripCount > 0 ? Math.round(h.attrSnapshot.chain_confidence * 100) + '%' : '\u2014';

    html +=
      '<div class="hist-row" onclick="window.DisHistory.openDetail(' + idx + ')">' +
        '<div class="hist-row-top">' +
          '<span class="hist-route">Rt\u00A0' + escHtml(h.dis.route) + '</span>' +
          '<span class="hist-type">' + escHtml(h.dis.type || 'Disruption') + '</span>' +
          '<span class="hist-time">' + startT + '\u2013' + endT + '</span>' +
        '</div>' +
        '<div class="hist-row-bot">' +
          '<span class="hist-trips">' + tripCount +
            ' trip' + (tripCount !== 1 ? 's' : '') + ' attributed</span>' +
          '<span class="hist-chain">Chain confidence: ' + chainConf + '</span>' +
        '</div>' +
      '</div>';
  });

  list.innerHTML = html;
}

// ── DETAIL VIEW ───────────────────────────────────────────────────────────
function openDetail(idx) {
  var h = disHistory[idx];
  if (!h) return;
  var detail = document.getElementById('historyDetail');
  if (!detail) return;

  var startT = new Date(h.dis.start).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  var endT   = h.closedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  var snap   = h.attrSnapshot;

  var html =
    '<div class="hist-detail-hdr">' +
      '<div>' +
        '<div class="hist-detail-title">Rt\u00A0' + escHtml(h.dis.route) +
          ' \u2014 ' + escHtml(h.dis.type) + '</div>' +
        '<div class="hist-detail-meta">' +
          startT + ' to ' + endT +
          (h.dis.location ? ' \u00B7 ' + escHtml(h.dis.location) : '') +
        '</div>' +
      '</div>' +
      '<div class="hist-detail-btns">' +
        '<button class="hist-export-btn" ' +
          'onclick="window.DisHistory.exportCsv(' + idx + ')">&#x2B07; CSV</button>' +
        '<button class="hist-close-detail" ' +
          'onclick="window.DisHistory.clearDetail()">\u2715</button>' +
      '</div>' +
    '</div>';

  if (!snap || snap.decisions.length === 0) {
    html += '<div class="hist-no-trips">No trips attributed to this disruption.</div>';
  } else {
    html +=
      '<table class="hist-table">' +
        '<thead><tr>' +
          '<th>Trip</th><th>Route</th><th>Direction</th>' +
          '<th>Rule</th><th>State</th><th>Confidence</th>' +
        '</tr></thead><tbody>';

    snap.decisions.forEach(function(d) {
      var sc       = d.confidence ? Math.round(d.confidence.score * 100) + '%' : '\u2014';
      var stateCls = d.state === 'PRE_ACCEPTED' ? 'hist-state-ok'
                   : d.state === 'REVIEW'       ? 'hist-state-rev'
                   :                              'hist-state-low';
      html +=
        '<tr>' +
          '<td>' + escHtml(d.trip.trip_id) + '</td>' +
          '<td>' + escHtml(d.trip.route_id) + '</td>' +
          '<td>' + escHtml(d.trip.direction || '\u2014') + '</td>' +
          '<td><span class="hist-rule">Rule\u00A0' + d.rule + '</span></td>' +
          '<td><span class="hist-state ' + stateCls + '">' + escHtml(d.state || '\u2014') + '</span></td>' +
          '<td>' + sc + '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';
  }

  detail.innerHTML = html;
}

function clearDetail() {
  var d = document.getElementById('historyDetail');
  if (d) d.innerHTML = '';
}

// ── CSV EXPORT ────────────────────────────────────────────────────────────
function exportCsv(idx) {
  var h = disHistory[idx];
  if (!h) return;

  var rows = [['Trip ID', 'Route', 'Run', 'Direction', 'Rule', 'State', 'Confidence',
               'Disruption Type', 'Disruption Route', 'Start', 'Closed']];

  var startIso  = new Date(h.dis.start).toISOString();
  var closedIso = h.closedAt.toISOString();

  if (h.attrSnapshot) {
    h.attrSnapshot.decisions.forEach(function(d) {
      rows.push([
        d.trip.trip_id,
        d.trip.route_id,
        d.trip.run_id || '',
        d.trip.direction || '',
        'Rule ' + d.rule,
        d.state || '',
        d.confidence ? Math.round(d.confidence.score * 100) + '%' : '',
        h.dis.type || '',
        'Rt ' + h.dis.route,
        startIso,
        closedIso
      ]);
    });
  }

  var csv = rows.map(function(r) {
    return r.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
  }).join('\n');

  var blob = new Blob([csv], { type: 'text/csv' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = 'attribution-rt' + h.dis.route + '-' +
               h.closedAt.toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── HELPERS ───────────────────────────────────────────────────────────────
function _updateBadge() {
  var badge = document.getElementById('historyBadge');
  if (badge) badge.textContent = disHistory.length > 0 ? String(disHistory.length) : '';
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── PUBLIC API ────────────────────────────────────────────────────────────
window.DisHistory = {
  recordClosure: recordClosure,
  open:          openPanel,
  close:         closePanel,
  openDetail:    openDetail,
  clearDetail:   clearDetail,
  exportCsv:     exportCsv,
  getAll:        function() { return disHistory.slice(); }
};

})();
