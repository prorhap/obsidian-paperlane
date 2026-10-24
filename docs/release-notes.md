# Paperlane 0.1.3

- Browse one vault folder at a time instead of enumerating every vault file.
- Validate the README title against the manifest name during builds.
- Resolve local filesystem paths only to reject sources and export destinations outside the vault; actual file contents use the Vault API.
- Build and attest release files in GitHub Actions, then publish only main.js, manifest.json, and styles.css.
- Include the project and dependency license notices inside main.js.

The plugin ID remains send-to-instapaper. Existing settings and transfer history are preserved. The interface currently uses Korean labels.

Local conversion and workflow tests do not establish end-to-end Obsidian or mobile/offline compatibility. Refer to the validation record for completed checks and remaining manual checks.
