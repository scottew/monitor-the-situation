# State camera rollout

## Architecture

One existing Vercel project serves all state hosts. No duplicate application or per-state deployment is needed. `state-config.js` maps a known `<state-slug>.monitorit.app` hostname to its state settings. Multiword slugs use hyphens, such as `new-york`. The existing `utah.monitorit.app` data path remains unchanged.

Local and Vercel previews support `?state=CA` (also a full slug), so state behavior can be reviewed before DNS is changed. A canonical state hostname takes precedence over the query parameter. Unknown state hostnames and query values do not silently show Utah data. A state configuration is not evidence of a working hostname or camera integration.

The frontend requests `/api/cameras?state=CA` for the normalized directory. `lib/camera-adapters.js` is an explicit allowlist of reviewed integrations; source URLs cannot be supplied by clients. Camera IDs are state/district scoped. Only provider-controlled HTTPS image URLs, valid coordinates, and in-service records are accepted. No synthetic cameras or sample fallback data are used in production.

The California directory cache lasts five minutes per warm server instance; Iowa and Oregon directories use a 24-hour cache. Concurrent refreshes share a request. If the source becomes unavailable, a California directory less than thirty minutes old (or Iowa/Oregon directory less than 48 hours old) can be returned with `stale: true`; its original `fetchedAt` is retained. Partial district responses include `partial` and `unavailableDistricts`. Camera image freshness is independent of directory freshness. Snapshots are loaded directly from their official sources and should never be represented as guaranteed live video.

## Enabled integrations

- Utah: preserved pre-existing UDOT integration. This change is not a new certification of UDOT media reuse terms.
- California: [Caltrans CWWP CCTV documentation](https://cwwp2.dot.ca.gov/documentation/cctv/cctv.htm) explicitly offers CCTV files for application integration at no charge. [Conditions of use](https://dot.ca.gov/conditions-of-use) contain third-party-content exceptions. The twelve district JSON directories are consumed using URLs documented by Caltrans; image URLs come from records, not fabricated patterns. Caltrans attribution is returned in the API and should appear in the UI.
- Iowa: the [official GIS terms](https://iowadot.gov/policies-statements/terms-use), [CC BY 4.0 dataset](https://data.iowadot.gov/datasets/c4063f200a7b4da5826e2ac86c677cf5_0/explore) and [May 2026 integrator advisory](https://iowadot.gov/news/2026-05-28/media-advisory-iowa-dot-updates-traffic-camera-video-system-data-feed-usersdevelopers) support this DOT-owned snapshot integration. Only `ORG=IADOT` and HTTPS `iowadot.gov` media are allowed; any future third-party source is excluded. Device IDs are shared by multiple views, so stable share IDs include a hash of each image URL. Source, license, transformation and non-endorsement attribution are supplied to the UI. Daily directory refresh; image freshness is not inferred from inventory update fields.
- Oregon: the [TripCheck FAQ](https://www.tripcheck.com/Pages/Frequently-Asked-Questions) affirmatively permits business use of TripCheck images/data with “Camera courtesy of ODOT” credit. The official public map inventory is strict JSON despite its `.js` extension, and is parsed as data, never executed. Only the officially documented `roadcams/cams` snapshot paths are constructed; filenames cannot contain path traversal. TrafficLand video and external destinations are excluded. TripCheck includes some adjoining-state road views, so this is not a claim that every returned camera is physically in Oregon. Daily inventory refresh and five-minute automatic snapshot refresh.
- Other states: default to unavailable until feed access and reuse terms are independently reviewed. Public viewing access does not by itself permit redistribution. Alabama and Arkansas are marked restricted based on their source terms; North Dakota must not be enabled on the basis of its public GeoJSON alone.

## Verified 2026-10-03

- All twelve Caltrans district manifests loaded successfully through the production adapter.
- 3,395 valid in-service records survived validation. Counts can change.
- One returned snapshot URL from each of the twelve districts responded HTTP 200 with nonempty image/jpeg data. This verifies retrieval, not freshness or visual quality of every camera.
- Iowa production adapter loaded 1,260 distinct DOT-owned views, preserving multiple image views per device ID. Research verified three representative images as decodable, current roadway/rest-area JPEGs.
- Oregon production adapter loaded 1,160 coordinate-valid views; one invalid-longitude record was excluded. Research verified a representative current ODOT snapshot.
- Eleven backend/routing tests pass: `node --test tests/states.test.js tests/iowa.test.js tests/oregon.test.js`. They cover state routing, ownership gates, duplicate views, invalid coordinates, unsafe URLs/path data, pagination and partial-source behavior.
- DNS, TLS, custom-domain binding and deployed frontend integration require separate verification. No new hostname is claimed live by this document.

## Deployment checklist

1. Review the source inventory and activate only integrations with adequate access/reuse evidence.
2. Test the integrated frontend locally, including mobile, shared links, source failures and unsupported-state messages.
3. Push reviewed code to the authorized branch and verify the exact commit's Vercel deployment result. Do not assume a draft pull request deploys production.
4. With authorized Vercel/domain access, bind each enabled hostname to the existing project. Prefer explicit per-state domains while only a subset is enabled; wildcard DNS is optional and does not enable camera adapters by itself.
5. Use Vercel's actual returned DNS requirements at the verified DNS provider. Do not invent CNAME targets or assume domain ownership.
6. Verify DNS resolution, trusted TLS, HTTP response, correct state title/map, real camera directory, representative snapshots and share links on each final hostname.
7. Keep states with account/API-key, consent, attribution or rate-limit requirements disabled until those requirements are satisfied. Creating new API credentials needs explicit approval.

## Known infrastructure blocker

As of this verification, the existing GitHub repository has a Vercel deployment integration. The connected Vercel account has not yet provided authorized project-scope access to inspect/manage the target deployment, and no verified DNS write capability has been established. Local code readiness and production deployment are separate states.
