# Custom SkillHub builds

This branch is based on upstream `v0.2.22` with optional `metadata.display-name`
support. The feature is contributed separately from `feat/skill-display-name`;
this workflow and this runbook are fork-only.

`Custom SkillHub Images` runs backend tests, frontend tests/typecheck/lint,
`make staging` in disposable GitHub Actions containers, and a real browser test
before publishing the server and web images using the upstream Dockerfiles.
No external environment is deployed. Scanner is unchanged; use upstream
`v0.2.22` when assembling a deployment.

Images support `linux/amd64` and `linux/arm64` and use immutable commit-based tags:

- `ghcr.io/raymondtc/skillhub-server:v0.2.22-custom-<12-character-commit>`
- `ghcr.io/raymondtc/skillhub-web:v0.2.22-custom-<12-character-commit>`

Each image also has a `sha-<full-commit>` tag. The workflow artifacts and summary
record the exact manifest digests. It never updates `latest` or official tags.
For a rebuild with changed base images, create a new commit so the image tag is
new; do not intentionally rebuild and overwrite an already published tag.

To update upstream, start a new `company/<official-tag>` branch from that tag,
cherry-pick the feature and fork CI commits, update `UPSTREAM_VERSION`, and push.
Resolve conflicts and let the complete checks pass before considering deployment.
If upstream releases this feature, retire the patch after checking metadata field
compatibility. Production deployment remains a separate reviewed operation in the
deployment repository.

Packages inherit this repository's access where supported. If anonymous pulls
are desired, set each GHCR package's visibility to public; otherwise consumers
need a token with read:packages. No personal token is stored in this workflow.

The original `@global/skillhub-cli` has a brief display-name note in custom
version `2.0.3-display-name.1`; `/registry/skill.md` carries the same format example.
The verified ZIP is bundled under `server/skillhub-app/src/main/resources/builtin-skills/`
and selected by its classpath manifest entry, so startup updates the existing system-owned
Skill without a second helper or an external package host. The existing checksum, package
validation, immutable-version, and publisher checks still apply.

When upgrading upstream, retain the short note in the CLI guide and matching
bootstrap guide, choose a new custom Skill version above the installed one, run
`make build-builtin-skills`, copy the resulting CLI ZIP into the bundled resources, and
update its manifest version, classpath location, and SHA-256 together. Keep the bundled
resource loader patch. Do not replace an already published Skill version's contents.
