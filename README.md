# Portway - ICO Zeebrugge parking finder

A standalone mobile web app for looking up parking references on published ICO terminal plans. Example: `H61 line 15`.

Hosted app: https://obaida-qaba.github.io/ico-parking/

Pushes to `main` run the tests and publish `public/` through GitHub Pages. The server and source-PDF cache are not deployed.

## Run

Double-click `Start-Portway.ps1` using PowerShell, or run:

```powershell
node server.mjs
```

Open http://127.0.0.1:4173. The app runs directly from `public/`; no build or API key is required. Node.js 22 was used for verification.

## What works

- Opens on a full-screen GPS map, starts location tracking after browser permission, and keeps one search bar at the top. Selecting a parking preserves the GPS view; **View plan** opens its original drawing. Search remains available during navigation.
- Automatic search context for Toyota, Hanze, Bastenaken, North and Nissan. Nearby parking matches come first, with other terminals still available. Typed terminal names and manual area choices override automatic priority; **All terminals** removes the location preference. Bastenaken/Hanze use the current southern plan.
- Compact destination cards, collapsible area/line settings, recent searches, accessible touch controls and reduced-motion support. GPS denial leaves manual search available.
- Six map views: combined Zuidelijke Insteek, Noordelijke Insteek, Nissan, and older Bastenaken, Hanze and Toyota plans.
- Search indexed parking references, including `H61 line 15`, `parking H61 lijn 15`, `H61 / 15`, `GE 1`, and `A01`.
- A separate optional line field. Built-in parking approaches can be used directly; optional on-site points can refine a parking or an exact line.
- Parking markers at the actual source-label positions, zooming, panning, click-to-select, source links and dates.
- Recent destinations saved on the device, deep links and sharing.
- All six plan images, the app shell and the routing network are saved offline after the initial successful download. The GPS view draws the corrected road network with clear outlines, parking codes, your position and the highlighted route. It loads no external street-map tiles. Browser storage can be evicted by the device.
- Continuous high-accuracy GPS tracking, accuracy display, heading, speed and follow-position mode. Tracking can be stopped explicitly.
- Heading-up driving view: the geographic road map rotates with the travel course, with a forward-pointing blue arrow lower on the screen to show the road ahead. Stops retain the last reliable course. If the phone supplies no heading, meaningful GPS movement provides a course. Panning pauses the follow camera; the location button resumes it. **N** switches to north-up.
- Nearby mapped parking codes remain available on the geographic driving map, including during navigation and fullscreen. Compact labels keep their geographic positions. Crowded or covered labels form visible numbered groups; tap a group to see every member and zoom to its location. Labels are not silently dropped. The destination remains distinct and a blue dot marks the road arrival point. Uncalibrated PDF labels are not placed on the GPS map.
- **All parkings** opens the full current terminal drawing, including codes without geographic positions. The same button returns to the GPS map. GPS tracking continues while viewing the plan; the schematic drawing never displays an uncalibrated GPS dot.
- Road rendering uses an indexed local buffer instead of projecting the entire port on every movement. GPS markers and route layers are reused. Manual zoom stays at the selected zoom until the location button resumes following.
- Driving position moves through animation frames between measured GPS fixes. Routing and signal checks use the raw fix; display animation does not predict beyond it. Large relocations snap immediately, reduced-motion settings are respected, and manual browsing pauses the camera.
- Road searches run in a module Web Worker so navigation calculations do not block map interaction. Cancelled or older results cannot restore a previous destination. The worker and its dependencies are cached for offline routing.
- Heading changes preserve the existing map surface. A bounded SVG buffer covers every bearing and refreshes when panning reaches an edge, on zoom or resize. The schematic plan renderer is unaffected.
- Road routing to built-in or saved destinations with distance updates, basic turn prompts and rerouting from updated GPS. Routes minimize distance over the represented road graph, follow mapped one-way directions and node turn restrictions, and use travel course to distinguish nearby lanes within GPS uncertainty. They never connect disconnected roads with an invented shortcut.
- Bastenaken/Hanze searches use the current combined southern plan, including `HC1 Bastenaken`. An explicitly typed terminal takes precedence over a previous dropdown selection.
- Navigation pauses when GPS accuracy is worse than 35 metres or the last fix is older than 15 seconds.
- PWA manifest, installation support where the browser permits it, and home-screen icons.
- Clear map view: navigation keeps the top search bar and a compact next-turn/distance card. Map choices, GPS details, sources and destination refinements are available through **Maps**.
- **Full screen** opens the map using browser fullscreen where available, with a full-viewport fallback. **Exit full screen** or Escape restores the normal layout without stopping GPS or changing the route.

