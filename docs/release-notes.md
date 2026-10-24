# Paperlane 0.1.4

- Move to the `paperlane` plugin ID and `prorhap/obsidian-paperlane` repository.
- Read selected notes and referenced images only through the Vault API, with current-vault identity and relative-path checks. Remove Node filesystem access and reject runtime filesystem/shell dependencies during builds.
- Add searchable declarative settings, browser-window timers, Obsidian DOM helpers, and typed image mappings. Remove unnecessary type assertions and control-character regular expressions.
- Require Obsidian 1.13.0 or later.

Previous development installations need a manual migration: disable the old plugin, back up its `data.json`, install Paperlane, and copy the data file locally to retain settings and history. Reassign custom hotkeys. Never upload this file.

Linked folders follow Obsidian’s vault semantics; physical symlink targets are no longer inspected. This is a deliberate boundary change. Mobile/offline image retention and end-to-end in-app sending remain unverified.

Release assets are limited to `main.js`, `manifest.json`, and `styles.css`, with GitHub build-provenance attestations. License notices are embedded in `main.js`.
