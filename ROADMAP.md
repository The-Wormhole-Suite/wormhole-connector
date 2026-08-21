# Wormhole Connector Roadmap

Last updated: 2026-08-22

## Current status

The core release-hardening work for Wormhole Connector is implemented. The extension has been renamed consistently, release blockers were addressed, Pi-hole session and multi-instance handling were hardened, backup/import/sync support was added without storing credentials, eight locales are included, and AdGuard Home support is implemented for the agreed self-hosted scope.

Automated validation from the prepared release state completed successfully, including TypeScript/Vue checks, linting, formatting, tests, `web-ext` validation, dependency audit, browser packaging, matching source packaging, and SHA-256 checksum generation.

The release baseline is frozen on branch `release/public-hardening-candidate`. The candidate branch is the canonical reference for real-system and browser verification; its tip must be revalidated whenever release-hardening changes are promoted to it. The current promoted candidate has passed the full branch CI/package/artifact pipeline after promotion through PR #60. The source deliberately remains on version `5.0.1` for now; a new unique public release version must be chosen only after the real-system/browser verification gate, because `v5.1.0-beta.1` and `v5.1.0-beta.2` have already been published as prereleases. Release tooling on `dev` enforces a one-command synchronized version update and rejects tag/package/lockfile/manifest mismatches before publication.

The remaining manual integration and browser checks are tracked centrally in issue #61. Test results must be recorded against the frozen candidate commit so a later source change cannot silently inherit an earlier hardware/browser validation result.

Repository-security follow-up in issue #62 is complete. GitHub Secret Scanning is enabled and its alert API reports zero open findings. The frozen candidate already contains the patched `nanoid` 3.3.18 override and code scanning reports no open alerts. GitHub still reports the related Dependabot alert on the older default `master` state; that stale default-branch dependency alert should clear when the validated candidate state is promoted to `master`. Push Protection should remain enabled where available; the connected GitHub MCP does not expose a direct readback of that repository setting.

Private AdGuard DNS Cloud integration is intentionally not part of the current release scope.

## Completed

- [x] Rename product consistently to Wormhole Connector.
- [x] Remove the inherited Google uninstall survey.
- [x] Fix URL and reverse-proxy path handling.
- [x] Preserve passwords containing leading, trailing, and internal spaces.
- [x] Add Firefox 140+ consent handling.
- [x] Harden migrations.
- [x] Deduplicate and browser-synchronize Pi-hole sessions.
- [x] Keep sessions temporary and log them out cleanly.
- [x] Harden multi-instance actions with preflight checks, mixed-state handling, rollback/recovery data, and browser-wide locking.
- [x] Add backup, import preview, and optional synchronization without credentials.
- [x] Add eight complete locales.
- [x] Add release, privacy, security, licensing, AMO, build, and store documentation.
- [x] Add AdGuard Home 0.107.58+ support for Basic Auth and reverse proxies.
- [x] Add AdGuard Home global protection and native pause handling.
- [x] Add AdGuard Home domain status and global/client-specific rule handling.
- [x] Add persistent AdGuard clients as scopes.
- [x] Preserve unsupported/complex foreign AdGuard rules.
- [x] Abort AdGuard full-rule writes when concurrent foreign changes are detected.
- [x] Keep private AdGuard DNS Cloud out of the current release scope.
- [x] Add monotonic browser-manifest release versions for alpha, beta, RC, and stable releases.
- [x] Add a synchronized release-version setter for `package.json`, `package-lock.json`, and both source manifests.
- [x] Make the release verifier reject tag, package, lockfile, manifest-version, and `version_name` mismatches.

## Release verification still required

These items require real systems or final browser/store interaction and should not be marked complete from automated tests alone.

### Pi-hole / AdGuard Home integration

- [ ] Test against at least one real Pi-hole v6 instance.
- [ ] Test against AdGuard Home 0.107.58 or later with global and client-specific rules.
- [ ] Test a mixed Pi-hole/AdGuard Home connector set and common scope names.
- [ ] Test two Pi-hole instances with different numeric IDs for the same group name.
- [ ] Test a missing group, offline second instance, partial write failure, and rollback recovery.
- [ ] Test simultaneous domain and group timer actions and browser restart recovery.
- [ ] Verify mixed global and group states are shown explicitly.
- [ ] Verify reverse-proxy paths ending in `/admin`, `/api`, and a custom prefix.
- [ ] Verify AdGuard Home root, `/control`, and reverse-proxy-prefix addresses.
- [ ] Modify AdGuard custom rules concurrently and confirm Wormhole aborts without overwriting them.
- [ ] Verify passwords containing leading, trailing, and internal spaces are preserved exactly on real systems.
- [ ] Verify export, preview, import, and every optional sync category without secrets.