## Current limitations

Terminal detection is a coarse search preference, not an exact operating boundary or a new navigation destination catalogue. `public/terminals.json` records geographic footprint sources and approximate area divisions. Poor or stale fixes do not guess a terminal; uncertain boundaries hold the previous area or fall back to a broad region. Toyota/Hanze use a documented uncertainty band. Outside the port, search covers all terminals. Automatic context works offline after the initial download.

**Coverage is incomplete. Passing the application tests does not mean every parking has an accurate GPS destination.** The full per-reference audit is published in [parking-audit.csv](public/parking-audit.csv) and [parking-audit.json](public/parking-audit.json). The complete simulated browser sweep is recorded separately in [parking-browser-audit.json](public/parking-browser-audit.json). It retains missing destinations as failures, records each explicit area choice, tests every available road approach from independent terminal origins and both lane ends, and distinguishes source matching, shared-area approaches and historical estimates. No surveyed entrances or exact parking-line positions are claimed.

The full source review covers all six maps. Older Bastenaken and Hanze labels were re-read from the printed glyphs, including misread names, shifted columns and repeated labels. North's rotated A/Q fragments and Nissan's repeated V references are now indexed; Toyota also includes the printed Y, W, X, P, R and Z references previously omitted. A source label alone never becomes a GPS coordinate. Historical plans are counted separately and may reuse a name whose layout has changed.

The wider geographic review added fourteen individually matched E approaches, corrected the twelve BK quay-band labels, moved H65's display reference inside its supported shared compound, and separated actual PDF glyph positions from local fitting controls. North P/Q2 use the reviewed quay-side aisle, replacing two old road alignments through stored cars. Nissan's automatic context uses the western ICO4070 compound instead of the eastern BNFW4130 plot. Eleven Nissan references also have reviewed internal-road approaches, including three explicit V-bank choices. Their button says **Route inside Nissan**. No public entrance connection is invented, VB/VF/VG remain unlocated, and the VH002 departure spur has an unconfirmed onward connection. The full audit keeps those connection failures visible. Eight unsupported historical Toyota automatic targets were removed after their projected labels failed the physical parcel/fence check; they remain searchable on the source plan.

IOS/JOS/KOS/LOS each use their own northern parking-bank cell. POS offers **Near GE2** and **Near EE1 / DE1**; these descriptions identify two physical compounds rather than invented official subcodes. Each plan retains its own repeated-label order for source highlighting. Shared links, recents and saved refinements preserve the chosen compound.

The route graph and aerial checks establish supported physical approaches, not current gate opening, live traffic orders or an on-site accuracy guarantee. Several revised D, AH/BH/CH, development-area and historical references cannot be individually associated with current parcels from the available evidence. Those gaps stay explicit in the catalogue and audit. No terminal-centre, nearest-public-road or shared-gate substitution is emitted under an unconfirmed parking code.

Unconfirmed FX public-road targets were excluded because proximity across a fence does not establish parking access. Nissan needs its missing internal roads and gate connection confirmed. The CH schematic and remaining central blocks still need individual geographic associations. A tempting upper road grid was confirmed through official port GIS to belong to WWL rather than ICO; it was not used for CH. `scripts/build_upper_destinations.py` retains the research and candidate estimates but is intentionally excluded from the published merge.

A line reference routes to the parking or shared-area approach unless a separate exact line point exists. References without a built-in GPS point show **View parking**, opening their highlighted source plan without a recording dialog or fabricated road route. Optional GPS/map refinements remain under Maps. Saving requires a fresh fix with accuracy of 25 metres or better. Saved points stay on this device and take precedence over built-in approaches; shared links identify the parking/line but do not transfer private GPS refinements.

Routing covers the downloaded Zeebrugge road network, including internal roads present in OSM. Missing roads, temporary closures, access changes and way-based turn restrictions are not provided as live operational data. The router assumes authorized access to mapped private terminal roads. Explicitly locked/no-access nodes and motor-vehicle prohibitions are excluded. It refuses to route if either endpoint is more than 50 metres from a mapped drivable road. The drawn route ends on the road; any gap to the saved point is reported rather than drawn across a parking block.

The C1 access corridor beside HC1 follows the paired two-way arrows in ICO's V1.09-2026 plan, correcting the OSM one-way tag for way 746582135. `scripts/terminal-road-rules.json` records the source and expected node chain; rebuilding fails for review if that geometry changes. The original OSM direction and correction provenance remain in `roads.json`. This is a documented source correction, not live closure or traffic information.

