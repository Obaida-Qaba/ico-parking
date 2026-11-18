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

- Six map views: combined Zuidelijke Insteek, Noordelijke Insteek, Nissan, and older Bastenaken, Hanze and Toyota plans.
- Search indexed parking references, including `H61 line 15`, `parking H61 lijn 15`, `H61 / 15`, `GE 1`, and `A01`.
- A separate optional line field. Built-in parking approaches can be used directly; optional on-site points can refine a parking or an exact line.
- Parking markers at the actual source-label positions, zooming, panning, click-to-select, source links and dates.
- Recent destinations saved on the device, deep links and sharing.
- All six plan images, the app shell and the road network are saved offline after the initial successful download. External background street-map tiles require internet; road geometry and routing work offline. Browser storage can be evicted by the device.
- Continuous high-accuracy GPS tracking, accuracy display, heading, speed and follow-position mode. Tracking can be stopped explicitly.
- Heading-up driving view: the geographic road map rotates with the travel course, with a forward-pointing blue arrow lower on the screen to show the road ahead. Stops retain the last reliable course. If the phone supplies no heading, meaningful GPS movement provides a course. Panning pauses the follow camera; the location button resumes it. **N** switches to north-up.
- Road routing to built-in or saved destinations with distance updates, basic turn prompts and rerouting from updated GPS. Routes minimize distance over the represented road graph, follow mapped one-way directions and node turn restrictions, and use travel course to distinguish nearby lanes within GPS uncertainty. They never connect disconnected roads with an invented shortcut.
- Bastenaken/Hanze searches use the current combined southern plan, including `HC1 Bastenaken`. An explicitly typed terminal takes precedence over a previous dropdown selection.
- Navigation pauses when GPS accuracy is worse than 35 metres or the last fix is older than 15 seconds.
- PWA manifest, installation support where the browser permits it, and home-screen icons.
- Clear map view: navigation hides the app header/search panel and shows only the next turn, distance and a small destination label. Map choices, GPS details, sources and destination refinements are available through **Maps**.
- **Full screen** opens the map using browser fullscreen where available, with a full-viewport fallback. **Exit full screen** or Escape restores the normal layout without stopping GPS or changing the route.

## Current limitations

**Automatic parking routing is available for 15 matched approaches:** GC1–GC3, HC1–HC3, IC1–IC2, JC1–JC2, KC1–KC2, LC1–LC2, and H61. Search HC1 under Bastenaken and press **Start GPS route**; no recording step is required. H61 also starts directly, including when a line reference is entered.

These approaches are matched from the September 2026 ICO plan to actual geographic road geometry, using separate local building/dock landmarks for the Bastenaken and Hanze regions. They are not surveyed entrances or exact line coordinates. The builder records its control points and matched road segments in `public/destinations.json`. A small source-to-road projection residual does not establish on-site GPS accuracy. The poor global quay-label transform is not used, and the matched regions are not extrapolated to all terminals.

A line reference routes to the parking approach unless a separate exact line point exists. For a reference outside the built-in catalogue, optional on-site GPS or map selection is still available. Saving requires a fresh fix with accuracy of 25 metres or better. Saved points stay on this device and take precedence over built-in approaches; shared links identify the parking/line but do not transfer private GPS refinements.

Routing covers the downloaded Zeebrugge road network, including internal roads present in OSM. Missing roads, temporary closures, access changes and way-based turn restrictions are not provided as live operational data. The router assumes authorized access to mapped private terminal roads. Explicitly locked/no-access nodes and motor-vehicle prohibitions are excluded. It refuses to route if either endpoint is more than 50 metres from a mapped drivable road. The drawn route ends on the road; any gap to the saved point is reported rather than drawn across a parking block.

The C1 access corridor beside HC1 follows the paired two-way arrows in ICO's V1.09-2026 plan, correcting the OSM one-way tag for way 746582135. `scripts/terminal-road-rules.json` records the source and expected node chain; rebuilding fails for review if that geometry changes. The original OSM direction and correction provenance remain in `roads.json`. This is a documented source correction, not live closure or traffic information.

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
- Street tiles: OpenStreetMap contributors, live attribution displayed in the app.
- Offline road network: OpenStreetMap contributors, ODbL 1.0, retrieved 18 November 2026 through the OSM map API. `public/roads.json` contains 2,087 motorable ways and 70 node turn restrictions. Source bboxes are recorded in `scripts/build_roads.py`; contributor/account metadata is stripped from the distributed data.

## Rebuild the map catalogue

Python dependencies: `requests`, `pymupdf`, `Pillow`.

```powershell
python scripts/build_maps.py
```

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

The suites check desktop/mobile search, line references, deep links, missing parking, invalid input, every map, denied/granted GPS, live movement, accurate GPS capture, road routing, one-way and turn restrictions, low-accuracy pause, stopping tracking, offline road routing and no uncaught browser errors. GPS browser tests use simulated positions on actual downloaded road geometry; they do not establish on-site accuracy. Screenshots are written to `test-results/` and are not published.

Automatic-destination checks include HC1/Bastenaken filtering, terminal names typed into search, fresh devices with no saved pins, automatic HC1/H61 routes without the recording dialog, and every built-in target lying on a motorable road. Rebuild matched approaches with `python scripts/build_destinations.py` after the map/road build; this uses `numpy`.

Routing regressions cover direct HC1 access from the corrected direction, unnecessary loops at source/target junctions, course-aware parallel-lane selection, restricted initial turns and U-turns. Guidance checks cover reversals, immediate turns, duplicate points and dense geometry. Browser checks include the short HC1 access route from simulated GPS.

Map UI checks cover native desktop fullscreen, rejected-fullscreen mobile fallback, portrait/landscape map size, accessible map options, visible source dialogs, explicit/Escape exits and preservation of the current GPS watch and route geometry.

Heading checks simulate 90°, 180° and 270° travel and verify both projected coordinates and the actual rendered road/route SVGs point upward. They also check arrow orientation, lower-centred position, north-up/recenter, manual-pan suspension, fullscreen and unchanged GPS tracking. Unit checks cover missing headings, stationary drift, unreliable accuracy, out-of-order fixes and movement-based course estimation. These simulations do not establish a particular phone’s on-site GPS/heading accuracy.

## Phone access and hosting

The hosted HTTPS app works on phones. The optional local development server is local to this computer by default. For same-network development browsing, run with `$env:HOST='0.0.0.0'` and open this computer's LAN IP on the phone; the Windows firewall must permit that connection. Plain LAN HTTP does not enable GPS or PWA offline storage on most browsers.

Before automatic lookup-to-navigation can work for every parking and line, obtain verified destination coordinates and confirm the road network against current terminal operations. On-site device/GPS validation has not yet been performed. Rebuild the offline road network with `python scripts/build_roads.py`; its Python dependency is `requests`.