### Browser verification

- [ ] Firefox Desktop 140 or later.
- [ ] Current Chrome or Chromium Desktop.
- [ ] Test Firefox Android popup, file import, alarms, and synchronization before advertising Android support.

## Release candidate baseline

- [x] Reconcile the current `dev` line with the release-hardening implementation.
- [x] Confirm the intended current Wormhole GUI and final icon assets are present.
- [x] Freeze the validated source state as `release/public-hardening-candidate`.
- [x] Treat the tip of `release/public-hardening-candidate` as the canonical candidate reference rather than duplicating a commit SHA in documentation.
- [x] Confirm GitHub Actions CI passes before promoting a new candidate state and confirm the promoted candidate tip passes the branch CI/package/artifact pipeline itself.
- [x] Run the full CI/package/artifact pipeline automatically on pushes to `release/public-hardening-candidate` as well as `dev`/`master`.

## Public release preparation

- [ ] Confirm one unique release version in `package.json` and both source manifests.
- [x] Provide `npm run version:set -- <semver>` to update package metadata, lockfile metadata, numeric browser versions, and manifest `version_name` fields together.
- [x] Provide `npm run verify:release -- v<semver>` as a mandatory release consistency gate.
- [x] Run `npm ci --no-audit --no-fund` from a clean GitHub Actions checkout (CI also uses `--prefer-offline`).
- [x] Run `npm run check` from the frozen release-candidate commit.
- [x] Run `npm run package:artifacts` from the frozen release-candidate commit.
- [x] Generate and upload `SHA256SUMS.txt` from the frozen release-candidate commit; final-version artifacts must be regenerated after version selection.
- [x] Confirm the intended Wormhole artwork is present in the frozen release-candidate branch.
- [x] Confirm Pi-hole and AdGuard third-party disclaimers in `NOTICE` and the store listing.
- [x] Confirm all eight packaged locales are represented in `STORE_LISTING.md`.
- [x] Prepare the privacy policy and store permission explanations in `PRIVACY` and `STORE_LISTING.md`.
- [x] Confirm the frozen candidate contains the patched `nanoid` 3.3.18 override.
- [x] Confirm GitHub code scanning currently reports no open alerts.
- [x] Enable GitHub Secret Scanning and re-check the repository: zero open findings; issue #62 closed.
- [ ] Confirm Push Protection remains enabled in repository settings before public store publication; the connected MCP cannot read this toggle back directly.
- [ ] Ensure the validated dependency state reaches `master` so the stale default-branch `nanoid` Dependabot alert is cleared.
- [ ] Publish/link the final privacy policy in the actual store submissions.
- [x] Confirm both browser packages require and validate `LICENSE.txt`, `NOTICE.txt`, `CREDITS.txt`, `PRIVACY.txt`, and `THIRD_PARTY_NOTICES.txt`.
- [ ] Upload the unsigned XPI/source archive to Mozilla using `AMO_REVIEWER_NOTES.md`.
- [ ] Upload the ZIP to the Chrome Web Store.
- [ ] Replace developer-installation instructions with store links after publication.
- [ ] Never reuse a manifest version between prerelease and stable release.

## Deferred / future work

- [ ] Evaluate private AdGuard DNS Cloud integration as a separate feature after the self-hosted release is stable.
- [ ] Revisit Firefox Android support after explicit compatibility testing.
- [ ] Continue UI/visual refinements only after release-critical functionality is validated, unless a visual defect blocks usability.

## Next recommended sequence

1. Perform and record the real Pi-hole v6 and AdGuard Home integration matrix in issue #61 against `release/public-hardening-candidate`.
2. Perform and record Firefox and Chromium desktop checks in issue #61 against the same candidate.
3. Choose one new, unique release version (do not reuse `5.0.1`, `5.1.0-beta.1`, or `5.1.0-beta.2`).
4. Apply it with `npm run version:set -- <semver>` so package metadata, lockfile metadata, both numeric manifest versions, and both `version_name` fields stay synchronized.
5. Verify it with `npm run verify:release -- v<semver>` and re-run the complete CI/package/checksum pipeline on the versioned final release commit.
6. Promote the validated release state to `master`, confirm the default-branch Dependabot alert clears, confirm Push Protection in repository settings if available, and publish to the stores only after all release gates pass.
