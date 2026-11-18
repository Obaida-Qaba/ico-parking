# ICO parking navigator

User instruction: start building a phone web app. Enter a parking such as H61 and an optional line such as 15. Cover the available ICO Zeebrugge maps.

## Approach and scope

Use a standalone static web app, native JavaScript and locally bundled Leaflet. This is easier to open on a phone than a separately installed Android app. Keep this project isolated in its own directory; do not change existing trading files.

Show six map views: the current combined southern plan, northern plan, Nissan plan, and Cewez's historical Bastenaken, Hanze and Toyota plans. Extract searchable parking label coordinates directly from vector PDFs, and manually index readable historical raster labels. Keep original sources and dates visible. Avoid treating a PDF label as a precise parking entrance.

Parking-level lookup is the first deliverable. Line input is retained but never assigned fabricated coordinates. Internal turn-by-turn navigation cannot be honestly shipped without verified road topology, driving restrictions, georeferencing and line locations. A route button must explain the missing coverage rather than drawing a straight line or inventing directions. GPS shows the real position on the geographic street map; no blue dot on an uncalibrated terminal drawing. Google Maps handoff is explicitly to an approximate terminal position, not an internal parking or entrance. Do not imply it routes to the requested line.

## Files

- scripts/build_maps.py: reproducible PDF acquisition, rendering and label extraction.
- public/data.json and maps/: local map catalogue and images.
- public/core.mjs: pure destination parsing, indexing, validation, routing coverage rules.
- public/app.mjs, index.html, styles.css: responsive map explorer and destination sheet.
- public/sw.js, manifest.webmanifest, icon.svg: installable offline app shell and maps.
- server.mjs: local static server.
- tests/: meaningful parser, data integrity, unsupported routing and browser flow checks.
- README.md: run instructions, source provenance, limits and next data needed.

## Tasks

- [x] Build source catalogue with actual parking label coordinates, tests for source bounds and H61.
- [x] Test then implement tolerant parking/line parsing and route coverage rules.
- [x] Build responsive map, search results, destination selection, history, source information and offline support.
- [x] Verify desktop/mobile flows, unknown parking, unsupported lines, map switching, offline reload and GPS permission handling.

## Implementation decisions and checks

Used a separate project directory without changing existing trading files. No deployment or git commit was requested.

Indexed current PDF vector labels directly. Removed speculative small legacy grid labels after visual inspection; readable labels remain indexed, and full map images remain browseable. Some repeated source labels correspond to multiple positions and are kept together.

The browser suite caught a race between delayed live search and form submission; selecting a destination now cancels the pending update. Switched Leaflet markers from canvas to SVG after rapid map switching exposed a canvas teardown exception. Offline precaching, GPS permission states, source-plan switching and mobile overflow were tested in Chromium.

## GPS upgrade requested by the user

The user made GPS and following real roads the priority and authorized updating GitHub. Implement continuous watchPosition tracking on the geographic road map and routing over actual downloaded OSM road geometry. Do not georeference schematic PDFs using a poor fit: a quay-label affine alignment showed errors over 100 metres. Do not publish guessed H61/line coordinates.

`navigation.mjs` implements directed road routing with projected segment endpoints, one-way rules and node turn restrictions. `gps.mjs` manages live fixes, saved destination points, route updates and the GPS UI. `build_roads.py` prepares OSM roads with explicit driving prohibitions filtered. Save fresh accurate on-site GPS (25 m or better) or a user-selected map point for a parking/line. Store points on the device only. Pause routing for GPS accuracy worse than 35 m or stale fixes older than 15 seconds. Refuse disconnected routes and endpoints over 50 m from road coverage.

Both map plans and road data work offline after download. Background map tiles require internet. Source road data is not confirmed against live terminal operations; field testing and a verified destination coordinate catalogue remain necessary for automatic navigation to every ICO parking/line.

## Review focus

## HC1 and automatic-destination correction

User reported HC1 missing under Bastenaken and navigation blocking on an on-site recording step. Bastenaken/Hanze filters now search regional entries in the current combined southern plan rather than only sparse historical indices. Typed terminal names override stale dropdown filters. The current south plan is the newly discovered official V1.09-2026 vector PDF, including its expanded parking references.

