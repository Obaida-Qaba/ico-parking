# Google satellite for Portway

The user chose Google satellite imagery with clear ICO parking labels, their live GPS position and the existing blue road route. They chose pay-as-you-go with the 10,000 monthly Dynamic Maps free allowance after rejecting other aerial imagery. Account setup and payment verification are completed by the user; enabling additional paid services or a paid subscription is outside this change.

Use the official Maps JavaScript API with a persistent native satellite map. The existing Leaflet layers supply independently sourced parking labels, GPS and route geometry. Synchronize both cameras at the same viewport size, fractional zoom and bearing. Google owns map gestures and retains visible, clickable branding and attribution. The single native map is reused during search, GPS updates and source-plan previews to avoid unnecessary map loads.

Keep the local road map when the key is absent, authentication fails, the network is offline or vector rendering cannot maintain matching headings. No Google tiles are copied, extracted or stored in the service worker. No Places, Routes, Street View or Geolocation API is required. Browser geolocation and our existing local road graph remain in use. Adding photos does not verify previously unresolved parking locations or exact lines.

Alternatives considered: direct Google satellite tiles are unavailable for new EEA Map Tiles integrations; other aerial imagery was explicitly rejected. A native Google map supplies the requested pictures through its supported web API.

Restrict the browser key to the production GitHub Pages origin and Maps JavaScript API. Treat the monthly free allowance as pricing, not an automatic hard stop. Inspect available daily quotas before claiming any usage cap; budget alerts alone do not stop charges. Keep any account on its verified trial status unless the user authorizes an upgrade.

Validation must include real Google imagery and projected alignment at multiple headings, mobile search/navigation, source-plan round trips, native gesture following, constructor reuse, visible attribution, offline/auth/rendering fallback, no optional Google API requests and the existing unit/browser regressions.
