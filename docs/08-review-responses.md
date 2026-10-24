# Responses to directory review

## README title mismatch

Version 0.1.1 used Send2Reader for Instapaper in both its tagged README and manifest. Version 0.1.2 uses Paperlane in both. The directory was still showing the older manifest during the rename. Refresh/review the matching release instead of reverting the name. Starting in 0.1.3, the build fails if the README heading and manifest name differ.

## Direct filesystem access

This warning identifies a real Node API import, but it does not describe the actual file operations performed. The only runtime filesystem function is `fs.promises.realpath`, used to resolve a selected source or export directory and reject symlinks outside the vault. File content operations use Obsidian's Vault API. Temporary-filesystem tests exercise internal and external symlinks, traversal, absolute paths, and similarly prefixed sibling directories.

The import is intentionally retained rather than hiding it or removing the containment check. README discloses its purpose. This is not a sandbox against another process changing paths between validation and use, and does not eliminate the broader privileges of desktop plugins. A generic warning can remain even when this behavior is intentional.

## Vault enumeration

The whole-vault `vault.getFiles()` picker is removed. Users browse immediate folder children and explicitly enter subfolders or return to their parent. Current-file and context-menu sending remain available. This does not revoke Obsidian's own internal vault index or other plugins' capabilities.

## Missing artifact attestations

The release workflow uses pinned official GitHub actions and GitHub's temporary token/OIDC identity. It builds the version tag, attests main.js, manifest.json, and styles.css, verifies the attestations, then publishes those exact files. A local checksum alone does not provide provenance. The hosted run must succeed before this item is considered delivered.

## Unsupported release attachments

New automated releases contain only main.js, manifest.json, and styles.css. LICENSE and third-party notices stay in source control and are embedded in main.js so installed copies still include the required notices. The manual ZIP and checksums remain local build outputs. Historical releases are not rewritten or deleted.

## Evidence boundaries

Local tests, hosted build/attestation verification, and community review are separate checks. None establishes actual Obsidian preview fidelity or mobile/offline behavior. See the validation record for the current boundary.
