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
- A separate optional line field. Each parking or exact line can have a real on-site GPS point saved on this device.
- Parking markers at the actual source-label positions, zooming, panning, click-to-select, source links and dates.
- Recent destinations saved on the device, deep links and sharing.
- All six plan images, the app shell and the road network are saved offline after the initial successful download. External background street-map tiles require internet; road geometry and routing work offline. Browser storage can be evicted by the device.
- Continuous high-accuracy GPS tracking, accuracy display, heading, speed and follow-position mode. Tracking can be stopped explicitly.
- Road routing to a saved destination with distance updates, basic turn prompts and rerouting from updated GPS. Routes follow OSM road geometry, mapped one-way directions and node turn restrictions. They never connect disconnected roads with an invented shortcut.
- Navigation pauses when GPS accuracy is worse than 35 metres or the last fix is older than 15 seconds.
- PWA manifest, installation support where the browser permits it, and home-screen icons.

## Current limitations

**Parking and line GPS coordinates are not supplied by the source PDFs.** The app can navigate along mapped roads to a destination you save on site or select on the geographic map. It cannot automatically turn the schematic PDF label H61 into a precise GPS destination. Matching quay references against OSM showed substantial alignment errors, so that estimated transform is deliberately not used.

To enable a destination: search `H61 line 15`, choose **Set GPS destination**, and save GPS while physically at that parking/line. Saving requires a fresh fix with accuracy of 25 metres or better. Alternatively choose its known actual location on the road map. The point stays on this device; shared links identify the parking/line but do not transfer saved GPS coordinates. Record parking locations only when stationary at the named point.

Routing covers the downloaded Zeebrugge road network, including internal roads present in OSM. Missing roads, temporary closures, access changes and way-based turn restrictions are not provided as live operational data. The router assumes authorized access to mapped private terminal roads. Explicitly locked/no-access nodes and motor-vehicle prohibitions are excluded. It refuses to route if either endpoint is more than 50 metres from a mapped drivable road. The drawn route ends on the road; any gap to the saved point is reported rather than drawn across a parking block.

PDF parking markers identify source drawing labels, not verified entrances. Some labels appear at multiple positions. Live GPS is shown on the geographic road map, which also shows saved destination points. The schematic PDF drawings remain separate and are not presented as GPS-aligned.

The older PDF pages are raster images. Only clearly readable labels have been manually indexed; unindexed labels remain visible in the plans. Their arrangements and numbering may be outdated. None of these plans has been confirmed against the current operating layout by ICO.

This is an independent application, not an official ICO service.

## Sources

- https://www.icoterminals.com/upload/ico_safety_regulations.pdf - January 2026 document. Pages 4, 5 and 6 contain southern, northern and Nissan plans. Southern plan date: 8 September 2025; Nissan: 2 February 2024. The northern plan has no printed revision date.
- https://cewez.be/wp-content/uploads/2025/04/Onthaalbrochure-ICO.pdf - historical Bastenaken, Hanze and Toyota plans on pages 23, 24 and 25. These are older layouts; upload date is not a map revision date.
- https://www.icoterminals.com/nl/terminals/zuidelijke-insteek-terminal - terminal centre coordinate.
- https://www.icoterminals.com/nl/terminals/noordelijke-insteek-terminal - terminal centre coordinate.
- Leaflet 1.9.4, BSD 2-Clause license in `public/vendor/leaflet-LICENSE.txt`.
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

## Phone access and hosting

The hosted HTTPS app works on phones. The optional local development server is local to this computer by default. For same-network development browsing, run with `$env:HOST='0.0.0.0'` and open this computer's LAN IP on the phone; the Windows firewall must permit that connection. Plain LAN HTTP does not enable GPS or PWA offline storage on most browsers.

Before automatic lookup-to-navigation can work for every parking and line, obtain verified destination coordinates and confirm the road network against current terminal operations. On-site device/GPS validation has not yet been performed. Rebuild the offline road network with `python scripts/build_roads.py`; its Python dependency is `requests`.
