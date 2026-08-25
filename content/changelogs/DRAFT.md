# Changelog Draft

Use this file while implementing the next release. Keep the wording user-facing and concise.

## Added

<!-- Add new user-visible features here. -->

## Improved

<!-- Add user-visible improvements here. -->

## Fixed

<!-- Add resolved user-visible problems here. -->

## Release checklist

1. Move the finalized items into `releases.ts`.
2. Use the next permanent sequence number and the version from `package.json`.
3. Schedule `publishedAt` for 6:00 PM Philippine time (`10:00:00Z`).
4. Run `npm run changelog:lock` and `npm run changelog:validate`.
5. Reset this file to the empty template before committing the release.
