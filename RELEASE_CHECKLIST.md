# Release Checklist

Release candidate: tip of `release/public-hardening-candidate`

Resolve and record the branch tip before every real-system/browser test session and use that exact commit for the whole session. Record failures before changing the candidate; fixes must be made on `dev`, validated, and only then promoted to the candidate branch.

## Code and behavior

For every real-system test, record backend/version, URL shape (root/reverse proxy), browser, candidate commit, result, and any recovery action required.

- [ ] Test against at least one real Pi-hole v6 instance.
- [ ] Test against AdGuard Home 0.107.58 or later with global and client-specific rules.
- [ ] Test a mixed Pi-hole/AdGuard Home connector set and common scope names.
- [ ] Test two Pi-hole instances with different numeric IDs for the same group name.
- [ ] Test a missing group, an offline second instance, a partial write failure, and rollback recovery.
- [ ] Test simultaneous domain and group timer actions and browser restart recovery.
- [ ] Verify mixed global and group states are shown explicitly.
- [ ] Verify reverse-proxy paths ending in `/admin`, `/api`, and a custom prefix.
- [ ] Verify AdGuard Home root, `/control`, and reverse-proxy-prefix addresses.
- [ ] Modify AdGuard custom rules concurrently and confirm Wormhole aborts without overwriting them.
- [ ] Verify passwords containing leading, trailing, and internal spaces are preserved exactly.
- [ ] Verify export, preview, import, and every optional sync category without secrets.

## Browsers

For each browser test, record browser/version, OS, candidate commit, result, and any issue/commit used to fix a failure.

- [ ] Firefox Desktop 140 or later.
- [ ] Current Chrome or Chromium Desktop.
- [ ] Do not advertise Firefox Android support until popup, file import, alarms, and synchronization have been tested there.

## Validation and artifacts

- [ ] Choose one new unique semantic release version.
- [x] Use `npm run version:set -- <semver>` for the synchronized package/lockfile/manifest update; do not edit release versions independently.
- [x] Keep human-readable SemVer in manifest `version_name` while using monotonic four-component numeric manifest versions.
- [x] Run `npm run verify:release -- v<semver>` before the full release pipeline; it must reject any tag/package/lockfile/manifest mismatch.
- [x] Run `npm ci --no-audit --no-fund` from a clean checkout (GitHub Actions also used `--prefer-offline`).
- [x] Run `npm run check` on the frozen candidate.
- [x] Run `npm run package:artifacts` on the frozen candidate.
- [x] Generate and upload `SHA256SUMS.txt` for the frozen candidate. Regenerate it after selecting the final unique version.
- [ ] Upload the unsigned XPI to Mozilla and the ZIP to the Chrome Web Store.
- [ ] Upload the matching source archive and use `AMO_REVIEWER_NOTES.md` for Mozilla.
- [ ] Copy the reviewed text and permission explanations from `STORE_LISTING.md`.
- [ ] Never upload a prerelease and stable release with the same manifest version.

## Listing and legal

- [x] Confirm the independent Wormhole artwork intended for release is present.
- [x] Include the third-party Pi-hole and AdGuard disclaimers.
- [x] List all eight included locales.
- [x] Prepare the privacy policy and permission explanations.
- [ ] Publish/link the final privacy policy in the store submissions.
- [x] Confirm package validation requires `LICENSE.txt`, `NOTICE.txt`, `CREDITS.txt`, `PRIVACY.txt`, and `THIRD_PARTY_NOTICES.txt` in both browser packages.
- [ ] Replace developer-installation instructions with store links after publication.
