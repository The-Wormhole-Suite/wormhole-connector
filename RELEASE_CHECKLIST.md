# Release Checklist

## Code and behavior

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

- [ ] Firefox Desktop 140 or later.
- [ ] Current Chrome or Chromium Desktop.
- [ ] Do not advertise Firefox Android support until popup, file import, alarms, and synchronization have been tested there.

## Validation and artifacts

- [ ] Set one unique version in `package.json` and both source manifests.
- [ ] Run `npm ci --no-audit --no-fund` from a clean checkout.
- [ ] Run `npm run check`.
- [ ] Run `npm run package:artifacts`.
- [ ] Verify `SHA256SUMS.txt`.
- [ ] Upload the unsigned XPI to Mozilla and the ZIP to the Chrome Web Store.
- [ ] Upload the matching source archive and use `AMO_REVIEWER_NOTES.md` for Mozilla.
- [ ] Copy the reviewed text and permission explanations from `STORE_LISTING.md`.
- [ ] Never upload a prerelease and stable release with the same manifest version.

## Listing and legal

- [ ] Replace the inherited icon/design with independent Wormhole artwork before the public store release.
- [ ] Include the third-party Pi-hole and AdGuard disclaimers.
- [ ] List all eight included locales.
- [ ] Publish the privacy policy and permission explanations.
- [ ] Confirm `LICENSE.txt`, `NOTICE.txt`, `CREDITS.txt`, `PRIVACY.txt`, and `THIRD_PARTY_NOTICES.txt` are packaged.
- [ ] Replace developer-installation instructions with store links after publication.