Added a built-in destination catalogue and resolver. Fifteen bounded parking approaches are matched to actual OSM road segments using separate local landmarks for the central Bastenaken and H61 areas. HC1 and H61 route immediately with no user recording. Exact line positions remain explicitly unresolved; line input falls back to the parking approach. Optional saved measurements can refine the built-in point. This is not a claim of site-surveyed entrances or fully located parking across every terminal.

Fresh-browser tests simulate live GPS on nearby connected roads and exercise HC1/Bastenaken and H61 routes without any saved local GPS pins. Every built-in destination is checked against the source reference catalogue and motorable road geometry. Source controls, projection residuals and road segments are stored in the destination catalogue and reproducible builder.

## Clearer navigation and full-screen map

User supplied a mobile screenshot showing too many overlays and requested a clear full-screen map. Added one closed-by-default Maps menu containing layer choices, source information, GPS details and destination refinements. Navigation now hides the app header/search panel and shows a compact destination/turn/distance card. Important GPS errors remain visible; normal accuracy/speed detail lives in Maps.

Full screen uses document-root browser fullscreen so dialogs and toasts remain visible. A fixed viewport fallback handles unsupported/rejected requests. Exit full screen, native fullscreen exit and Escape preserve the current route and GPS watch. Layout changes invalidate Leaflet without resetting the center or route. The old fit-bounds button now has a distinct icon and label; it is not the fullscreen button.

Verified mobile fallback, desktop native fullscreen, portrait/landscape sizing, accessible Maps controls, source dialogs and preserved route/GPS state. The offline shell includes the new CSS and UI module.

## Heading-up driving camera

User requested forward-facing location like Google Maps. Bundled the MIT Leaflet rotation extension and enabled it only on the geographic map. All road panes rotate together; destination labels stay readable. Follow mode uses a reliable GPS course, places the vehicle at 62% of map height and smoothly rotates the map so travel points upward. The blue arrow stays screen-up while following. Meaningful GPS movement supplies course when heading is absent; stopped/poor/out-of-order fixes do not change the course. The app does not require phone compass permission.

Dragging and route overview suspend the follow camera; the location button restores heading-up. N resets to north-up until follow is resumed. Fullscreen preserves camera mode and tracking. Unit tests and browser tests verify angle wrapping, stationary/missing-heading behaviour, real rendered road vectors, arrow direction, lower-centred location and camera controls.

## HC1 detours and route guidance

User confirmed HC1 was the correct destination but the route was unnecessarily long. The current ICO V1.09-2026 plan shows paired opposite arrows along the C1 access corridor, while OSM way 746582135 was one-way. Added a reproducible, source-recorded direction override without changing geometry or the HC1 approach. The builder checks the exact node chain before applying it and retains the original OSM direction.

Fixed shortest-path initialization at road junctions: starting or arriving at a node no longer requires traversing the arbitrarily selected incident segment. A credible travel course preserves incoming-road context at the starting junction, including when considering a same-segment direct route. Corrected U-turn relations between separate ways. Direction-aware road matching is bounded by reported GPS uncertainty and the existing 50 m maximum road offset.

Extracted guidance into a testable module, retaining turns near the current position and warning when the initial route requires reversing direction. Regression tests reproduce the old HC1 detour, junction loops, lane ambiguity and restriction bypasses. Browser tests use simulated GPS on the corrected HC1 lane and verify direct distance. Shortest-route claims apply to represented legal graph paths between snapped road points; on-site operating rules and unknown road coverage remain limitations.

## Other parking codes during navigation

Added a separate geographic parking-label layer using all 15 existing matched approaches and valid saved parking-level points. This changes visibility without creating additional destination coordinates or applying the local schematic transforms outside their calibrated regions. The active parking is omitted from this layer because its larger destination marker already identifies it.

Labels use the non-rotating marker pane so their text stays upright while their geographic positions turn with the driving view. Screen-space collision checks prioritize labels near the map centre and reserve space for the GPS marker and active destination. Panning, zooming, rotating and resizing refresh spacing; GPS route redraws preserve the label layer. Labels are noninteractive, so reading nearby codes cannot change the route. Browser verification includes HC1/GC1 visibility, text orientation, spacing, GPS updates, fullscreen and offline reloads.

Duplicate parking labels across terminals must not silently select the wrong destination. No route may be claimed for an unsupported parking or line. Numeric parking codes must work without being mistaken for line numbers. Location permissions must fail clearly. Mobile users must be able to dismiss overlays and access the map. Storage failures must not prevent lookup. Only local assets should be cached; public OSM tiles remain online.
