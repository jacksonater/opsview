# Incident Attribution Engine — Feature Specification

**Project:** OpsView — Melbourne Tram Network Operations Dashboard
**Status:** In Development (Demo Build)
**Last Updated:** 2026-03-19

---

## 1. Overview

The Incident Attribution Engine automatically assigns degraded tram trips to the disruption event that caused them. Controllers log an incident from OpsView (either by clicking a location on the map or by clicking a specific tram), and the engine determines which trips across the entire disruption window should be attributed to that event.

Attribution results feed into Maximo (work order and incident management system) for performance reporting, delay accountability, and service reliability analytics.

---

## 2. Incident Creation

### 2.1 Entry Points

Two entry points exist for creating an incident record in OpsView:

| Entry Point | Trigger | Pre-filled Data |
|---|---|---|
| **Map click** | Controller clicks a point on the route network | Location (snapped to route), affected routes, nearby trams, timestamp |
| **Tram click** | Controller selects a tram → clicks "Log Disruption from this Tram" | Tram #, Run #, Route, Direction, current location, timestamp |

Both entry points open the same **Incident Creation Modal** with different fields pre-populated.

### 2.2 Incident Creation Modal

**Always pre-filled from OpsView:**
- Incident start time (wall clock at moment of creation)
- Affected route(s) (auto-detected within 60m of click point)
- Location description (crossover boundaries if available, else lat/lng)
- Nearest crossovers (North and South — from GIS register)
- Incident type (defaulted, controller can override)

**Pre-filled when from tram click:**
- Tram number
- Run number
- Route
- Direction of travel

**Controller enters:**
- Incident type (dropdown — maps to Maximo incident template)
- Narrative (free text, syncs directly to Maximo log)
- Direction affected (Both / Up only / Down only)

### 2.3 Incident Templates (Maximo Mapping)

| OpsView Type | Maximo Code | Description | Priority |
|---|---|---|---|
| Vehicle breakdown | TVM-BKDN | Tram Vehicle Mechanical Breakdown | 2 |
| Collision | TVM-COLL | Tram-to-Vehicle Collision | 1 |
| Infrastructure failure | INF-FAIL | Infrastructure / Wayside Failure | 2 |
| Police/emergency | EXT-EMRG | External Emergency Services Response | 1 |
| Obstruction on track | TRK-OBS | Track Obstruction | 2 |
| Overhead wire down | OHW-DOWN | Overhead Wire / OHW Fault | 1 |
| Points failure | PTS-FAIL | Points / Switch Failure | 2 |
| Signal priority fault | SIG-FAULT | TSP / Signal Priority System Fault | 3 |
| Passenger incident | PAX-INC | Passenger Incident / Medical | 2 |
| Other | OTH-GEN | General Incident | 3 |

---

## 3. Maximo Integration

### 3.1 Architecture (Target State)

**Flow: OpsView → Maximo (Option C)**

```
Controller logs incident in OpsView
         ↓
OpsView calls Maximo REST API to create incident skeleton
         ↓
Maximo creates WO record, returns reference number
         ↓
OpsView displays Maximo ref, starts Attribution Engine
         ↓
Attribution results linked to Maximo WO record
```

### 3.2 Data OpsView Pre-populates into Maximo

| Maximo Field | Source |
|---|---|
| Incident type / template | OpsView type dropdown |
| Start date/time | Disruption creation timestamp |
| Affected route(s) | Auto-detected from click position |
| Location description | Crossover boundaries or coordinates |
| Tram number | From tram click (if tram-based entry) |
| Run number | From tram click (if tram-based entry) |
| Direction | From form |
| Narrative | Free text field in OpsView modal |

### 3.3 What Controllers Still Complete in Maximo

- Delay start and end times (on clearance)
- Work order generation
- Driver name and employee ID
- Cause code / responsible party
- Any additional operational narrative

### 3.4 Demo Mode

Maximo API access is pending. The demo build simulates the full integration:
- Fake Maximo reference numbers are generated (`WO-YYYY-MM-DD-XXXX`)
- A simulated 800ms "sync delay" mimics real network latency
- The Maximo panel shows exactly what data would be transmitted
- An "Open in Maximo" button is present but disabled with tooltip indicating API is pending

---

## 4. Attribution Engine

### 4.1 Trigger

Attribution runs automatically when:
- A disruption is created in OpsView (immediately on confirmation)
- The disruption is cleared (final report generated)
- A controller manually re-runs attribution from the disruption popup

### 4.2 Eligibility Window

**No time cap.** Attribution captures all trips affected for the full duration of the disruption, which may span multiple days for extended incidents.

**Trips are eligible if they show:**
- A delay at or near the disruption location, where the delay pattern is sudden (not gradual drift)
- A missed signpost at the disruption location
- A short-working terminating near the disruption
- A cancellation on a run adjacent to an already-attributed trip

**Trips are NOT attributed if:**
- The delay pattern is gradual (consistent drift suggesting traffic/loading congestion unrelated to the disruption)
- The trip completed normally through the disruption zone (signpost data shows no degradation)

### 4.3 Attribution Rules

Rules run in order: **A → B → 1/2 → C → B → 1/2**

