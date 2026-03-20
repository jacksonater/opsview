// maximo.js — Simulated Maximo Integration Layer
// Demo mode: simulates incident creation, Maximo WO reference generation,
// and the bidirectional OpsView ↔ Maximo data flow.
// Real integration requires Maximo REST API access (pending approval).

(function(){

// ── INCIDENT TEMPLATES ─────────────────────────────────────────────────────
var MX_TEMPLATES = {
  'Vehicle breakdown':      { code: 'TVM-BKDN',  desc: 'Tram Vehicle Mechanical Breakdown',        priority: 2 },
  'Collision':              { code: 'TVM-COLL',  desc: 'Tram-to-Vehicle Collision',                priority: 1 },
  'Infrastructure failure': { code: 'INF-FAIL',  desc: 'Infrastructure / Wayside Failure',         priority: 2 },
  'Police/emergency':       { code: 'EXT-EMRG',  desc: 'External Emergency Services Response',     priority: 1 },
  'Obstruction on track':   { code: 'TRK-OBS',   desc: 'Track Obstruction',                        priority: 2 },
  'Overhead wire down':     { code: 'OHW-DOWN',  desc: 'Overhead Wire / OHW Fault',                priority: 1 },
  'Points failure':         { code: 'PTS-FAIL',  desc: 'Points / Switch Failure',                  priority: 2 },
  'Signal priority fault':  { code: 'SIG-FAULT', desc: 'TSP / Signal Priority System Fault',       priority: 3 },
  'Passenger incident':     { code: 'PAX-INC',   desc: 'Passenger Incident / Medical',             priority: 2 },
  'Other':                  { code: 'OTH-GEN',   desc: 'General Incident',                         priority: 3 }
};

// Pending fields that controller must still complete in Maximo
var MX_PENDING_LABELS = {
  delayStartTime:  'Delay start time (confirm or adjust)',
  delayEndTime:    'Delay end time (update on clearance)',
  workOrders:      'Generate maintenance work orders',
  causeCode:       'Cause code and responsible party',
  driverDetails:   'Driver name and employee ID'
};

// ── IN-MEMORY STORE ────────────────────────────────────────────────────────
var mxIncidents = {};   // keyed by OpsView dis.id
var mxCounter   = 1000; // incremented for each new Maximo WO

// ── HELPERS ───────────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function nowTs() {
  return new Date().toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
}

function buildMxRef() {
  mxCounter++;
  var d = new Date();
  return 'WO-' + d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0') + '-' +
    String(mxCounter).padStart(4,'0');
}

function buildLocationDesc(dis) {
  var routes = (dis.routes || [dis.route]).map(function(r){ return 'Rt '+r; }).join(' / ');
  if (dis.southXO && dis.northXO)  return routes + ' — between ' + dis.southXO.pole + ' and ' + dis.northXO.pole;
  if (dis.southXO)                  return routes + ' — at/near ' + dis.southXO.pole;
  if (dis.northXO)                  return routes + ' — at/near ' + dis.northXO.pole;
  return routes + ' — ' + dis.la.toFixed(5) + ', ' + dis.lo.toFixed(5);
}

// ── CREATE INCIDENT ────────────────────────────────────────────────────────
function createMxIncident(dis) {
  if (mxIncidents[dis.id]) return mxIncidents[dis.id]; // idempotent

  var tmpl = MX_TEMPLATES[dis.type] || MX_TEMPLATES['Other'];
  var mxRef = buildMxRef();
  var startTs = new Date(dis.start).toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});

  var inc = {
    mxRef:      mxRef,
    disId:      dis.id,
    template:   tmpl,
    status:     'PENDING',
    createdAt:  nowTs(),
    syncedAt:   null,
    prePopulated: {
      type:        dis.type,
      routes:      dis.routes || [dis.route],
      primaryRoute:dis.route,
      direction:   dis.dir,
      startTime:   startTs,
      location:    buildLocationDesc(dis),
      southXO:     dis.southXO ? dis.southXO.pole : null,
      northXO:     dis.northXO ? dis.northXO.pole : null,
      narrative:   dis.notes || ''
    },
    fromTram:   dis._fromTram || null,
    pendingFields: ['delayStartTime','delayEndTime','workOrders','causeCode','driverDetails'],
    overrides:  []
  };

  mxIncidents[dis.id] = inc;

  // Simulate async Maximo sync (800ms network delay)
  setTimeout(function(){
    inc.status   = 'SYNCED';
    inc.syncedAt = nowTs();
    // Update live badge in popup if still visible
    var badge = document.getElementById('mxSyncBadge_'+dis.id);
    if (badge) {
      badge.textContent = '● SYNCED '+inc.syncedAt;
      badge.style.color = '#00e5a0';
    }
    var refEl = document.getElementById('mxRefNum_'+dis.id);
    if (refEl) refEl.textContent = mxRef;
  }, 800);

  return inc;
}

