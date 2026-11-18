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

## Parking-row display correction

An on-site HC2/HC3 report exposed two display defects: parking codes reused approach points on shared row boundaries, and the highlighted badge floated 30 pixels above that point at zoom 17. Under rotation the HC2 badge could appear closer to HC3's approach than its own.

Kept the route approaches unchanged and added separate display positions for the 14 bounded C-row blocks. Source row identities select the actual bordering OSM aisles; labels use the midpoint of those aisle projections at the locally matched source label position. Row 2 uses way 241873297 for G/H and its continuation 746582089 for I/J/K/L. The builder checks source proximity and strip width, stores provenance, and flags the LC1 endpoint estimate. No global schematic georeference or surveyed accuracy is implied.

Both normal and highlighted codes now use the parking display point. The highlighted badge is centred there, and a blue dot separately marks the road endpoint. Collision reserves follow the displayed badge. Data tests verify the correct aisle strip and independent HC1/HC2/HC3 coordinates; browser tests verify displayed positions and the road endpoint across 0/90/270-degree rotations.

## Reported nonexistent HC3 cross street

An on-site screenshot showed a transverse street between GPS near GC2 and HC3, although the user reported no left/right street there. Its position matches node 2494511760 on way 241873297, 106 m before the HC3 approach. The crossing comes from OSM way 241873269. The current ICO plan shows paired HC/GC C-row blocks sharing a boundary, rather than a cross-road gap.

Excluded exactly three perpendicular segments of that way through rows C1-C3. All shared nodes, longitudinal aisles and unrelated way segments remain available. A reproducible rule records the on-site report, supporting plan and expected source node chain; a geometry change requires review. This is a scoped correction, not removal of all grid crossings or a surveyed map of the full terminal.

The routing correction remains active independently of how the map background is displayed. Tests verify no lateral graph edges and preserved straight travel.

## Remove the default map grid

The default raster tiles and local tile-replacement patches are removed. The user clarified that removing the roads themselves left the map unusable, so the GPS view draws the corrected downloaded road graph over a neutral background. The original ICO plans remain available.

`road-map.mjs` renders all valid graph segments as independent subpaths in two aggregate SVG layers: road casing and white fill. This preserves disconnected and excluded links while avoiding thousands of individual DOM nodes on phones. The roads rotate inside an overlay-child pane below the blue route; their width adapts to zoom. They are available offline with source attribution. Browser tests verify visibly painted aisles, the reported crossing's absence, route stacking, heading rotation and offline use without raster tiles.

## Location-first home and terminal-aware search

The app opens directly on the geographic GPS view and starts one location watch, with the browser's normal permission prompt. The map fills the viewport, with a floating top search bar, collapsible area/line settings and a compact selected-destination card. Search stays accessible while navigating. Selecting a parking keeps the GPS view; View plan explicitly opens its original PDF drawing. Closing a preview returns to the GPS map. Secondary information remains in Maps.

Added documented geographic search areas for Toyota, Hanze, Bastenaken, North and Nissan using published operator locations, port-plan context and mapped industrial footprints. Detection rejects inaccurate/stale fixes and unrelated nearby sites, uses source uncertainty plus GPS accuracy near boundaries, and holds established context through a jitter band. It can fall back to broad South or all terminals. These polygons influence search ordering only; they never supply parking coordinates or change allowed roads. Bastenaken/Hanze select the current southern source plan rather than sparse historical drawings.

Automatic mode ranks local results first and retains matches elsewhere. Manual area choices, All terminals and explicit terminal names take precedence. An exact preferred match can be selected directly. New GPS fixes update area context without replacing a selected destination or resetting a query. Restoring automatic mode immediately restores the nearby plan; losing a usable context reranks open search results. Permission denial leaves the search usable with compact location status.

Unit tests cover regional ranking, overrides, area interiors, uncertain boundaries and invalid fixes. The home browser test verifies Toyota-first search, other-terminal fallback, continuous GPS through plan previews, all five areas, outside-port behavior, denied location and offline reload. Existing route, heading, label-placement, fullscreen and grid-removal checks remain active. Map-first UI was inspected at mobile, desktop and landscape sizes; motion respects reduced-motion settings.

## CD1 and the missing-destination recording flow