| Rule | Name | Logic |
|---|---|---|
| **A** | First Affected Trip | First trip with delay, missed signpost, short-working, or cancellation at the disruption stop |
| **B** | Same-Run Propagation | Subsequent trips on the same run where the previous trip ended late and the next trip started late, with no deviation jump outside the window |
| **C** | Cross-Run Propagation | Trips on different runs that show a significant deviation jump at the disruption stop, or missed signpost |
| **1** | Linked Short Workings | Short trips on the same run, adjacent in sequence (±1) to an already-attributed trip |
| **2** | Linked Cancellations | Cancelled trips on the same run, adjacent in sequence (±1) to an already-attributed trip |

### 4.4 Signpost-Based Lateness Detection

The engine uses signpost data to distinguish disruption-caused delay from normal operational lateness:

| Pattern | Interpretation | Attribution |
|---|---|---|
| Gradual increasing delay across multiple signposts | Traffic congestion, loading, normal operational variance | Not attributed |
| Sudden large deviation at or after disruption location | Disruption impact | Attributed |
| Missed signpost at disruption location | Tram could not reach that stop | Attributed |
| Tram arrived significantly later than expected at signpost near disruption | Disruption impact | Attributed |

### 4.5 Multi-Disruption Tie-Breaking

A trip can only be attributed to **one** incident.

If a trip falls within the affected window of two simultaneous disruptions, it is attributed to the **longer-duration** disruption.

Significance tiebreak order:
1. Longest active duration at the time of assessment
2. Disruption with more confirmed attributed trips (fallback)

### 4.6 Zero-Trip Incidents

An incident record is valid with zero attributed trips. This occurs when:
- The disruption was brief and cleared before any tram reached the location
- The route frequency is low and no scheduled service was due
- All trips passed through without measurable degradation

Zero-trip incidents are retained in the log and Maximo record for operational completeness.

### 4.7 Confidence Scoring

Each attributed trip receives a composite confidence score (0–100%):

| Factor | Weight | Description |
|---|---|---|
| Spatial match | 25% | Presence and magnitude of deviation at the disruption stop |
| Temporal proximity | 20% | How close the trip's disruption-stop time is to incident start |
| Deviation magnitude | 20% | Size of delay relative to the 30-minute maximum threshold |
| No jump outside window | 15% | Absence of further large deviation after the disruption zone |
| Run continuity | 10% | Whether the preceding trip on the same run was also attributed |
| Uniqueness baseline | 10% | Static baseline (always 1.0) |

**Decision thresholds:**
- ≥ 80%: `PRE_ACCEPTED` — auto-accepted, no review required
- 55–79%: `REVIEW` — flagged for manual controller review
- < 55%: `LOW_CONFIDENCE` — low confidence, shown for completeness

Chain confidence is the minimum score across all attributed trips (weakest link).

---

## 5. Human Override

### 5.1 Override Permissions

All users with CRUD access to OpsView may override attribution decisions.

No reason is required to override, but all overrides are recorded in the audit trail with:
- Controller identity (future: linked to login session)
- Timestamp
- Action (added / removed)
- Affected trip ID

### 5.2 Override Actions

| Action | Description |
|---|---|
| **Remove trip** | Exclude an engine-attributed trip from the incident record |
| **Add trip** | Manually add a trip the engine did not attribute |

Overrides persist for the lifetime of the disruption record. The engine's original decision is retained in the audit trail alongside the override.

---

## 6. Attribution Panel UI

The Attribution Panel is a slide-in panel (420px) that shows:

- Disruption context (ID, routes, type)
- Summary KPIs (Pre-Accepted / Review / Low Confidence counts)
- Chain confidence bar
- Per-rule trip lists (A, B, C, 1, 2) with expandable detail rows
- Confidence breakdown per trip (6-factor weighted scorecard)
- Override controls (add/remove per trip)
- Tunable parameters (θ_jump, θ_accept, θ_review) with live re-run
- Audit trail summary
- Maximo reference number (linked)

---

## 7. Maximo Panel UI

The Maximo Panel is a slide-in panel (400px) that shows:

- Maximo work order reference number
- Sync status (PENDING / SYNCED) with timestamp
- Incident template code and description
- Pre-populated fields (read-only view of what was sent)
- Pending fields checklist (what controller still needs to complete in Maximo)
- Attribution link (trip count, link to Attribution Panel)
- "Open in Maximo" button (active when API integration is live)

---

## 8. Export / Audit

Attribution results can be exported as CSV with the following columns:

| Column | Description |
|---|---|
| Trip ID | Internal trip identifier |
| Run | Run number |
| Route | Route number |
| Direction | Up / Down |
| Scheduled Start | HH:MM |
| Scheduled End | HH:MM |
| Disruption ID | OpsView disruption ID |
| Maximo Ref | Linked Maximo work order reference |
| Rule Applied | A / B / C / 1 / 2 / MANUAL |
| Attribution Status | PRE_ACCEPTED / REVIEW / LOW_CONFIDENCE / OVERRIDE_ADDED / OVERRIDE_REMOVED |
| Confidence Score | 0–100% |

---

## 9. Open Questions / Future Work

| Item | Status |
|---|---|
| Maximo REST API access | Pending approval — demo mode in use |
| PTV GTFS-RT live feed with signpost data | Integration designed, API key required |
| Delay start/end time auto-detection from signpost feed | Spec complete, implementation pending live data |
| Multi-day disruption spanning midnight | Designed for, not yet tested |
| Login/identity for audit trail attribution | Future sprint |
| CSV export implementation | Future sprint |

---

*This specification was developed through structured requirements sessions in March 2026.*
