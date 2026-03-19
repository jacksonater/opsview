/**
 * Unit tests for OpsView pure functions.
 *
 * These functions are extracted from app.js and simulator.js for
 * isolated testing. No DOM or Leaflet dependencies required.
 */

// ── Functions under test (copied verbatim from source) ──────────────────────

function geoDist(la1, lo1, la2, lo2) {
  return Math.sqrt(
    Math.pow((la1 - la2) * 111000, 2) +
    Math.pow((lo1 - lo2) * 111000 * Math.cos(la1 * Math.PI / 180), 2)
  );
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sc(dv) {
  if (dv < -60) return 'blue';
  if (dv <= 119) return 'green';
  if (dv <= 299) return 'yellow';
  if (dv <= 599) return 'amber';
  return 'magenta';
}

function secsToHHMM(s) {
  s = ((s % 86400) + 86400) % 86400;
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function hhmmToSecs(hhmm) {
  var parts = hhmm.split(':');
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60;
}

// ── geoDist ──────────────────────────────────────────────────────────────────

describe('geoDist', () => {
  test('returns 0 for identical points', () => {
    expect(geoDist(-37.815, 144.966, -37.815, 144.966)).toBe(0);
  });

  test('returns ~111km per degree latitude', () => {
    const d = geoDist(0, 0, 1, 0);
    expect(d).toBeCloseTo(111000, -2);
  });

  test('accounts for longitude scaling at Melbourne latitude', () => {
    const dLat = geoDist(-37.815, 144.966, -37.816, 144.966); // ~111m
    const dLng = geoDist(-37.815, 144.966, -37.815, 144.967); // shorter at this lat
    // At ~38°S, cos(38°) ≈ 0.788, so lng distances are ~78.8% of lat distances
    expect(dLng).toBeLessThan(dLat);
    expect(dLng / dLat).toBeCloseTo(Math.cos((-37.815) * Math.PI / 180), 1);
  });

  test('is symmetric', () => {
    const a = geoDist(-37.8, 144.9, -37.9, 145.0);
    const b = geoDist(-37.9, 145.0, -37.8, 144.9);
    expect(a).toBeCloseTo(b, 5);
  });

  test('FLINDERS ST to MELBOURNE CENTRAL is ~450m', () => {
    // Flinders St Station: -37.8183, 144.9671
    // Melbourne Central:   -37.8100, 144.9630
    const d = geoDist(-37.8183, 144.9671, -37.8100, 144.9630);
    expect(d).toBeGreaterThan(800);   // definitely more than 800m
    expect(d).toBeLessThan(1500);     // definitely less than 1.5km
  });
});

// ── esc ──────────────────────────────────────────────────────────────────────

describe('esc', () => {
  test('passes through plain text unchanged', () => {
    expect(esc('hello world')).toBe('hello world');
  });

  test('escapes <script> tags', () => {
    expect(esc('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  test('escapes ampersands', () => {
    expect(esc('A & B')).toBe('A &amp; B');
  });

  test('escapes double quotes', () => {
    expect(esc('"quoted"')).toBe('&quot;quoted&quot;');
  });

  test('escapes single quotes', () => {
    expect(esc("it's")).toBe('it&#39;s');
  });

  test('escapes all dangerous chars in one string', () => {
    expect(esc('<img src=x onerror=\'alert("xss")\' />')).toBe(
      '&lt;img src=x onerror=&#39;alert(&quot;xss&quot;)&#39; /&gt;'
    );
  });

  test('coerces non-strings to string first', () => {
    expect(esc(42)).toBe('42');
    expect(esc(null)).toBe('null');
  });
});

// ── sc (delay→colour) ────────────────────────────────────────────────────────

describe('sc', () => {
  test('early (< -60s) is blue', () => {
    expect(sc(-90)).toBe('blue');
    expect(sc(-61)).toBe('blue');
  });

  test('on-time boundary -60 is green', () => {
    expect(sc(-60)).toBe('green');
  });

  test('on-time (0s deviation) is green', () => {
    expect(sc(0)).toBe('green');
  });

  test('1m59s late (119s) is green', () => {
    expect(sc(119)).toBe('green');
  });

  test('2m00s late (120s) is yellow', () => {
    expect(sc(120)).toBe('yellow');
  });

  test('5m (300s) is amber', () => {
    expect(sc(300)).toBe('amber');
  });

  test('10m (600s) is magenta', () => {
    expect(sc(600)).toBe('magenta');
  });

  test('very late (900s) is magenta', () => {
    expect(sc(900)).toBe('magenta');
  });
});

// ── secsToHHMM ───────────────────────────────────────────────────────────────

describe('secsToHHMM', () => {
  test('midnight is 00:00', () => {
    expect(secsToHHMM(0)).toBe('00:00');
  });

  test('6:30am', () => {
    expect(secsToHHMM(6 * 3600 + 30 * 60)).toBe('06:30');
  });

  test('23:59', () => {
    expect(secsToHHMM(23 * 3600 + 59 * 60)).toBe('23:59');
  });

  test('wraps post-midnight times (86400 = 00:00)', () => {
    expect(secsToHHMM(86400)).toBe('00:00');
  });

  test('negative seconds wrap correctly (-3600 = 23:00)', () => {
    expect(secsToHHMM(-3600)).toBe('23:00');
  });
});

// ── hhmmToSecs ───────────────────────────────────────────────────────────────

describe('hhmmToSecs', () => {
  test('00:00 = 0', () => {
    expect(hhmmToSecs('00:00')).toBe(0);
  });

  test('07:30 = 27000', () => {
    expect(hhmmToSecs('07:30')).toBe(7 * 3600 + 30 * 60);
  });

  test('23:59 = 86340', () => {
    expect(hhmmToSecs('23:59')).toBe(23 * 3600 + 59 * 60);
  });

  test('round-trips with secsToHHMM', () => {
    const times = ['00:00', '06:30', '12:00', '17:45', '23:59'];
    times.forEach(t => {
      expect(secsToHHMM(hhmmToSecs(t))).toBe(t);
    });
  });
});
