# Contributing and releasing

Use English for repository documentation. Keep claims tied to the evidence in [the validation record](docs/verification.md), and distinguish local tests, actual Obsidian behavior, Instapaper API results, and reading-client display.

## Set up development

1. Clone the repository and run `npm ci`.
2. Run `npm run check`.
3. Use a disposable Obsidian vault for manual testing.
4. Run `npm run package` and copy `dist/send2instapaper/` into the test vault's `.obsidian/plugins/` directory.
5. Restart Obsidian or disable and re-enable the plugin after updating files.

Do not develop directly against irreplaceable vault data. Unit tests use synthetic documents and mocked API transports; running tests must not require a real token.

## Implementation conventions

Follow the [official-guidelines review](docs/07-obsidian-guidelines.md) and the linked official pages.

- Use `this.app` and public Obsidian APIs; avoid undocumented global application state.
- Prefer Vault/Editor APIs for vault content. Keep Node filesystem usage limited and justified.
- Register events through the plugin lifecycle and clean up resources.
- Use conditional command callbacks when appropriate and avoid default hotkeys.
- Use sentence case for English UI labels and scoped CSS with theme variables.
- Build UI with DOM APIs. Keep source HTML behind the conversion sanitizer and Obsidian's DOM sanitizer.
- Keep network access explicit and update README disclosures when data flow changes.
- Preserve source notes and do not silently expand uploads to other files or services.

The interface currently uses Korean strings. A future English/localized interface should be changed consistently across errors, commands, and tests; documentation translation alone does not constitute UI localization.

## Credentials and reports

Never commit actual tokens, local settings, or private test output. `.env`, `.env.*`, `*.local.json`, and `output/private/` are ignored. `.env.example` is allowed only for placeholders. The plugin itself does not load `.env` files.

Inspect the files that will actually be committed; `.gitignore` does not protect a file already tracked or deliberately force-added. Use dummy credentials in tests. Do not paste private note content, account data, tokens, or full request headers into issues.

## Checks before review

Run `npm run check` and `git diff --check`. For a package change, run `npm run package` and inspect the archive. Verify that `manifest.json`, `package.json`, the lockfile root version, and `versions.json` agree.

Documentation changes should keep relative links valid and report current behavior. Do not describe a planned test as passed. For rendering or lifecycle changes, run the appropriate manual Obsidian checks rather than treating the TypeScript build as UI validation.

## Prepare a release

1. Complete the applicable manual checks in [the validation plan](docs/03-plan-and-validation.md).
2. Select a semantic version in `x.y.z` format and update the manifest, package metadata/lockfile, versions mapping, and version-specific documentation.
3. Run `npm ci` and `npm run package` from the intended release revision.
4. Inspect `dist/send2instapaper/`, the ZIP, and `dist/SHA256SUMS` for unintended files or credentials.
5. Commit the reviewed source and metadata, then create a GitHub release with a tag exactly matching the manifest version. Do not add a `v` prefix.
6. Attach `main.js`, `manifest.json`, and `styles.css` as individual release assets. The ZIP may be an additional manual-install asset, but does not replace them.
7. Keep LICENSE and THIRD_PARTY_NOTICES available; the bundle references them and the manual package includes them. Include those notice files as additional release attachments as well.
8. Follow the current official community-directory submission process when ready to request listing.

The official submission guide reviewed on 2026-10-24 uses the Obsidian Community directory with linked Obsidian/GitHub accounts. Recheck it at release time instead of following older submission instructions from memory.

No build script commits, pushes, publishes a release, submits to the directory, or installs dependencies at plugin runtime.
