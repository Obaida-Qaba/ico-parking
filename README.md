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
- A separate optional line field. The line is saved as a destination reference, not assigned a made-up location.
- Parking markers at the actual source-label positions, zooming, panning, click-to-select, source links and dates.
- Recent destinations saved on the device, deep links and sharing.
- All six plan images and the app shell are saved offline after the initial successful download. Reopen the same site to use them offline. External street-map tiles require internet. Browser storage can be evicted by the device.
- Optional GPS position on the geographic OpenStreetMap view. This is a one-time location fix, not continuous navigation.
- PWA manifest, installation support where the browser permits it, and home-screen icons.

## Current limitations

**Internal road navigation and exact line guidance are not implemented.** Source plans do not provide verified routable road data or GPS coordinates for each parking/line. The app explicitly reports missing route coverage instead of drawing a straight line or making up turns. It does not route through Google Maps.

Parking markers identify source drawing labels. They do not identify verified entrances. Some labels appear at multiple positions, and those occurrences are shown. The geographic street map has approximate terminal centre markers for the southern and northern terminals only, based on ICO's published coordinates; it does not geographically locate the selected parking.

The older PDF pages are raster images. Only clearly readable labels have been manually indexed; unindexed labels remain visible in the plans. Their arrangements and numbering may be outdated. None of these plans has been confirmed against the current operating layout by ICO.

This is an independent application, not an official ICO service.

## Sources

- https://www.icoterminals.com/upload/ico_safety_regulations.pdf - January 2026 document. Pages 4, 5 and 6 contain southern, northern and Nissan plans. Southern plan date: 8 September 2025; Nissan: 2 February 2024. The northern plan has no printed revision date.
- https://cewez.be/wp-content/uploads/2025/04/Onthaalbrochure-ICO.pdf - historical Bastenaken, Hanze and Toyota plans on pages 23, 24 and 25. These are older layouts; upload date is not a map revision date.
- https://www.icoterminals.com/nl/terminals/zuidelijke-insteek-terminal - terminal centre coordinate.
- https://www.icoterminals.com/nl/terminals/noordelijke-insteek-terminal - terminal centre coordinate.
- Leaflet 1.9.4, BSD 2-Clause license in `public/vendor/leaflet-LICENSE.txt`.
- Street tiles: OpenStreetMap contributors, live attribution displayed in the app.

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

The browser suite checks desktop/mobile search, line references and replacement, deep links, missing parking, invalid line input, every map, route coverage reporting, denied/granted simulated geolocation, offline reload, no horizontal page overflow and no uncaught browser errors. Screenshots are written to `test-results/`.

## Phone access and hosting

The hosted HTTPS app works on phones. The optional local development server is local to this computer by default. For same-network development browsing, run with `$env:HOST='0.0.0.0'` and open this computer's LAN IP on the phone; the Windows firewall must permit that connection. Plain LAN HTTP does not enable GPS or PWA offline storage on most browsers.

Before full internal navigation can be enabled, acquire and verify: parking entrances and line geometry, geographic alignment of each drawing, road intersections and connectivity, one-way directions, restricted passages and an update process for changing layouts. The existing app is deliberately a parking finder until that information is available.
