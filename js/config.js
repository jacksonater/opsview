// ── OpsView Configuration ──────────────────────────────────────────────────
// Centralised parameters. Edit here rather than inside algorithm files.
// All values are exposed on window.OpsViewConfig so modules can read them.

(function() {
'use strict';

window.OpsViewConfig = {

  // ── Attribution Engine tunables ─────────────────────────────────────────
  // These control how confidently the attribution engine assigns trips to a
  // disruption. See js/attribution.js for algorithm details.
  attribution: {
    theta_jump:    2.0,   // deviation-jump multiplier for rule boundary detection
    theta_accept:  0.80,  // confidence threshold for auto-acceptance
    theta_review:  0.55,  // confidence threshold for manual review
    epsilon:       0.05,  // minimum significance threshold
    T_max:         120,   // max temporal proximity (minutes) for temporal scoring
    D_max:         30,    // max deviation (minutes) for deviation scoring
    w_spatial:     0.25,  // weight: spatial proximity to disruption
    w_temporal:    0.20,  // weight: temporal proximity to incident time
    w_deviation:   0.20,  // weight: deviation magnitude
    w_nojump:      0.15,  // weight: absence of downstream jump
    w_continuity:  0.10,  // weight: same-run continuity with attributed trip
    w_unique:      0.10   // weight: uniqueness (baseline)
  },

  // ── Simulator defaults ──────────────────────────────────────────────────
  simulator: {
    defaultStartTime: '07:30',  // HH:MM when play is first pressed
    defaultSpeed:     5,        // playback multiplier (1–20)
    fleetStart:       2001,     // first tram fleet number (T2001)
    fleetCount:       250       // number of fleet IDs to generate
  },

  // ── Live data polling ───────────────────────────────────────────────────
  live: {
    refreshIntervalMs: 60000    // how often to re-fetch PTV GTFS-RT (60s)
  },

  // ── Disruption snap tolerance ───────────────────────────────────────────
  disruption: {
    snapThresholdM:   200,  // max metres from route line for a valid click
    coRouteRadiusM:   60,   // radius for detecting co-routed lines at disruption point
    crossoverRadiusM: 300   // max metres from route shape to include a crossover
  },

  // ── Traffic overlay ─────────────────────────────────────────────────────
  // TomTom free tier: sign up at developer.tomtom.com (2,500 map tile req/day)
  // Leave empty string to get an in-app prompt when the button is clicked.
  tomtomKey: 'g0up9RnrmGlkKfJpSXr4hqm0AxgTgGme'

};

})();