Three nonexistent perpendicular links through the paired HC/GC C-row blocks are excluded from routing after an on-site report supported by the ICO plan. The valid straight aisles and unrelated road segments remain connected. Correction provenance and expected node chains remain stored with the road data. Roads are drawn from the same corrected graph used for routing; this does not establish that every connection has been checked on site.

PDF parking markers identify source drawing labels, not verified entrances. Some labels appear at multiple positions. Live GPS is shown on the geographic road map, which also shows saved destination points. The schematic PDF drawings remain separate and are not presented as GPS-aligned.

The older PDF pages are raster images. Only clearly readable labels have been manually indexed; unindexed labels remain visible in the plans. Their arrangements and numbering may be outdated. None of these plans has been confirmed against the current operating layout by ICO.

This is an independent application, not an official ICO service.

## Sources

- https://www.icoterminals.com/upload/ico_safety_regulations.pdf - January 2026 document. Pages 4, 5 and 6 contain southern, northern and Nissan plans. Southern plan date: 8 September 2025; Nissan: 2 February 2024. The northern plan has no printed revision date.
- https://www.icoterminals.com/sites/default/files/SIT%20terminalplan%20SIT%2021%2009%202026.pdf - current southern plan used in the app, footer V1.09-2026. Replaces the older September 2025 southern drawing above. Found through the live ICO southern terminal page.
- https://cewez.be/wp-content/uploads/2025/04/Onthaalbrochure-ICO.pdf - historical Bastenaken, Hanze and Toyota plans on pages 23, 24 and 25. These are older layouts; upload date is not a map revision date.
- https://www.icoterminals.com/nl/terminals/zuidelijke-insteek-terminal - terminal centre coordinate.
- https://www.icoterminals.com/nl/terminals/noordelijke-insteek-terminal - terminal centre coordinate.
- Leaflet 1.9.4, BSD 2-Clause license in `public/vendor/leaflet-LICENSE.txt`.
- Rotation: `@tomickigrzegorz/leaflet-rotate` 0.3.0, MIT license in `public/vendor/leaflet-rotate-LICENSE.txt`, bundled locally for offline use. The source terminal drawings remain unrotated; heading-up applies to the geographic driving map.
- Routing geometry: OpenStreetMap contributors, attribution displayed in the GPS view. Corrected road vectors are drawn locally without default background tiles.
- Offline road network: OpenStreetMap contributors, ODbL 1.0, retrieved 18 November 2026 through the OSM map API. `public/roads.json` contains 2,087 motorable ways and 70 node turn restrictions. Source bboxes are recorded in `scripts/build_roads.py`; contributor/account metadata is stripped from the distributed data.

## Rebuild the map catalogue

Python dependencies: `requests`, `pymupdf`, `Pillow`, `numpy`.

```powershell
python scripts/build_maps.py
python scripts/build_destinations.py
```

The destination builder runs the checked regional builders and retains a generated coverage audit. Source inventories are reviewed separately from GPS association; additional source references are not automatically projected onto roads. `scripts/toyota-source-points.json` contains corrected brochure row positions and seven previously missing parking references. North L/P/W warehouse-text fragments are excluded from the source index.

Source PDFs are cached under `scripts/sources/`. Current plans are rendered directly from PDF coordinates. Legacy coordinates are manually read from the source drawings, with provenance stored per marker. Review and verify coordinates before treating any as operational navigation data.

Refresh the bundled Leaflet distribution after `npm ci` if changing its version. Only local vendored JS/CSS are loaded at runtime.

## Verify

```powershell
npm ci
npm test
npx playwright install chromium
# With the app running:
npm run test:browser
```

The BB/coverage browser regression checks fresh-device road routes on five supported plan views, then repeats BB offline. The route-free Nissan view remains explicitly unsupported.

The suites check desktop/mobile search, line references, deep links, missing parking, invalid input, every map, denied/granted GPS, live movement, accurate GPS capture, road routing, one-way and turn restrictions, low-accuracy pause, stopping tracking, offline road routing and no uncaught browser errors. GPS browser tests use simulated positions on actual downloaded road geometry; they do not establish on-site accuracy. Screenshots are written to `test-results/` and are not published.

Automatic-destination checks include HC1/Bastenaken filtering, terminal names typed into search, fresh devices with no saved pins, automatic HC1/H61 routes without the recording dialog, and every built-in target lying on a motorable road. Rebuild matched approaches with `python scripts/build_destinations.py` after the map/road build; this uses `numpy`.

Routing regressions cover direct HC1 access from the corrected direction, unnecessary loops at source/target junctions, course-aware parallel-lane selection, restricted initial turns and U-turns. Guidance checks cover reversals, immediate turns, duplicate points and dense geometry. Browser checks include the short HC1 access route from simulated GPS.

