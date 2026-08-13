# Contributing

## Requirements

- Node.js 22 to 24
- npm with support for lockfile version 3

Use the committed lockfile for every clean installation:

```bash
npm ci --prefer-offline --no-audit --no-fund
```

Do not use `npm install` for normal development or CI. Use `npm run rebuild-package-lock` only when dependency declarations intentionally change, and commit the resulting `package-lock.json` together with `package.json`.

## Validation

Run the complete merge-relevant validation locally:

```bash
npm run check
```

This includes TypeScript checking, ESLint, Prettier, the complete Node test suite, Firefox and Chrome production builds, Mozilla `web-ext lint`, icon/reference validation and archive-content validation.

To prepare locally named packages and checksums after a successful build:

```bash
npm run package:artifacts
```

Generated directories and browser packages must not be committed.

## Pull requests

- Use `dev` as the integration branch. Normal pull requests should target `dev`; `master` contains release-ready code.
- Small, low-risk maintainer changes may be committed directly to `dev`. Larger or experimental changes should use a short-lived branch.
- Keep code, workflows, commit messages and pull-request text in English.
- Keep functional changes separate from CI, dependency or formatting-only changes.
- Update or add tests when behavior changes.
- Do not commit secrets, DNS-backend credentials, local configuration, generated archives or build output.
- Ensure `npm run check` succeeds before requesting review.
- Delete short-lived branches after their pull requests are merged or closed.
