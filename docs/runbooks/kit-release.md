# Runbook: release the bandwise-kit

The public repository `glacer06/bandwise-kit` (ADR-019) is generated from this monorepo by `scripts/kit-export`. Never edit the public repo by hand: change the monorepo, regenerate, review, push, tag. The kit holds `@bandwise/core`, `@bandwise/system-one-client`, `@bandwise/templates`, `@bandwise/cli`, the find-decisions skill, and the root files (license, community docs, CI and release workflows).

## 1. Regenerate

```sh
pnpm kit:export                      # writes dist-kit/ (gitignored)
pnpm kit:export ~/src/bandwise-kit   # or straight into a clone of the public repo
```

The export copies the kit files, rewrites what must not go public, writes the root files, and scans the result. It exits 1 if the scan finds anything: internal names, Linear ids, ADR or internal doc references, email addresses outside example domains, key-shaped strings, `.env` or key files, internal hostnames, or folders of the closed product. Fix the source or the export, never the scanner, unless the finding is a false positive.

Into an existing folder, it deletes everything except `.git` and `pnpm-lock.yaml`, and it refuses a non-empty folder that is not a kit checkout.

Read the summary it prints. It lists:

- files left out (the management API document, the private TypeSafe contract snapshots and their loader and test, a deliberate lint fixture)
- files moved (the example spec and state go to `examples/`)
- text replaced everywhere (`@acme.com` becomes `@example.com`)
- exact patches to single files, and tests dropped because they compare code with internal docs
- how many comments and test titles lost internal pointers

Each patch, phrase and dropped test must still match. When a source file changes, the export fails with the file name instead of shipping something half rewritten.

## 2. Check it standalone

```sh
cd ~/src/bandwise-kit            # or dist-kit
pnpm install                     # writes or updates pnpm-lock.yaml; commit it
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm bandwise run --local examples/email-triage.spec.json examples/email-triage.state.json
cd - && pnpm kit:export --scan ~/src/bandwise-kit   # scan again, now with dist/ and the lockfile
```

Then look at what npm would publish:

```sh
for p in core system-one-client templates cli; do (cd ~/src/bandwise-kit/packages/$p && npm pack --dry-run); done
```

Expect `dist/` (JavaScript and `.d.ts`, no tests, no source maps), `README.md`, `LICENSE` and `package.json`, plus `fixtures/` for system-one-client.

## 3. Review the diff

```sh
cd ~/src/bandwise-kit && git status && git diff
```

Read every changed file, not only the scan result. The scanner is a floor. Look for customer or org names, anything that reads like an internal plan, and comments that no longer make sense after a rewrite. If a comment reads badly, fix the monorepo comment or add a phrase to `PHRASES` in `scripts/kit-export/src/export.ts`.

## 4. Version, push and tag

1. Set `KIT_VERSION` in `scripts/kit-export/src/export.ts` (all four packages share it), merge that in the monorepo, and regenerate.
2. In the kit clone, commit on `main` with a plain message ("Release 0.1.1: ..."), and push. CI runs lint, typecheck, test, build and a local run on Node 22.
3. Tag the same commit and push the tag:

```sh
git tag v0.1.1 && git push origin v0.1.1
```

`release.yml` checks that the tag matches every package version, runs the full check again, packs each package with `pnpm pack` (which writes real versions in place of `workspace:` and `catalog:` ranges) and publishes core, system-one-client, templates and cli in that order with `npm publish --provenance --access public`. A version already on npm is skipped, so a failed run can be re-run.

Creating the public repo and the first push are Nick's call. When the repo is created: make it public, enable **Settings > Code security > Private vulnerability reporting** (SECURITY.md points reporters there), and protect `main` so the CI check must pass.

## 5. npm trusted publishing (one time, Nick)

The release workflow has no npm token. It authenticates with GitHub's OIDC token (`permissions: id-token: write`) through npm trusted publishing.

1. Own the npm org `bandwise` (the `@bandwise` scope) on npmjs.com. Your npm account needs two-factor authentication, and npm now allows only security keys or passkeys for 2FA, so register one first.
2. For each package, `@bandwise/core`, `@bandwise/system-one-client`, `@bandwise/templates` and `@bandwise/cli`, open the package's **Settings** on npmjs.com, find **Trusted publishing**, choose **GitHub Actions**, and enter:
   - organization or user: `glacer06`
   - repository: `bandwise-kit`
   - workflow filename: `release.yml`
   - environment: leave empty (the workflow uses none)
3. npm sets trusted publishers per package. If it does not let you add one for a package that was never published, publish that package's first version once by hand from your machine (`pnpm pack` in the package folder, then `npm publish <tarball> --access public --provenance=false`, confirming with your security key), then add the trusted publisher. `--provenance=false` is needed because the packages ask for provenance, which npm can only generate in CI. This is how 0.1.0 went out on 2026-09-28. The workflow skips versions already on npm.
4. Once a tagged release has published through the workflow, set each package's publishing access to **Require two-factor authentication and disallow tokens**, and revoke any npm tokens you created. From then on only `release.yml` in `glacer06/bandwise-kit` can publish.

## 6. If something goes wrong

- A bad release: publish a fixed patch version and run `npm deprecate @bandwise/<pkg>@<version> "<reason>"`. Do not rely on unpublishing; npm limits it, and ADR-019 keeps released Apache-2.0 versions available.
- Something private shipped: tell Nick at once, deprecate the version, rotate any exposed key, and add a scanner rule and a test for it before the next export.

## Changing what the kit contains

The lists live in `scripts/kit-export/src/export.ts`: `SOURCES`, `EXCLUDED`, `MOVES`, `GLOBAL_REPLACEMENTS`, `PATCHES`, `PHRASES` and `DROPPED_TESTS`. Hand-written kit files (license, community docs, workflows, the kit's own ESLint and tsconfig package) live in `scripts/kit-export/overlay/`. The README is generated in `scripts/kit-export/src/readme.ts` from the template pack. `pnpm --filter @bandwise/kit-export test` runs the export into a temp folder and checks the scan, the manifests, the workflows and the writing rules; it is part of `pnpm turbo test`.