Map UI checks cover native desktop fullscreen, rejected-fullscreen mobile fallback, portrait/landscape map size, accessible map options, visible source dialogs, explicit/Escape exits and preservation of the current GPS watch and route geometry.

Heading checks simulate 90°, 180° and 270° travel and verify both projected coordinates and the actual rendered road/route SVGs point upward. They also check arrow orientation, lower-centred position, north-up/recenter, manual-pan suspension, fullscreen and unchanged GPS tracking. Unit checks cover missing headings, stationary drift, unreliable accuracy, out-of-order fixes and movement-based course estimation. These simulations do not establish a particular phone’s on-site GPS/heading accuracy.

Nearby-label browser checks verify other parking codes beside an active HC1 route, upright text and non-overlapping labels after rotation, no duplicate destination label, and preservation across live GPS updates, fullscreen and offline reloads.

The VPC overview regression verifies that all eight known in-view parking positions are represented individually or in an accessible group, including points near the GPS marker. Performance checks verify local road geometry, stable road buffers through small movements, stable GPS-marker identity, and manual zoom preservation. A simulated mobile Chromium run at 4x CPU throttling reduced the VPC road model from 19,578 vertices to 1,473 and pan/rotation work from roughly 90 ms to roughly 9 ms. These measurements are a comparison on the test machine, not a frame-rate guarantee for every phone.

Active-navigation profiling additionally uses 1 Hz GPS fixes on a 6 km route at device pixel ratio 3 and 4x CPU throttling. It exposed periodic synchronous road searches and heading-triggered full view resets, which the earlier idle-map benchmark missed. Worker tests compare complete routes, distances, headings and turn restrictions with the original algorithm; motion tests check intermediate measured positions, cancellation and reduced-motion behavior. Renderer tests check geographic alignment and all viewport corners through rotation, zoom and resize. The optimization module depends on the bundled Leaflet/rotation internals and must be reverified when those libraries change.

Parking-position regressions check that C-row labels lie between their own bounding aisles. HC2 browser checks verify both normal and highlighted code positions at 0°, 90° and 270° map bearings, independently of the road endpoint. Display positions are source-matched estimates; LC1 uses the midpoint of paired aisle endpoints at the row edge. These labels do not change routing destinations or locate exact lines.

Road-correction regressions verify that the reported HC3 crossing has no lateral graph edges while straight travel remains available. Browser checks verify visibly painted surrounding roads, absence of the excluded crossing, road/route stacking and no external tile requests. Parking codes, GPS and the blue route stay visible during rotation and offline reloads.

Home-screen checks simulate all five terminal locations, Toyota-first results with other-terminal fallback, manual overrides, switching back to automatic selection, nonblocking GPS denial, continuous tracking through plan previews, and offline context detection. Region tests cover unrelated industrial sites, water/outside-port points, stale/poor fixes and boundary jitter. These are simulations, not on-site device validation.

CD1 browser checks start on its actual shared access lane, verify the short direct route without saved pins or a recording prompt, preserve line references and roads, then repeat offline. A deliberately incomplete test catalogue verifies the highlighted source plan opens directly while GPS continues; an existing HC1 route still starts normally afterward.

## Phone access and hosting

The hosted HTTPS app works on phones. The optional local development server is local to this computer by default. For same-network development browsing, run with `$env:HOST='0.0.0.0'` and open this computer's LAN IP on the phone; the Windows firewall must permit that connection. Plain LAN HTTP does not enable GPS or PWA offline storage on most browsers.

Full parking coverage remains unfinished; obtain the missing geographic parking/access associations and confirm the road network against current terminal operations. Exact line navigation additionally needs separately positioned line points. On-site device/GPS validation has not yet been performed. Rebuild the offline road network with `python scripts/build_roads.py`; its Python dependency is `requests`.

## Exhaustive parking audit

```powershell
npm run audit:all
npm run audit:browser
```

Both commands report incomplete coverage with a nonzero exit status. `--report-only` permits collecting a partial report without representing it as complete. The browser audit opens **every** source reference/compound choice, checks routing or the explicitly reported source-only fallback, and records failures instead of stopping at the first one. Local and deployed runs have separate reports and verify served input fingerprints before and after the complete run:

```powershell
node scripts/audit_all.mjs --report-only --publish-report
node tests/all-parkings-browser.mjs --report-only
$env:PORTWAY_BASE_URL='https://obaida-qaba.github.io/ico-parking'
node tests/all-parkings-browser.mjs --report-only
```

A successful browser UI check for a source-only fallback does not count as a working parking route. `completeRun` means every reference was exercised, while `complete` in the geographic audit remains false when route coverage or independent destination accuracy is unestablished.
