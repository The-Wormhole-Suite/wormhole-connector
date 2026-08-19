# Wormhole Connector Roadmap

Last updated: 2026-08-20

## Current status

The core release-hardening work for Wormhole Connector is implemented. The extension has been renamed consistently, release blockers were addressed, Pi-hole session and multi-instance handling were hardened, backup/import/sync support was added without storing credentials, eight locales are included, and AdGuard Home support is implemented for the agreed self-hosted scope.

Automated validation from the prepared release state completed successfully, including TypeScript/Vue checks, linting, formatting, tests, `web-ext` validation, dependency audit, browser packaging, matching source packaging, and SHA-256 checksum generation.

The release baseline is now frozen on branch `release/public-hardening-candidate` at commit `163c3e51a00d3ac0a5997566fd3be755b689af9c`. That exact commit contains the release-hardening work, the current Wormhole GUI/icon state, and corrected repository metadata. GitHub Actions CI run `31962091061` completed successfully on that commit. The branch deliberately remains on source version `5.0.1` for now; a new unique public release version must be chosen only after the real-system/browser verification gate, because `v5.1.0-beta.1` and `v5.1.0-beta.2` have already been published as prereleases.

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
- [x] Record the exact release-candidate commit: `163c3e51a00d3ac0a5997566fd3be755b689af9c`.
- [x] Confirm GitHub Actions CI passes on that exact commit (`31962091061`).

## Public release preparation

- [ ] Confirm one unique release version in `package.json` and both source manifests.
- [x] Run `npm ci --no-audit --no-fund` from a clean GitHub Actions checkout (CI also uses `--prefer-offline`).
- [x] Run `npm run check` from the frozen release-candidate commit.
- [x] Run `npm run package:artifacts` from the frozen release-candidate commit.
- [x] Generate and upload `SHA256SUMS.txt` from the frozen release-candidate commit; final-version artifacts must be regenerated after version selection.
- [x] Confirm the intended Wormhole artwork is present in the frozen release-candidate branch.
- [ ] Confirm Pi-hole and AdGuard third-party disclaimers.
- [ ] Confirm all eight locales in the store listing.
- [ ] Publish privacy policy and permission explanations.
- [ ] Confirm packaged legal files and third-party notices.
- [ ] Upload the unsigned XPI/source archive to Mozilla using `AMO_REVIEWER_NOTES.md`.
- [ ] Upload the ZIP to the Chrome Web Store.
- [ ] Replace developer-installation instructions with store links after publication.
- [ ] Never reuse a manifest version between prerelease and stable release.

## Deferred / future work

- [ ] Evaluate private AdGuard DNS Cloud integration as a separate feature after the self-hosted release is stable.
- [ ] Revisit Firefox Android support after explicit compatibility testing.
- [ ] Continue UI/visual refinements only after release-critical functionality is validated, unless a visual defect blocks usability.

## Next recommended sequence

1. Perform the real Pi-hole v6 and AdGuard Home integration matrix above against `release/public-hardening-candidate`.
2. Perform Firefox and Chromium desktop checks against the same candidate.
3. Choose one new, unique release version (do not reuse `5.0.1`, `5.1.0-beta.1`, or `5.1.0-beta.2`).
4. Apply that version consistently to `package.json` and both source manifests.
5. Re-run the complete CI/package/checksum pipeline on the versioned final release commit.
6. Publish to the stores only after the hardware/browser checks pass.
