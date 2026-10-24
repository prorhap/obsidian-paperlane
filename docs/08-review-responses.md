# Directory review responses

## Identity and registration

Version 0.1.4 uses the name Paperlane, ID `paperlane`, and repository `prorhap/obsidian-paperlane`. The README heading matches the manifest. The new ID requires a separate installation; migration is documented in the usage guide.

## Vault API boundary

Runtime code no longer imports `fs`, `node:fs`, or filesystem adapters. Selected sources and referenced assets must be current-vault entries with normalized relative paths. Exports use `vault.create` after validating their destination. The bundler rejects runtime filesystem and shell dependencies. Node filesystem usage in build scripts and tests does not ship with the plugin.

Physical symlink targets are no longer checked. Files indexed by Obsidian in linked folders follow its vault semantics, even if their physical location is outside the vault. This replaces the 0.1.3 containment policy with the explicitly requested Vault API boundary.

## Source review warnings

Unnecessary type assertions are removed. Sanitizer roots are narrowed by checking their node type. Credential control characters are rejected by character codes. The journal uses the loaded jobs array without aliasing `this`. Timers use browser window APIs, with injectable scheduling for Node tests. Canvas and image elements use Obsidian helpers. Image URL overrides use a typed Map.

Settings implement `getSettingDefinitions()` with named searchable entries, English aliases, dynamic visibility, and `update()` after connection changes. The minimum app version is 1.13.0.

## Enumeration and release integrity

The picker lists only the browsed folder’s immediate children. Tagged builds publish only the three supported assets and attest them. The workflow independently verifies each attestation before publication.

Local tests and TypeScript checks do not prove Obsidian UI rendering or the external directory’s scan outcome. Those results are recorded separately in the validation record.