// ── RENDER MAXIMO PANEL ────────────────────────────────────────────────────
function renderMaximoPanel(disId) {
  if (window.closeAllRightPanels) window.closeAllRightPanels('mx');
  document.body.classList.add('rp-open');
  var dis = window.disruptions ? window.disruptions.find(function(d){return d.id===disId;}) : null;
  var inc = mxIncidents[disId] || (dis ? createMxIncident(dis) : null);
  if (!inc) return;

  var pp   = inc.prePopulated;
  var syncCol = inc.status === 'SYNCED' ? '#00e5a0' : '#f59623';
  var syncLbl = inc.status === 'SYNCED'
    ? '● SYNCED ' + (inc.syncedAt||'')
    : '◌ PENDING SYNC…';

  // Route labels with colour
  var routeLabels = pp.routes.map(function(r){
    var c = (window.R && window.R[r]) ? window.R[r].c : '#888';
    return '<span style="color:'+c+'">Rt '+r+'</span>';
  }).join(' / ');

  var h = '';

  // ── Maximo reference header
  h += '<div class="mx-ref-row">';
  h += '<span class="mx-ref-id" id="mxRefNum_'+disId+'">'+esc(inc.mxRef)+'</span>';
  h += '<span class="mx-sync-badge" id="mxSyncBadge_'+disId+'" style="color:'+syncCol+'">'+esc(syncLbl)+'</span>';
  h += '</div>';
  h += '<div class="mx-tmpl-row"><span class="mx-tmpl-code">'+esc(inc.template.code)+'</span><span class="mx-tmpl-desc">'+esc(inc.template.desc)+'</span>';
  h += ' <span class="mx-priority mx-pri-'+inc.template.priority+'">P'+inc.template.priority+'</span></div>';

  // ── Pre-populated section
  h += '<div class="mx-section-title">&#10003; Pre-populated from OpsView</div>';
  h += '<div class="mx-field-grid">';

  if (inc.fromTram) {
    h += mxField('Tram #',  inc.fromTram.id);
    h += mxField('Run #',   inc.fromTram.run);
  }
  h += mxField('Incident Type', pp.type);
  h += mxFieldRaw('Routes', routeLabels);
  h += mxField('Direction',   pp.direction);
  h += mxField('Start Time',  pp.startTime);
  h += mxField('Location',    pp.location);
  if (pp.southXO) h += mxField('South Crossover', pp.southXO);
  if (pp.northXO) h += mxField('North Crossover', pp.northXO);
  if (pp.narrative) h += mxField('Narrative', pp.narrative);

  h += '</div>';

  // ── Still to complete section
  h += '<div class="mx-section-title mx-section-pending">&#9201; Still to complete in Maximo</div>';
  h += '<div class="mx-pending-list">';
  inc.pendingFields.forEach(function(f){
    h += '<div class="mx-pending-item"><span class="mx-pending-cb">&#9633;</span>'+esc(MX_PENDING_LABELS[f]||f)+'</div>';
  });
  h += '</div>';

  // ── Attribution link
  var attrR = window._attrResults ? window._attrResults[disId] : null;
  if (attrR) {
    var nTrips = attrR.decisions ? attrR.decisions.length : 0;
    h += '<div class="mx-section-title">&#9889; Attribution Link</div>';
    h += '<div class="mx-attr-link">';
    if (nTrips === 0) {
      h += '<span style="color:var(--tx3)">No trips attributed — incident logged for record.</span>';
    } else {
      h += '<span style="color:var(--txt)">'+nTrips+' trip'+(nTrips!==1?'s':'')+' attributed to '+esc(inc.mxRef)+'</span>';
      h += ' &nbsp;<button class="mx-inline-btn" onclick="openAttrPanel('+disId+')">View Details</button>';
    }
    h += '</div>';
  }

  // ── Actions
  h += '<div class="mx-actions">';
  h += '<button class="mx-open-btn" disabled title="Maximo REST API integration pending approval — contact system admin">&#x2197; Open in Maximo  <span class="mx-api-note">(API pending)</span></button>';
  h += '<button class="mx-refresh-btn" onclick="openMaximoPanel('+disId+')">&#x21BB; Refresh</button>';
  h += '</div>';

  // ── Demo note
  h += '<div class="mx-demo-note">DEMO MODE &mdash; Maximo REST API integration pending. This panel shows exactly what data would be transmitted to Maximo on approval. Reference number and all pre-populated fields are real values from OpsView.</div>';

  document.getElementById('mxBody').innerHTML = h;
  document.getElementById('mxPanel').classList.add('open');
}

