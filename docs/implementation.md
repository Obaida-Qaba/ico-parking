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

Full road/line navigation remains outside the delivered first-version coverage. No internal road graph or geographic map alignment is represented as verified.

## Review focus

Duplicate parking labels across terminals must not silently select the wrong destination. No route may be claimed for an unsupported parking or line. Numeric parking codes must work without being mistaken for line numbers. Location permissions must fail clearly. Mobile users must be able to dismiss overlays and access the map. Storage failures must not prevent lookup. Only local assets should be cached; public OSM tiles remain online.