CD1 exposed the gap between the searchable source catalogue and the smaller geographic destination catalogue. Added five individually matched VPC compounds: CD1/CD2 east of the identified VPC, DD1 west of it, and DC2/CC2 sub-blocks south of it. Their approaches use actual adjacent road-junction midpoints; interior labels use matched block corners. Explicit lane/node/direction guards require review if the source topology changes. The local C-row affine transform is not used for these compounds because its CD1 projection can land in CD2.

All 15 existing approaches remain unchanged, bringing the built-in catalogue to 20. Repeated-code DC2/CC2 records identify one matched sub-block and retain all source-label positions; neither exact line coordinates nor every entrance is claimed.

For any remaining reference without a GPS point, the primary action is View parking. It opens the correct marked source plan while GPS tracking continues. The GPS navigation API also falls back through an explicit onUnmapped callback rather than automatically opening setup. Manual GPS recording is an optional Maps refinement only. Browser regressions cover CD1 direct routing on a fresh device, no recording prompt, line preservation, visible roads, offline routing and the generic source-plan fallback.

## Parking visibility and movement performance

The VPC overview showed two separate problems: only part of the source catalogue has geographic positions, and the collision pass silently hid four of eight known points in view. Compact code labels now retain their real positions; collisions, GPS reservations and floating controls produce explicit numbered groups with member lists and zoom actions. Groups never reroute the active destination. Layout is coalesced through animation frames, throttled during movement, cached for unchanged views and avoids unchanged DOM attribute writes. The same 100 static rotation events previously caused 1,500 visibility writes and now cause none.

The full terminal drawing is directly available through All parkings, with a one-tap return to live GPS. This includes source labels that cannot yet be placed geographically. An audit found no GeoPDF transform or embedded CAD/geographic coordinates in the provided PDFs. The official nautical GIS offers roads, buildings and concessions, not an internal parking-code catalogue, so unlocated names are not assigned guessed GPS positions.

Road paths previously projected all 9,789 segments on repeated camera resets. A spatial index now selects buffered local geometry and joins only genuinely consecutive segments of the same way. Geometry is reused until the viewport leaves its buffer or zoom changes. GPS/accuracy/target markers and route overlays update in place instead of being destroyed on every fix. Manual zoom pauses following rather than snapping back on the next GPS fix.

With Chromium mobile viewport and 4x CPU throttling, VPC pan/rotation changed from about 90 ms per action to about 9 ms, with the rendered model reduced from 19,578 to 1,473 vertices. The marker-identity regression showed zero GPS-marker replacement across twelve fixes. Timing results describe the test setup; structural tests guard the smaller geometry, reuse, large-pan coverage, label accounting, route stacking and offline behavior.

## BB and parking-route coverage expansion

BB exposed the gap between source labels and geographic destinations again. North BB now resolves directly to the adjacent lane 241878068 at 51.32706215, 3.2180946 without a saved pin. Its row is counted from the HLN/SUI warehouse boundary rather than extrapolated from a whole-plan transform. All 47 matched North targets route from BB over the existing directed network.

The generated catalogue contains 348 source-reference approach records. Regional builders record bounded road parcels, lane/node guards, source positions, named controls and historical/group precision. The original 20 records are preserved. Toyota markers were corrected against the brochure, including P04, and seven omitted codes were added. North L/P/W fragments from warehouse text are excluded. Explicit historical-only records resolve in their own source map; saved points retain precedence.

The resolver retains parking-group-approach scope. Destination and route details call these parking-area approaches and state when the exact entrance is unmapped. No exact line positions are inferred. The source-to-road matches remain estimates and are not on-site validation.

Every offered approach is checked for an actual directed road connection from CD1 or North BB. This caught H30/H31 on an isolated inbound lane; their shared approaches now use the reachable northern boundary road 746744822, retaining the original one-way road data. All 348 offered targets pass this connectivity regression.

Coverage is 415/531 indexed source-plan references, including historical duplicates; 116 remain unlocated. coverageAudit records each gap, and npm run audit:coverage exits 1 until none remain. Unit tests check audit completeness and road placement; this does not make the full-coverage audit pass. Nissan internal roads and gate connections are not established. FX projections across a fence to public MVO were removed after review. AH/BH/CH research remains outside the published merge because individual geography is not established; the nearby 1338613xxx grid is WWL rather than ICO.

