# Business roles on Skills and Suites

Business roles are optional, container-level discovery metadata. They do not grant access,
change platform/namespace RBAC, enter packages, or change publication, versions, visibility,
Suite membership, or member snapshots. Existing resources default to `[]`.

Role choices are a fixed, server-configured vocabulary. The UI displays the configured name;
requests, URLs, CLI and storage use its case-sensitive key. No business-specific defaults are
shipped: `skillhub.business-roles.options` defaults to `[]`. An empty catalog permits clearing
metadata but rejects assigning any key.

Keep real deployment choices in an external configuration file outside version control. For
example, an ignored local YAML file can be loaded with
`SPRING_CONFIG_ADDITIONAL_LOCATION=file:/absolute/path/to/private-config.yaml`. Normal Spring
Boot external configuration (including `SPRING_APPLICATION_JSON`) can also supply the list:

```yaml
skillhub:
  business-roles:
    options:
      - key: ExampleTeam-engineering
        name: Engineering
      - key: ExampleTeam-sales
        name: Sales
```

These are illustrative values, not defaults. Do not commit organization-specific choices.
No role-management platform or database dictionary is added. Restart Server and refresh the
browser after changing configuration. Duplicate/invalid keys and blank names fail startup;
declaration order controls the choice order.

`GET /api/v1/business-roles/options` (also `/api/web`) returns the complete configured list as
`data: [{"key":"ExampleTeam-engineering","name":"Engineering"}, ...]`, even when no resource uses a choice.
This public vocabulary does not reveal resource usage or grant access.

Keys are 1–64 ASCII letters/digits, start with a letter, and may use `-`, `_`, or `.` separators.
Case is preserved: `ExampleTeam-engineering` and `exampleteam-engineering` are different keys. Writes accept
only configured keys, deduplicate and sort them, with up to 32 distinct values. `null`, omitted
fields, malformed or unconfigured keys are rejected; `[]` explicitly clears roles.

Existing stored values are not rewritten or deleted when they leave the catalog. GET and exact
search remain compatible with these keys. The UI marks them as unconfigured, permits cancel
without writing, and requires explicit removal before saving a configured replacement.

## Read and replace

Both existing API surfaces support the metadata subresource:

```text
GET /api/v1/skills/{namespace}/{slug}/business-roles
PUT /api/v1/skills/{namespace}/{slug}/business-roles
GET /api/v1/suites/{namespace}/{slug}/business-roles
PUT /api/v1/suites/{namespace}/{slug}/business-roles
```

The same routes exist under `/api/web`. The replacement request has the shape:

```json
{"businessRoles": ["ExampleTeam-delivery", "ExampleTeam-sales"]}
```

GET and PUT response `data` also include `canManageBusinessRoles`, computed from the same
server policy that authorizes writes. Clients use it for the edit affordance; it is not accepted
as an authorization input.

PUT replaces the complete set atomically. GET returns current container metadata, including for
older versions, rather than a version snapshot. Reads apply existing source/detail visibility.
Writes require authentication and the existing management rights: Skill owner or namespace
OWNER/ADMIN or SUPER_ADMIN; Suite management follows the existing `canCreateVersion` policy
(creator with current namespace membership, namespace OWNER/ADMIN, or SUPER_ADMIN).
API tokens additionally require `skill:publish` for writes. Session writes retain CSRF protection.
Role values themselves never authorize a read or write. Successful replacements are audited
with the previous and resulting sets. Concurrent replacements serialize on the container row.

Skill coordinates retain the existing current-user/published resolution behavior used by label
management. A Suite and a Skill with the same coordinate remain separate resources.

## CLI management

Use the existing CLI's registry and credential resolution (`--registry`, `SKILLHUB_REGISTRY`,
saved registry; `--token`, `SKILLHUB_TOKEN`, saved credentials). No separate login is needed.

```sh
skillhub business-roles get @team/demo --type skill --json
skillhub business-roles set @team/demo --type skill --role ExampleTeam-sales --role ExampleTeam-engineering
skillhub business-roles set @team/demo --type suite --role ExampleTeam-sales --role ExampleTeam-engineering
skillhub business-roles set @team/demo --type suite --clear --json
```

`set` requires either repeatable `--role` or `--clear`. Conflicting or missing options fail
before a request. The command updates metadata on the selected registry and returns the final set.

## Search and discovery

Add one exact `businessRole` key to an existing search request:

```text
GET /api/v1/resources?businessRole=ExampleTeam-sales&resourceType=SKILL&page=0&size=20
GET /api/v1/resources?businessRole=ExampleTeam-sales&resourceType=SUITE&page=0&size=20
GET /api/v1/resources?businessRole=ExampleTeam-sales&page=0&size=20
GET /api/web/skills?businessRole=ExampleTeam-sales&page=0&size=20
```

`/api/web/resources` supports the same filter. Omit `businessRole` to keep previous behavior;
blank or malformed keys return 400. A valid unknown key returns an empty page. A key matches
any one of a resource's assigned keys, with exact equality (no prefix or substring matching).
Read role arrays through the metadata endpoints above; existing search item shapes stay compatible.

Source ACLs and business-role predicates are applied in the database before pagination and
before total counting. Existing namespace, label, keyword, sort, and resource-type filters still
compose with them. Private resources remain absent from marketplace discovery even for managers.
No search-index refresh is needed when business roles change.

