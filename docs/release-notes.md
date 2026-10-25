# Paperlane 0.4.3

- Preserve CSS block-label boundaries and explicit multiline text when simplifying HTML. Layout inspection runs locally with scripts and resource loading blocked.
- Convert HTML tables to labeled reading lists by default, including captions, merged columns and row spans. The preview can opt back into table markup.
- Rasterize SVG diagrams using their intrinsic size or viewBox instead of the browser's 300-pixel fallback, with bounded 2× scaling.
- Keep internal link labels as text and numeric citations in brackets so Instapaper cannot discard their anchor content. Convert a distinct source headline to a secondary heading; Instapaper may still suppress headings similar to its saved title.
- Check card text, captions and lower-level headings during saved-content verification.

## Paperlane 0.4.2

- Remove manual helper-token entry for AWS profiles. The plugin and local helper automatically authenticate using a short-lived challenge in the exported helper directory.
- Verify the helper response, reject expired/replayed challenges, and clean up temporary files through Vault API. Helper credentials remain out of plugin data and the vault.
- Preserve AWS profile, region and model settings. Defaults remain us-west-2, global.openai.gpt-6-astra and low reasoning.
- Existing helper installations need one re-export and restart. No token copying is required.

Validation: 69 TypeScript tests and eight helper tests, lint, type checking, and build. An authorized AWS CLI smoke test returned PAPERLANE_OK using the default profile and the above model/region/effort (17 input tokens, 9 output tokens). No vault document was uploaded. The live Obsidian/helper path remains separate from this AWS access check.