function mxField(label, value) {
  return '<div class="mx-field-row"><span class="mx-field-label">'+esc(label)+'</span><span class="mx-field-value">'+esc(String(value||'—'))+'</span></div>';
}
function mxFieldRaw(label, valueHtml) {
  return '<div class="mx-field-row"><span class="mx-field-label">'+esc(label)+'</span><span class="mx-field-value">'+valueHtml+'</span></div>';
}

// ── HOOK INTO buildDisPopup ────────────────────────────────────────────────
// Runs after app.js and attribution.js have loaded
function _initMaximo() {
  var _origBuildDisPopup = window.buildDisPopup;
  if (!_origBuildDisPopup) return;

  window.buildDisPopup = function(dis) {
    var base = _origBuildDisPopup(dis);

    // Ensure an incident record exists
    if (!mxIncidents[dis.id]) createMxIncident(dis);
    var inc = mxIncidents[dis.id];

    var syncCol = '#f59623';
    var syncLbl = 'Syncing…';
    if (inc && inc.status === 'SYNCED') {
      syncCol = '#00e5a0'; syncLbl = 'Synced';
    }

    // Mini Maximo preview to inject into popup
    var preview = '<div class="dp-mx-preview">';
    preview += '<div class="dp-mx-preview-hdr">&#x1F4CB; Maximo &nbsp;<span id="mxSyncBadge_'+dis.id+'" style="color:'+syncCol+'">'+syncLbl+'</span></div>';
    preview += '<div class="dp-mx-ref" id="mxRefNum_'+dis.id+'">'+(inc?esc(inc.mxRef):'—')+'</div>';
    preview += '<div style="font-size:9px;color:var(--tx3)">'+(inc?esc(inc.template.code+' · '+inc.template.desc):'')+'</div>';
    preview += '</div>';

    var mxBtn = '<button class="dp-mx-btn" onclick="openMaximoPanel('+dis.id+')">&#x1F4CB; View Maximo Record</button>';

    // Insert before the Clear button
    base = base.replace('<button class="dp-btn"', preview + mxBtn + '<button class="dp-btn"');
    return base;
  };
}

// ── EXPOSE PUBLIC API ──────────────────────────────────────────────────────

// Creates a standalone Maximo incident from a deviation alert (no linked disruption).
function createAlertIncident(alertData) {
  var alertKey = 'ALERT-' + alertData.id;
  if (mxIncidents[alertKey]) return mxIncidents[alertKey];

  var mxRef = buildMxRef();
  var inc = {
    mxRef:     mxRef,
    disId:     alertKey,
    template:  { code: 'EXT-DEV', desc: 'Tram Deviation Alert', priority: 3 },
    status:    'PENDING',
    createdAt: nowTs(),
    syncedAt:  null,
    prePopulated: {
      type:        'Unspecified deviation',
      routes:      [alertData.tramRoute],
      primaryRoute: alertData.tramRoute,
      direction:   null,
      startTime:   alertData.ts ? alertData.ts.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',hour12:false}) : nowTs(),
      location:    'Tram ' + alertData.tramId + ' between ' + (alertData.fromCode || '?') + ' and ' + alertData.toCode,
      narrative:   'Deviation jumped ' + Math.round(alertData.jumpSecs / 60) + ' minutes between ' +
                   (alertData.fromCode || '?') + ' and ' + alertData.toCode +
                   '. Flagged by automatic deviation alert system.'
    },
    fromTram:      { id: alertData.tramId, run: alertData.tramRun, route: alertData.tramRoute },
    pendingFields: ['causeCode', 'driverDetails', 'delayStartTime', 'delayEndTime'],
    overrides:     []
  };

  mxIncidents[alertKey] = inc;
  setTimeout(function(){ inc.status = 'SYNCED'; inc.syncedAt = nowTs(); }, 800);

  // Open the Maximo panel to show the newly created incident
  renderMaximoPanel(alertKey);

  return inc;
}

window.SimMaximo = {
  createIncident:      createMxIncident,
  createAlertIncident: createAlertIncident,
  getIncident:         function(disId){ return mxIncidents[disId]||null; },
  incidents:           mxIncidents,
  templates:           MX_TEMPLATES
};

window.openMaximoPanel = function(disId) {
  var dis = window.disruptions ? window.disruptions.find(function(d){return d.id===disId;}) : null;
  if (!mxIncidents[disId] && dis) createMxIncident(dis);
  renderMaximoPanel(disId);
};

window.closeMaximoPanel = function() {
  document.getElementById('mxPanel').classList.remove('open');
  document.body.classList.remove('rp-open');
};

// Defer hook until app.js buildDisPopup is ready
if (window._opsviewReady) {
  _initMaximo();
} else {
  document.addEventListener('opsview-ready', _initMaximo);
}

})();