The larger catalogue attached all 351 trial marker nodes before hiding them. The label layer now attaches only points within the viewport plus 64 pixels and preserves cached marker objects. A 4x CPU fixture reduced attached nodes to about 60 and pan/rotation work from about 15 ms to about 10 ms. Large parking lists now remain on screen and scroll. Browser checks include fresh-device BB, five supported plan views, retained lines, offline BB, marker reuse and grouped labels. Full coverage remains unfinished because of the recorded geographic-data gaps.

## Active navigation smoothness

The earlier performance fixture never started a route. A 24-fix, 1 Hz active-navigation probe on the 6 km BB-to-H61 route, mobile 390x844 at DPR 3 and 4x CPU, found ten UI-thread road searches taking 59-140 ms and a maximum frame gap around 150 ms. Every raw fix also snapped the camera and marker. Heading easing held the driver at 62% height by panning after each rotation, while the rotation plugin committed that pan by resetting the entire view on the next frame. This produced 60 view resets for 65 bearing updates.

Routing now uses the unchanged algorithm in a module worker with a single cached graph. The route client accepts only the latest request; stop/clear/permission denial invalidate pending work. GPS also guards destination identity and fix freshness after awaiting a result. Raw fixes still determine routes, distance, terminal context and signal quality. Both worker modules are precached.

Position-motion interpolates only between observed fixes, with bounded duration and distance. First fixes and large relocations are immediate; reduced motion disables interpolation. Retargeting uses the current display position and never extrapolates. Camera movement uses existing map-pan transforms, while GPS marker frames avoid rebuilding target, route and label layers. Manual panning or zooming retains control until recentering.

Driving-camera projection and translation retain fractional CSS pixels. Ordinary Leaflet panning quantized a 5.6 m fix into only eight whole-pixel map positions despite the interpolated measurements; the rendered pane now changes across all 50 sampled frames. Large camera moves use a geographic reset with screen deltas transformed through the current bearing, and recentering cancels active inertia. Regression checks keep large rotated pans within half a pixel and prevent subsequent inertia drift.

Map-performance is scoped to geographic driving maps. Its setBearing preserves geographic center by rotating the current map-pane translation rather than committing a reset. SVG viewBox/path geometry is reused while the viewport plus stroke margin remains covered. A diagonal plus 15% buffer replaces the plugin's oversized 1.5-padding surface: about 1210-square rather than 3720-square CSS pixels on the fixture. Zoom, resize and buffer exit refresh bounds; CRS.Simple plans retain default behavior. These private Leaflet/plugin hooks require regression checks before a vendor upgrade.

Buffer reuse also checks the geographic pixel origin. A same-zoom recenter must invalidate cached geographic bounds before any animated zoom; a regression verifies line/marker alignment during the transition in north-up and heading-up views. Movement-end events retain the 80 ms parking-label layout budget rather than bypassing it on every animation frame (60 layouts per second reduced to about 12 in the fixture). Road drawing does not depend on successful worker initialization, and a revoked location permission cannot revive a pending route after delayed road data arrives.

The isolated route-and-label fixture changed 89 full resets, 356 projections and 1428 path updates into zero during buffered pan/rotation, with summed raster CPU around 1171 to 128 ms. These are test-machine measurements, not phone FPS guarantees. Browser tests additionally cover full route equality, incoming turn rules, cancellation, subdirectory hosting, intermediate GPS frames, reduced motion, manual browsing, route alignment and rotated viewport coverage.

The repeated active-navigation probe observed no UI-thread road search or long task after these changes; its maximum frame gap fell from about 150 to 33 ms, with all returned routes identical to the original algorithm on raw GPS inputs. Actual touch drag, flick inertia and pinch zoom were also checked at DPR 3 and 4x CPU: roads/route stayed aligned, manual browsing held its camera, and recenter retained zoom and the 62% vehicle anchor. Those desktop browser simulations do not establish frame rate on a particular phone.

Duplicate parking labels across terminals must not silently select the wrong destination. No route may be claimed for an unsupported parking or line. Numeric parking codes must work without being mistaken for line numbers. Location permissions must fail clearly. Mobile users must be able to dismiss overlays and access the map. Storage failures must not prevent lookup. Only local assets should be cached; public raster tiles are not requested.
