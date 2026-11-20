# Google Satellite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Display Google satellite imagery beneath Portway's parking labels, GPS and blue route without adding optional Google service charges.

**Architecture:** One native Google Maps JavaScript map remains alive beneath the Leaflet geographic data layer. A small controller synchronizes camera and gestures; existing source plans and local road fallback remain independent.

**Tech Stack:** Static ES modules, native Maps JavaScript API, Leaflet 1.9.4 and Leaflet Rotate, Node test runner, Playwright.

**Spec:** ../specs/2026-11-20-google-satellite-design.md

## Global Constraints

- Official Maps JavaScript API satellite only; no direct tiles, GoogleMutant or copied Google imagery.
- Native map constructor is reused for search, moving GPS and plan round trips.
- Browser key restricted to GitHub Pages origin and Maps JavaScript API; no optional Places/Routes/Street View services.
- Local road routing and existing destination precision remain unchanged.
- No claim of an automatic monthly spending stop; verify actual console controls.

## Review Focus

- Cameras disagree at rotated or fractional zoom: compare projected screen positions against the live SDK.
- Native drag/pinch competes with GPS following: suspend follow and keep overlay geometry aligned.
- Delayed SDK events target a removed Leaflet instance: source-plan switches and unload must ignore stale work.
- Authentication/network/WebGL failure leaves a blank map: fallback must retain roads, GPS and route.
- Transparent overlays obscure Google attribution or recreate maps: inspect clickable branding and constructor count.

### Task 1: Satellite controller

Files: create `public/google-satellite.mjs`, `tests/google-satellite.test.mjs`.

Interface: `createGoogleSatellite({element,apiKey,onState})` returns `{bind(leafletMap,isGeographic),retry(),destroy()}` and a read-only `state`. States: loading, ready, fallback, plan, disabled.

- [ ] Write failing tests for missing key, camera parity, one native map, source switches, native gestures, errors and disposal.
- [ ] Observe RED, implement the focused controller, then observe GREEN.

### Task 2: App integration

Files: modify `public/app.mjs`, `public/index.html`, `public/home-map.css`, `public/sw.js`, `package.json`; add `public/google-config.mjs`, `tests/google-map-browser.mjs`.

- [ ] Write a browser check proving the configured app creates a satellite surface with visible route/labels/GPS; observe RED.
- [ ] Bind the persistent controller during geographic views, keep fallback roads until ready, reserve branding space and provide a retry action in Maps options.
- [ ] Precache local modules only; preserve cross-origin service-worker exclusion. Include new unit checks in `npm test`.
- [ ] Run browser checks against the actual configured SDK without logging keys. Verify alignment, native gestures, reuse and offline fallback.

### Task 3: Account and release verification

- [ ] Verify the user-completed Google account setup, website/API key restrictions, enabled services and available daily quotas.
- [ ] Record truthful cost control limitations; do not upgrade the trial account.
- [ ] Run unit and relevant browser suites, review the whole diff independently and resolve important findings.
- [ ] Publish the authorized change, verify the deployed assets and actual satellite navigation, and report the working app and account status.