## Baseline, migration, and development verification

The configured-catalog follow-up starts from the verified deployed company commit
`6f769ab75e5aa5ee00a4413ad9ebc84ae8b9a4cc`. Existing association tables support these keys as-is;
this adjustment needs no schema migration or role-data backfill.

The original role implementation starts at upstream `v0.2.23`, commit
`2fe1a44059f51c1fa2e72ea3f1f3d59942e1e8be`, rather than the fork's default company branch.
Sealos Deployment and running Pod inventories were read on 2026-11-24 for Server and Web;
both were on the enterprise mirror's `v0.2.23`. Both mirror image configurations declare the
same source commit in `org.opencontainers.image.revision`; upstream's annotated `v0.2.23`
tag peels to that commit. Suite already exists at this baseline.

Mirror registry manifest digests observed at verification time:

- Server: `sha256:6469a122424044bc50f1c8dc25d6f4a2f5e58c34ba41bfc2a1e0aa5a3b32c73c`
- Web: `sha256:effe66b642dbaebbf8be45c2dcb45135b4236b57291cc52a28ac7c7956b84d1f`

These are registry digests; the Console's Pod inventory exposes image references, not running
container `imageID` digests. The evidence establishes running tag → mirror OCI revision →
source/tag commit, without asserting byte identity to a Pod imageID or to the public multiarch index.

`R__company_business_roles.sql` adds two company-prefixed association tables with unique `(container_id, role_key)` primary keys and
role-key lookup indexes. The additive DDL uses `IF NOT EXISTS`; Flyway runs it after versioned
upstream migrations, once per checksum. It does not consume an upstream version number or require
`outOfOrder`. Keep later edits additive and idempotent; do not use a repeatable script for destructive
data transformations. More complex company migrations should use a separate history stream.
Old rows need no backfill. Foreign keys cascade only these associations
when the container is deleted. Older application code ignores the new tables; rolling back the
application does not remove metadata. Apply normal database backup policy before any later
release. This development task does not deploy or migrate any shared environment.

Tests include upgrade from V75 with legacy resources and a subsequent simulated upstream V76, real PostgreSQL persistence and source
visibility, role replacement/clear, exact filtering and stable pages/totals, HTTP access denial,
existing token scopes, and CLI subprocess request/output/error contracts. Run backend tests with
`make test-backend-app`, CLI checks with `make lint-cli typecheck-cli test-cli build-cli`, and
Web API-consumer checks with `make typecheck-web`.

To exercise the built CLI against an isolated real HTTP server and PostgreSQL, first run
`make build-cli`, then from the repository root run:

```sh
./server/mvnw -f server/pom.xml -pl skillhub-app -am test \
  -Dtest=BusinessRoleCliSmokeTest -Dsurefire.failIfNoSpecifiedTests=false \
  -Dskillhub.cli.smoke=true -Dskillhub.cli.artifact="$PWD/cli/dist/index.js"
```

This opt-in test requires Node and Docker, creates only disposable test data and tokens, and
uses a random loopback server port. Backend CI does not require Node for ordinary tests.

## Web UI

Skill search and the Suite catalog use a selection-only single-role dropdown. Skill detail
and Suite management use a checkbox list for multiple roles. Both consume the same configured
options API; names are displayed and keys are submitted. There is no free-text role creation.
Filters and page are URL state; changing a role resets the page. Chips show names and link to
the matching typed discovery page. Clear, cancel, failed-save draft retention and identity-scoped
caches are preserved. An options-load failure disables selection/writes and offers retry.
Suite market detail stays read-only. Legacy URL filters can be cleared without rewriting data.

`GET /api/v1/business-roles` (also `/api/web`) remains a backward-compatible facet of role keys
on currently discoverable resources, with optional `resourceType`, `namespace`, and literal
case-sensitive prefix `q`. Private or otherwise undiscoverable resources do not contribute keys.
The new UI does not use this usage-based facet for its choices; it always uses `/options`.

Favorites retain their existing object-visibility policy, including accessible private resources.
`/api/web/me/stars` additionally accepts `businessRole`, `q`, `namespace`, and `sort`; filtering,
counting and pagination now occur together in the database. Public marketplace ACLs are unchanged.

The real browser regression is `web/e2e/business-roles.spec.ts`. It requires a loopback test server,
real PostgreSQL/Redis and local package storage. Load the synthetic choices from
`server/skillhub-app/src/test/resources/business-role-fixtures.yml` via external configuration
for this test only, with a disposable PostgreSQL container labeled
`skillhub-task=business-role-ui`. It publishes real private packages, clones their fixture graph for
pagination and seeds public visibility only in that isolated database. It does not change the public
scanner policy or upload rate limits. All role reads,
writes, discovery, login and permission checks use real HTTP. Set
`SKILLHUB_ROLE_E2E_PG_CONTAINER` to opt in and optionally `SKILLHUB_ROLE_E2E_SCREENSHOTS` to save
local screenshots. Cleanup addresses only the test's exact resource IDs.

The development-only `SKILLHUB_DEV_API_PROXY_TARGET` lets an isolated Vite process proxy to a
non-default backend port; its default remains localhost:8080.
