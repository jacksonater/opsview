# OpsView — Melbourne Tram Network Operations Console

A real-time browser-based operations dashboard for the Melbourne tram network. Displays all 24 routes with live GTFS-RT vehicle positions, timetable-driven simulation, disruption modelling, and trip attribution.

---

## Quick Start

### Prerequisites

- Node.js 18+
- A PTV Open Data API key — register at <https://opendata.transport.vic.gov.au/>
- A Vercel account (free tier works)

### Local Development

```bash
# 1. Clone the repo
git clone <repo-url>
cd opsview

# 2. Install dependencies
npm install

# 3. Set your PTV API key
cp env.example .env
# Edit .env and add: PTV_API_KEY=your-key-here

# 4. Serve locally (Vercel CLI recommended so API proxies work)
npx vercel dev

# 5. Open http://localhost:3000
```

> **Without the PTV API key** the app still works in **Mock mode** (simulated trams) and **Timetable Simulator** mode. Only **Live API** mode requires the key.

---

## Architecture

```
opsview/
├── api/                         # Vercel serverless functions (Node.js)
│   ├── tram-positions.js        # Fetches + decodes GTFS-RT vehicle positions
│   └── tram-trip-updates.js     # Fetches + decodes GTFS-RT trip updates
├── css/
│   └── opsview.css              # Dark-theme UI
├── data/                        # Static datasets (committed to repo)
│   ├── timetable.json           # ~5.5 MB — 6,100+ scheduled trips (see Refresh below)
│   ├── signposts.json           # Stop locations with pole IDs
│   ├── route_structures.json    # Route metadata
│   └── shared_track.json        # Shared track segments
├── js/
│   ├── config.js                # Central configuration (tunables, thresholds)
│   ├── app.js                   # Core app: map, trams, live data, disruptions
│   ├── simulator.js             # Timetable-driven tram simulator
│   ├── attribution.js           # Trip attribution engine (Rules A/B/C/1/2)
│   ├── dmp.js                   # Disruption Mitigation Planning scenarios
│   ├── gis.js                   # GIS crossovers, termini, sidings
│   └── shared_track.js          # FIFO ordering on shared-track segments
├── scripts/
│   └── refresh-timetable.js     # Downloads latest GTFS Schedule from PTV
├── tests/
│   └── pure-functions.test.js   # Unit tests for pure functions
├── index.html                   # Single-page app entry point
├── vercel.json                  # Deployment config (CORS, rewrites)
├── package.json
└── env.example                  # Environment variable template
```

### Script Load Order

Scripts must be loaded in this order (see `index.html`):

1. `js/config.js` — tunables and thresholds (no dependencies)
2. `js/gis.js` — GIS data (no dependencies)
3. `js/dmp.js` — DMP scenarios (no dependencies)
4. `js/app.js` — core app; dispatches `opsview-ready` event when done
5. `js/attribution.js` — waits for `opsview-ready`
6. `js/shared_track.js` — loaded dynamically after `shared_track.json` fetches
7. `js/simulator.js` — waits for `opsview-ready`

---

## Configuration

All tunables are in `js/config.js`. Edit there rather than in algorithm files.

```js
window.OpsViewConfig = {
  attribution: {
    theta_accept: 0.80,   // confidence threshold for auto-acceptance
    theta_review: 0.55,   // confidence threshold for manual review
    // ...full list in config.js
  },
  simulator: {
    defaultStartTime: '07:30',
    defaultSpeed: 5,
  },
  disruption: {
    snapThresholdM: 200,  // max metres from a route for a valid disruption click
  }
};
```

---

## Environment Variables

| Variable      | Description                    | Required       |
|---------------|--------------------------------|----------------|
| `PTV_API_KEY` | PTV Open Data subscription key | Live mode only |

Set in Vercel dashboard under **Settings → Environment Variables**, or in a local `.env` file for `vercel dev`.

---

## Deployment

### Vercel (recommended)

```bash
npx vercel --prod
```

The `vercel.json` config handles rewrites and CORS headers automatically.

> **CORS note:** `vercel.json` restricts API access to `https://opsview.vercel.app`.
> If you deploy to a custom domain, update the `Access-Control-Allow-Origin` header
> in `vercel.json` to match your domain.

---

## Data

### Live Data

The app fetches from two PTV GTFS-RT feeds via Vercel serverless proxies:

| Endpoint                     | Feed             | Refresh   |
|------------------------------|------------------|-----------|
| `/api/tram-positions`        | Vehicle positions | Every 60s |
| `/api/tram-trip-updates`     | Trip updates     | Every 60s |

### Timetable Refresh

`data/timetable.json` is a static snapshot of the PTV GTFS Schedule. Refresh it when PTV publishes a new release (typically weekly):

```bash
export PTV_API_KEY=your-key-here
npm run refresh-timetable
git add data/timetable.json
git commit -m "chore: refresh timetable from PTV GTFS Schedule"
git push
```

The script downloads the GTFS zip, parses `trips.txt` and `stop_times.txt`, and writes the timetable in the format expected by `simulator.js`.

---

## Development

### Running Tests

```bash
npm test
```

Tests cover pure functions (`geoDist`, `esc`, `sc`, `secsToHHMM`, `hhmmToSecs`) with no DOM or Leaflet dependency.

### Linting

```bash
npm run lint
```

Uses ESLint targeting `js/` and `api/` with rules focused on catching `no-undef`, `eqeqeq`, and unsafe patterns (`eval`, `new Function`).

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Live tracking** | Real PTV GTFS-RT vehicle positions, updated every 60s |
| **Timetable simulator** | 6,100+ scheduled trips; 1x–20x playback speed |
| **Disruption modelling** | Click-to-place disruptions; trams trapped or turned back at crossovers |
| **Trip attribution** | Deterministic A/B/C/1/2 rules with confidence scoring |
| **DMP scenarios** | Pre-built disruption response plans matched by location and route |
| **Punctuality colours** | Blue (early) / Green / Yellow / Amber / Magenta (10min+ late) |
| **GIS overlay** | 36 crossover points, terminus locations, siding data |
| **Performance panel** | Network-wide KPIs and per-route breakdown |

---

## Browser Support

Modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+). IE11 is not supported.

---

## Data Sources & Attribution

- **PTV GTFS-RT** — Transport Victoria Open Data, Creative Commons Attribution 4.0
- **PTV GTFS Schedule** — Transport Victoria Open Data, Creative Commons Attribution 4.0
- **Map tiles** — OpenStreetMap contributors, ODbL
- **Leaflet** — BSD 2-Clause
