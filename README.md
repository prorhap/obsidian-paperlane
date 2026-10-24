# Paperlane

Send Markdown and HTML files from your Obsidian vault to your personal Instapaper account as readable articles, with embedded local images and checks for missing content.

This is an independent community plugin project, not an official Obsidian or Instapaper product. **Version 0.2.1 is a development build under the new `paperlane` ID.** It targets desktop Obsidian 1.13.0 or later, with macOS as the initial validation platform. Installation and end-to-end testing inside Obsidian are still pending.

## Features

- Send the current Markdown note or choose a `.md`, `.html`, or `.htm` file from the vault.
- Preview the converted article and review conversion losses before sending.
- Preserve paragraphs, tables, code, footnotes, callouts, and readable wiki-link labels.
- Embed local PNG, JPEG, GIF, and WebP images; rasterize a restricted SVG subset to PNG.
- Save to Instapaper home or an existing private folder using the official API.
- Keep a local transfer journal and check uncertain results before allowing another upload.
- Export a standalone reading HTML file without connecting an account.

No LLM, image-hosting server, or email automation is required. Source notes are not modified.

## Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the matching GitHub release.
2. Create `<vault>/.obsidian/plugins/paperlane/`.
3. Copy the three files into that directory, preserving existing `data.json` when upgrading.
4. Restart Obsidian and enable **Paperlane** under **Settings → Community plugins**.

The published release contains only the three files Obsidian installs. Project and dependency license notices are embedded in `main.js`. A local ZIP with separate notices can still be built with `npm run package`. Do not place credentials inside the plugin directory. Use a test vault for development.

For an installation using the old ID, follow the [migration instructions](docs/06-usage.md#upgrade-to-paperlane-020) before enabling Paperlane.

## Quick start

1. Create a personal application through [Instapaper's application registration page](https://www.instapaper.com/developers/applications/create).
2. Open your application under [Your Apps](https://www.instapaper.com/developers/applications) and generate a personal access token.
3. In the plugin settings, choose an Obsidian secret-storage entry or select the environment-variable method. The default variable name is `INSTAPAPER_ACCESS_TOKEN`.
4. Check the connection and choose a destination.
5. Select a file, review its preview and image warnings, then send it.

The current interface uses Korean labels. The [usage guide](docs/06-usage.md) identifies the commands by stable command ID and explains both authentication methods, including a macOS launcher that reads the token without echoing it.

## Accounts, network access, and data

An **Instapaper account and a personal access token are required to send articles**. Local conversion and HTML export do not require an account. This plugin has no paid tier. A free account successfully saved and displayed the tested PNG article; this is not a guarantee of all future Instapaper service limits or account conditions.

The plugin connects to `https://www.instapaper.com/api/2` to check the account, list private folders, save a selected article, retrieve its parsed body, and reconcile uncertain transfers. Opening a preview may check the connection when credentials are configured. It does not save an article until you press send.

A save sends the article title, converted HTML (including embedded image bytes), selected folder ID, and a description containing a random recovery marker. It does not send the local file path as a separate API field. Content can still contain information you authored, including filenames in image labels. Review the preview before sending.

Remote HTTPS image references remain in the uploaded article. Instapaper or the reading client may request those images from their hosts. The plugin replaces remote images with placeholders in its local preview. Exported HTML retains remote image URLs, so opening that file can contact those hosts.

There is no plugin telemetry, advertising, automatic updater, or runtime dependency download. Instapaper processes uploaded content under its [privacy policy](https://www.instapaper.com/privacy).

The file picker inspects only the immediate children of the folder you browse; it does not build an inventory of every vault path. The plugin reads selected vault files and referenced images through `vault.read` and `vault.readBinary`, and writes exports through `vault.create`. Runtime code uses no Node filesystem or adapter APIs. It accepts only normalized relative paths for entries currently indexed by the same vault. Linked folders follow Obsidian’s vault semantics: physical symlink targets are not inspected, so this does not guarantee that bytes are physically inside the vault directory. Optional authentication reads one named process environment variable. The separate macOS launcher starts the installed Obsidian application; it is not run by the plugin.

Token values are not stored in plugin settings, transfer history, logs, or source code. Settings contain a secret-storage reference or environment-variable name. Transfer history contains account IDs, file paths, article titles, content hashes, timestamps, status notes, and remote bookmark IDs; it does not contain complete article bodies. Treat the vault's plugin data as potentially sensitive and subject to your own sync configuration.

## Image support and limitations

A live test on 2026-10-24 confirmed that a free Instapaper account saved a **354,289-byte PNG embedded in 472,669 bytes of HTML** and displayed it in the Instapaper web reader at **1696 × 770**. This establishes support for that sample, not a universal image or size guarantee.

- Mobile/offline image retention, other image formats on the live service, and larger documents remain unverified.
- Limits of 5 MiB per input document, 8 MiB per image, and 24 MiB per converted HTML body are plugin limits, not documented Instapaper limits.
- Mermaid, Dataview, mathematical notation, and interactive HTML are not fully rendered.
- The preview is not a replica of Instapaper's layout. A preserved image reference does not prove offline availability.
- Multi-device deduplication, PDF upload, bulk sending, and public-app OAuth are outside the current scope.

See [image findings](docs/05-image-findings.md) and the [validation record](docs/verification.md) for evidence and unresolved cases.

## Development

Use a recent Node.js release compatible with the pinned dependencies; the recorded local checks used Node.js 23.11.0 and npm 10.9.2.

```sh
npm ci
npm run check
npm run package
```

`check` runs typed lint, unit tests, manifest/README validation, notice generation, TypeScript checking, and bundling. `package` additionally creates a local installation archive and its SHA-256 checksum. These commands do not send articles or use a live account. Node.js and Electron APIs remain external to the browser-targeted CommonJS bundle; the plugin is explicitly desktop-only.

Tagged releases are built by [the release workflow](.github/workflows/release.yml) on GitHub Actions. It verifies the version and README title, tests and builds the plugin, generates build-provenance attestations, verifies them, and publishes only `main.js`, `manifest.json`, and `styles.css`. No personal token or Instapaper credentials are required. The workflow uses a temporary repository-scoped token and OIDC identity.

After downloading a release file, verify its provenance with:

```sh
gh attestation verify main.js --repo prorhap/obsidian-paperlane
gh attestation verify styles.css --repo prorhap/obsidian-paperlane
```

Earlier manually published releases have no such attestations. A checksum alone does not prove build provenance. Follow the [contributor and release guide](CONTRIBUTING.md) before tagging a version.

## Documentation

| Document | Purpose |
| --- | --- |
| [Requirements and UX](docs/01-product-and-ux.md) | Scope, expected behavior, and acceptance criteria |
| [Architecture](docs/02-architecture.md) | Conversion, credentials, API, journal, and recovery |
| [Implementation and validation plan](docs/03-plan-and-validation.md) | Completed work and remaining release gates |
| [Sources and decisions](docs/04-sources-and-decisions.md) | References and evidence boundaries |
| [Image findings](docs/05-image-findings.md) | Official documentation, user reports, and live tests |
| [Usage](docs/06-usage.md) | Installation, credentials, sending, and troubleshooting |
| [Obsidian guidelines review](docs/07-obsidian-guidelines.md) | Official guidance mapped to this project |
| [Directory review responses](docs/08-review-responses.md) | Changes and remaining warnings |
| [Validation record](docs/verification.md) | Checks performed and checks still pending |

## License

[MIT](LICENSE), copyright 2026 Chulwoo Choi. Bundled dependency notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
