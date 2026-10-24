# Implementation and validation plan

Updated 2026-10-24. The development build is implemented, but a successful build is not equivalent to an approved or fully tested Obsidian release.

## Completed implementation

| Area | Delivered behavior |
| --- | --- |
| Input | Active Markdown buffer, supported-file picker, file-menu action |
| Conversion | Static Markdown/HTML AST processing and allow-list sanitization |
| Images | Raster embedding, restricted SVG rasterization, lazy-image normalization, URL mappings |
| Credentials | SecretStorage or a named environment variable |
| Preview | Prepared body, editable title, destination, image states, loss acknowledgement |
| Saving | Official API client, account checks, private destinations |
| Recovery | Persist-before-POST journal, duplicate checks, uncertain-result reconciliation |
| Export | Standalone reading HTML without an account |
| Packaging | Build, tests, dependency notices, ZIP, SHA-256 checksum |
| Documentation | English user/developer guides and an official-guidelines review |

## Automated validation

`npm run check` runs the Node.js test suite, TypeScript checking, and esbuild. Tests use synthetic documents, dummy credentials, and mocked API transports. They do not send real articles.

Coverage includes:

- Korean and Unicode text, frontmatter, tables, code, footnotes, wiki links, and callouts.
- Lazy-loading attributes, srcset, picture, local image bytes, data URI validation, and SVG filtering.
- Unsafe tags and URLs, external-image suppression in preview, oversized input, and missing content warnings.
- Saved IDs, parser failures, duplicate prevention, account mismatch, private-folder checks, and changed content.
- Journal failure before POST, unknown outcomes, bounded reconciliation, and late save responses.
- Credential source selection, existing settings, empty variables, invalid names, and errors that do not expose token values.

Test names are the exact inventory of implemented assertions. Do not treat this list as proof of unimplemented device, network, or filesystem race tests.

## Required in-app validation

Use a disposable vault and non-sensitive documents before public distribution.

1. Install the packaged plugin in desktop Obsidian and enable it.
2. Check all three commands and the supported-file menu action, including HTML without a viewer.
3. Configure SecretStorage, restart Obsidian, and confirm that plugin `data.json` contains only a reference.
4. Launch with an environment variable, connect, and repeat with a missing variable. Verify that there is no fallback to a different account.
5. Inspect the preview after the added `sanitizeHTMLToDom` step: embedded PNGs, tables, code, footnotes, and external-image placeholders must remain readable.
6. Test title changes, loss acknowledgement, destination selection, and changed-source rejection.
7. Save Markdown and HTML samples; inspect returned IDs, full text, and images in Instapaper.
8. Test repeat sends, rename events, restart recovery, and token revocation with a controlled account.
9. Disable/re-enable the plugin and inspect for stale modals, late callbacks, listeners, and unexpected console output.
10. Check light/dark themes, keyboard focus, scrolling, and narrow windows.

## Required reader validation

Inspect a representative document in the target reading app. Record the client, platform, sample size, image formats, and test date. Confirm the final paragraph, footnote text, code, and tables, then synchronize, disconnect the network, and check images again.

The recorded free-account PNG web test is useful evidence but does not complete this matrix.

## Remaining engineering and service questions

| Question | Current boundary |
| --- | --- |
| Maximum accepted HTML size | No official limit established by this project |
| Non-PNG data URI compatibility | Local conversion tested; live service tests pending |
| Mobile/offline retention | Not tested |
| Obsidian additional DOM sanitization | Implemented; in-app image preservation pending |
| HTTP redirects with credentials | Fixed initial host; platform redirect behavior unverified |
| Unload during an active request | Lifecycle smoke test pending; transport is not abortable through the current API |
| Cross-device deduplication | Not implemented |
| Public OAuth and parser commercial terms | Separate review before expanding beyond personal tokens |
| Directory acceptance | Not submitted; official review still required |

## Release gate

A public release should require a clean build and test run, the in-app matrix above, representative Markdown/HTML saving, at least one reading-device check, and an accurate README disclosure review.

Prepare the raw release assets and a matching semantic-version tag. Follow [CONTRIBUTING.md](../CONTRIBUTING.md) and [the official-guidelines review](07-obsidian-guidelines.md). No Git commit, push, release publication, or community-directory submission is performed by the build scripts.
