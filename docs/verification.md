# Validation record

Date: 2026-10-24. Version: 0.1.0 development build.

Release correction on the same date: 0.1.1 changes the rejected `send2instapaper` ID to `send-to-instapaper`. The original API/browser observations below were made before this metadata change. The 39-test suite and build are rerun for 0.1.1, with an added build-time manifest/version validator. This does not establish the pending in-app checks.

## Recorded checks

| Check | Result |
| --- | --- |
| TypeScript and esbuild | Passed before and after the documentation/guidelines update |
| Automated tests | 39 passed, including five credential-source tests |
| Markdown/HTML fixtures | Text, tables, footnotes, code, Korean, wiki links, and callouts passed |
| Image fixtures | Data URI generation, mappings, lazy loading, srcset, picture, and SVG filtering passed |
| Missing-image checks | Detect removed img elements, reduced counts, and metadata-only image lists |
| Workflow fixtures | Account/folder checks, duplicates, lost/late responses, parse failure, and journal failure passed |
| Credential fixtures | Explicit source, default/custom variable, missing/invalid values, old settings, and value-free errors passed |
| macOS launcher | zsh syntax check passed; real launch/inheritance not tested |
| Generated HTML in a browser | Earlier test decoded a 640 × 260 embedded PNG |
| Offline generated HTML | Earlier browser test displayed the embedded PNG and final footnote text |
| Narrow layout | Earlier 390px generated-HTML screenshot inspected |
| Live free-account authentication | Earlier /me request returned 200 with premium=false |
| Live HTML saving and retrieval | Earlier HTTPS control and base64 sample both succeeded |
| Exact embedded PNG reference | 354,289-byte PNG in 472,669-byte HTML retained its src |
| Instapaper web reader | Earlier visual check displayed the base64 PNG at 1696 × 770 |

Earlier browser checks injected the generated HTML string into a browser because localhost/file navigation was unavailable in that connection. These were standalone HTML checks, not tests of the Obsidian plugin UI.

The generated demo HTML and screenshots under `output/playwright/` are earlier Korean-language test artifacts. They are not English UI screenshots or evidence of a later Obsidian installation.

## Documentation and guidelines review

Official developer policies, submission requirements, plugin guidelines, and release instructions were read on 2026-10-24. The authored Markdown documentation is now English. README disclosures, installation guidance, and release instructions were expanded.

Code changes remove a redundant settings heading and replace direct preview innerHTML assignment with `sanitizeHTMLToDom` fragment insertion after the existing article sanitizer. Unit tests and bundling do not exercise Obsidian's implementation of that additional sanitizer; its image/footnote behavior still requires an in-app test.

## Not yet verified

- Plugin installation and SecretComponent behavior in actual Obsidian.
- Environment-variable inheritance in the launched Obsidian session.
- Embedded images after Obsidian's additional DOM sanitization.
- Disable/re-enable behavior with active modals or network requests.
- Minimum supported Obsidian version and non-macOS desktop environments.
- Live-service non-PNG images and larger documents.
- Mobile reading and offline image retention.
- Instapaper's maximum HTML request size.
- General SVG fidelity across documents and platforms.
- Community-directory acceptance or public release installation.

The automated suite uses mock transports. The earlier live account test used a separately supplied personal token and non-sensitive sample images. No token is needed by the test suite or included in the package.

## Next validation step

Install the package in a test vault, verify both credential methods and preview image retention, then send representative Markdown and HTML documents and inspect the target reading client offline. Record actual results before changing any pending item to passed.

## Paperlane rename

Version 0.1.2 changes the display name, preview branding, export footer, and new export folder to Paperlane. The existing plugin ID and recovery markers remain unchanged. The 39-test suite, manifest validation, TypeScript check, and package build are rerun for this release. Existing live-service evidence and pending manual checks retain their original scope.

## Directory-review improvements in 0.1.3

Local verification: 41 tests passed, including temporary-filesystem symlink checks and an isolated manifest/README/tag validator test. TypeScript, bundling, local packaging, workflow YAML parsing, and embedded project/dependency license checks passed.

The file picker now inspects one folder's immediate children instead of calling whole-vault enumeration APIs. Its in-app navigation still needs manual validation. Runtime Node filesystem usage is restricted to `realpath` metadata resolution; the automated generic filesystem warning may remain. External export directories are now rejected in addition to external source files.

Both the 0.1.1 and 0.1.2 tagged READMEs matched their respective tagged manifests. The directory displayed the older 0.1.1 name during the Paperlane update, so mixed review inputs are a possible explanation of the title warning. This is not proof of the reviewer's internal implementation. Build validation now requires the current README heading to match the current manifest exactly.

The release workflow builds tagged source on GitHub Actions, attests the three supported release files, verifies those attestations, and publishes them without extra attachments. Successful hosted execution and downloadable provenance must be verified separately from local workflow validation.

### Hosted release verification

On 2026-10-24, GitHub Actions run `40089857304` successfully built tag `0.1.3` from commit `324bab4045415de4499aa1b9750ed70a436124a2`. Tests, the build, artifact attestation generation, attestation verification, and release publication all passed.

The published release contains exactly `main.js`, `manifest.json`, and `styles.css`. All three were downloaded separately after publication; their GitHub asset SHA-256 digests matched, and `gh attestation verify --repo prorhap/obsidian-send2instapaper` passed for each downloaded file. The downloaded manifest identifies Paperlane 0.1.3 with ID `send-to-instapaper`.

This verifies published provenance, not community-review approval or the pending in-app/manual checks. Earlier release review results remain historical and do not describe the new artifact set.

## Version 0.1.4 local review and identity migration

On 2026-10-24, the plugin ID changed to `paperlane` and the destination repository to `prorhap/obsidian-paperlane`. Minimum Obsidian version is 1.13.0 for declarative searchable settings. Earlier release observations above retain their original IDs and repository references.

Typed ESLint checks passed for unnecessary assertions, unsafe assignments, aliasing `this`, control-character regexps, bare timers, and direct document element creation. All 44 tests passed. TypeScript and bundling passed. The build rejects runtime filesystem and shell imports. The four logical vault-boundary tests replace the physical symlink test because 0.1.4 deliberately follows Obsidian’s indexed-vault semantics.

Settings UI rendering and real Obsidian sending remain unverified. The public old-ID directory page was present, but native Obsidian searches for both `send to instapaper` and `Paperlane` returned no results. The official legacy community-plugins.json also lacked the old ID at the time of inspection; the exact directory-to-app propagation mechanism was not established. A new ID alone is not evidence that this search issue is fixed.
