# Prepared Arizona, Georgia and Wisconsin sources

These integrations are source-only preparations. No real credential was read,
stored, configured or used during implementation. They remain disabled even if
someone adds the environment variables below. No new state is marked deployed.

| State | Server-only environment variable | Official camera documentation |
| --- | --- | --- |
| Arizona | `MTS_AZ_511_API_KEY` | https://www.az511.gov/help/endpoint/cameras |
| Georgia | `MTS_GA_511_API_KEY` | https://511ga.org/help/endpoint/cameras |
| Wisconsin | `MTS_WI_511_API_KEY` | https://511wi.gov/help/endpoint/cameras |

All three document a limit of 10 API calls per 60 seconds per key. Arizona's
documented API and snapshot host is `az511.com`; Georgia uses `511ga.org` and
Wisconsin uses `511wi.gov`. The implementation supports documented snapshot
views only. It does not integrate video streams, alternate hosts, signed media,
query-bearing image URLs, or media requiring authentication. Real API responses
and media accessibility still need authorized validation after secure setup.

## Activation gates

`sharedQuotaReady` is false for all three server-side providers, keeping live
activation disabled. Environment variables cannot override this gate. Arizona
and Georgia's reuse review is accepted for this bounded traffic-camera viewer:
their official developer documentation expressly invites traffic-app development
using camera data and publishes snapshot URLs; no specific snapshot-display
restriction was found. This is a reasonable interpretation of those documented
API purposes, not a claim of an unrestricted media license. See
[Arizona developer documentation](https://www.az511.gov/developers/doc) and
[Georgia developer documentation](https://511ga.org/developers/doc).
Do not use Georgia DOT/511 logos without the required permission.

Wisconsin's `reuseApproved` gate stays false and its state UI remains `restricted`:
its separate agreement requires written public/commercial reuse consent. An
issued key does not supersede that restriction. Review any approval-specific
terms before live activation.

The adapter validates source coordinates, numeric camera/view IDs and exact
HTTPS snapshot paths; preserves distinct view IDs for sharing; discards video
fields; rejects URL credentials, query strings and fragments; and suppresses
upstream error details. Source strings are rendered as text. Shared camera links
retain only state routing and camera ID, excluding arbitrary incoming URL data.

## Quota enforcement before live activation

The included five-minute success cache, request coalescing and one-minute failure
cooldown protect one runtime only. They are not a global per-key rate limiter:
Vercel can run multiple instances, and cold starts reset memory. The live gate
therefore remains closed. No new service or credentials have been provisioned.

The prepared no-new-service implementation instead uses the existing GitHub
repository as a durable snapshot store. `scripts/refresh-state-snapshots.js`
reserves a per-state attempt in `camera-data/ledger.json` using a non-forced Git
push before contacting a provider. A conflicting push, missing ledger, invalid
clock or attempt less than six hours old fails closed. Every source failure still
consumes that attempt window. Success publishes a strictly normalized snapshot
on the same branch; no arbitrary provider metadata is copied. The public API only
reads these snapshots and never calls keyed APIs because of visitor traffic.

The disabled workflow template is in
`docs/automation/refresh-state-snapshots.yml.disabled`, outside the workflow
folder, and its job is also explicitly disabled. It specifies a fixed concurrency
group with no cancellation of running work. This combines scheduler serialization
with durable reservations, including protection across cold starts and failed
runs. The camera *directory* refreshes every six hours; source image updates remain
independent. Snapshots older than six hours are labelled stale, and those older
than 48 hours fail closed. GitHub scheduled execution can be delayed; this is not
a real-time ingestion promise. See [GitHub concurrency documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
and [scheduled workflow behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

No workflow, branch, permission or secret has been installed. No real provider
request or snapshot publication has occurred. Activation needs reviewed/pinned
checkout and Node setup steps and explicit approval for repository contents write
permission. The standard built-in repository-scoped GITHUB_TOKEN is sufficient;
no personal access token or new storage service is needed. The data branch must
be explicitly initialized with this credential-free ledger before first use:

```json
{"schemaVersion":1,"states":{"AZ":{"lastAttemptMs":0},"GA":{"lastAttemptMs":0},"WI":{"lastAttemptMs":0}}}
```

Exclude the data-only branch from Vercel preview builds before enabling frequent
updates, using an approved build-ignore configuration rather than deploying data
commits as applications. Never enable refreshes on pull requests or forks.

## Secure configuration and release checklist

For the recommended snapshot approach, the owner enters approved provider keys
as GitHub Actions secrets in the existing `scottew/monitor-the-situation`
repository, using the names above. Only the corresponding fetch step receives each
secret. Do not put these keys in Vercel, browser code, Git files, logs, or chat.
Approval must cover the scheduled provider requests, public normalized snapshots
on the data branch, and workflow contents write permission. Wisconsin remains
omitted from the workflow until its separate consent requirement is settled.

The existing frontend continues on Vercel project `monitor-the-situation`, ID
`prj_kXs4xEPQULwm2utCQhciebHLsXYl`, under Scott's existing team. Its public snapshot
reader requires no credentials. Creating production state hostnames remains a
separate release step after preview validation.

After configuration, validate each approved source with a bounded authenticated
request, inspect normalized counts and sample snapshots, and verify error
redaction, attribution, mobile camera sharing and stale-directory notices. Only
then enable the matching state UI and provision its approved subdomain through
the existing host. Do not activate Wisconsin without explicit written reuse
consent. Do not claim any prepared state is live based on unit-test fixtures.
