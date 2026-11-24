# Business roles on Skills and Suites

Business roles are optional, container-level discovery metadata. They do not grant access,
change platform/namespace RBAC, enter packages, or change publication, versions, visibility,
Suite membership, or member snapshots. Existing resources default to `[]`.

Use stable keys shared with consumers, for example `sales`, `customer-support`, or `finance.ap`.
Keys are case-sensitive, 1–64 characters, start with a lowercase ASCII letter, and contain
lowercase letters/digits separated by `-`, `_`, or `.`. No role dictionary or role provisioning
is required. A resource can have up to 32 distinct keys. Replacement deduplicates and sorts keys;
`null`, omitted fields, and invalid keys are rejected. An empty array explicitly clears roles.

## Read and replace

Both existing API surfaces support the metadata subresource:

```text
GET /api/v1/skills/{namespace}/{slug}/business-roles
PUT /api/v1/skills/{namespace}/{slug}/business-roles
GET /api/v1/suites/{namespace}/{slug}/business-roles
PUT /api/v1/suites/{namespace}/{slug}/business-roles
```

The same routes exist under `/api/web`. Request and response `data` have the shape:

```json
{"businessRoles": ["customer-support", "sales"]}
```

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
skillhub business-roles set @team/demo --type skill --role sales --role customer-support
skillhub business-roles set @team/demo --type suite --role sales --role finance.ap
skillhub business-roles set @team/demo --type suite --clear --json
```

`set` requires either repeatable `--role` or `--clear`. Conflicting or missing options fail
before a request. The command updates metadata on the selected registry and returns the final set.

## Search and discovery

Add one exact `businessRole` key to an existing search request:

```text
GET /api/v1/resources?businessRole=sales&resourceType=SKILL&page=0&size=20
GET /api/v1/resources?businessRole=sales&resourceType=SUITE&page=0&size=20
GET /api/v1/resources?businessRole=sales&page=0&size=20
GET /api/web/skills?businessRole=sales&page=0&size=20
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

This change starts at deployed upstream `v0.2.23`, commit
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
