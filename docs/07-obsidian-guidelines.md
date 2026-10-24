# Obsidian guidelines review

Reviewed on 2026-10-24 against the official documentation. This is a source-level readiness review, not Obsidian approval or proof that all runtime requirements pass.

## Official sources

- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies): binding policies for directory listings, including README disclosures and licensing.
- [Submission requirements for plugins](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins): plugin-specific requirements.
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines): common review recommendations; serious violations may require changes.
- [Submit your plugin](https://docs.obsidian.md/plugins/releasing/submit-plugin): release assets and directory submission.
- [Manifest reference](https://docs.obsidian.md/Reference/Manifest): metadata fields.

Policy and release source text was read from the official `obsidianmd/obsidian-developer-docs` repository. Requirements should be rechecked immediately before public submission.

## Review findings and actions

| Area | Current alignment | Remaining boundary |
| --- | --- | --- |
| README | English purpose, installation, usage, account/payment conditions, network destinations, uploaded data, local journal contents, external-file boundary, and license | Keep disclosures current as features change |
| Identity | Independent-product statement; plugin ID contains no Obsidian trademark; descriptive display name | Directory ID availability and trademark review are not established |
| Manifest | Short action-led description ending in a period; semantic version; author; minimum app version | Actual minimum-version runtime check pending |
| Desktop APIs | `isDesktopOnly: true` for Node filesystem/process/crypto usage | macOS is the initial target; other desktop platforms untested |
| Repository files | Root README, LICENSE, and manifest; third-party notices generated | Public release assets not published |
| Distribution | Manual ZIP plus documented individual main.js/manifest.json/styles.css assets | No directory submission or approval |
| Public APIs | Instance-scoped `this.app`, Vault/Editor reads, normalized export paths | Filesystem containment uses Node realpath intentionally |
| Commands | Appropriate conditional callback for current file; no redundant plugin ID or default hotkeys | Manual command/menu checks pending |
| Settings UI | Removed redundant plugin-name heading | Current interface remains Korean; full in-app UX review pending |
| DOM safety | Replaced direct innerHTML assignment with sanitized DocumentFragment insertion using `sanitizeHTMLToDom` | Test embedded images and footnotes through the additional sanitizer inside Obsidian |
| Styles | Scoped classes and Obsidian theme variables | Light/dark theme and keyboard checks pending |
| Events | Vault events use `registerEvent`; commands use lifecycle APIs | Inspect disable/re-enable while requests or modals are active |
| Resource cleanup | Temporary SVG object URLs and request timers are cleaned up | In-flight transport cannot be aborted by current requestUrl usage |
| Logging | No routine runtime console logs; controlled API error messages | Inspect actual developer console during smoke testing |
| Telemetry and updates | No client telemetry, advertising, self-update, or runtime dependency installation | Build-time npm installation is separate from plugin runtime |
| Credentials | Secret reference or environment name only in settings; explicit source selection | Environment access is not a sandbox or encrypted store |
| Source organization | Focused TypeScript modules under src | Further folder extraction is optional as the code grows |

## Changes made during this review

All authored Markdown documentation was rewritten in English and updated to distinguish implemented behavior from original proposals. The README now contains the disclosures expected by developer policies. A contributor/release guide explains testing and the raw release assets needed by Obsidian.

The settings page no longer adds a redundant top-level plugin heading. The article preview now appends a sanitized fragment through the public Obsidian API instead of assigning HTML directly. The article-specific sanitizer still runs first to enforce image and link rules.

The original Korean fixtures and interface strings are not documentation and remain unchanged. They include Unicode coverage that should not be lost during a future localization change.

## Before submission

Complete the real Obsidian and reading-device matrix, inspect unload behavior, verify the lowest supported Obsidian version, recheck dependency/license notices and token exclusion, and publish the exact raw assets with a matching version tag. The current development package must not be presented as community-approved.
