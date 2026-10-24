# Deployment and privacy

## Build and runtime

Use Node.js 24 and the committed npm lockfile. Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, the Python map tests, and `npm run build`. Start with `npm start`, or use a Next.js-compatible Node hosting platform. A static-only host cannot run the listing, map and routing APIs.

The default font setup downloads Google Fonts while building and serves the resulting assets from the app. Optional OCR/model resources and external map services need network access at runtime. The default routing server is configured in `lib/route/valhalla.ts`; `VALHALLA_URL` may point to an operator-controlled compatible server. Never expose deployment secrets in browser-prefixed environment variables.

## External services and retention

- Label and pedal photos stay on the device. OCR and the optional pedal detector download software/model resources; the detector is optional and large.
- Product URLs are sent to the app server, which contacts the product host. Listing content is not persisted by application code.
- Map tiles and map searches contact OpenStreetMap services. Saved map datasets are served from this app; live Overpass queries are a fallback. Public map-area responses can be cached by the CDN.
- Route endpoints and route geometry are sent to Valhalla, Census TIGERweb and QLever as needed. Plans are held in a bounded in-memory cache of up to 24 entries per process. They can be reused for five minutes. Expired entries are removed lazily on a matching lookup or by capacity eviction, so an unused plan may remain in memory until eviction or process shutdown. Response headers prohibit browser/CDN caching of route results. A hashed cache key does not anonymize the coordinates inside a plan.
- Catalog photo drawers contact manufacturer hosts. Browser language, experience and sound preferences can use browser storage. Hosting providers and upstream services may retain request metadata under their own policies.

Do not claim zero retention or that no outside requests occur. Avoid real home/school addresses in screenshots, test fixtures and public bug reports.

## Operator controls

The built-in rate limits reset with server instances and depend on proxy-provided client addresses. Configure the hosting platform to overwrite untrusted forwarded-address headers, limit request bodies, apply shared rate limiting where needed, and restrict outbound access to internal networks. Keep dependency updates and security alerts enabled.

The public routing, map and geocoding services have usage limits and no project-specific availability guarantee. Review their current policies before increasing traffic; use an appropriate hosted or self-hosted provider when necessary. No API key being required does not imply unlimited usage.

## Content maintenance

Rules, local policies, catalog prices and map snapshots are dated. Update records against their linked primary sources and rerun the regression gates. Tests establish consistency with the stored data, not legal certification. Spanish remains marked as awaiting fluent-speaker review. Keep that limitation visible until such a review is actually completed.
