# Sources and design decisions

Reference review date: 2026-10-24. Instapaper references below were reviewed during the earlier implementation work; the Obsidian policy and submission pages were re-read during the English documentation update. Live-service evidence is recorded separately in [the validation record](verification.md).

## Primary references

| ID | Source | Relevance |
| --- | --- | --- |
| S1 | [Instapaper authentication](https://www.instapaper.com/developers/overview/authentication) | Personal tokens and bearer authentication; this is documentation, not the registration form |
| S2 | [Instapaper bookmarks](https://www.instapaper.com/developers/v2/reference/bookmarks) | HTML content, private_source, saving, listing, and parsing |
| S3 | [Instapaper account](https://www.instapaper.com/developers/v2/reference/account) | Account identity and premium state |
| S4 | [Instapaper errors](https://www.instapaper.com/developers/v2/reference/errors) | Authentication, permissions, rate limits, and API failures |
| S5 | [Obsidian API types](https://github.com/obsidianmd/obsidian-api/blob/9abd9605ce081383674aae1ed111c456edde0688/obsidian.d.ts) | SecretStorage, SecretComponent, requestUrl, and public APIs |
| S6 | [Instapaper API terms](https://www.instapaper.com/developers/overview/api-terms) | User-initiated actions, official APIs, and distribution considerations |
| S7 | [rehype-sanitize](https://github.com/rehypejs/rehype-sanitize/tree/b3ee205aeda4e0fc276cb6664b2d6d339305fcd6) | Allow-list sanitization |
| S8 | [rehype-raw](https://github.com/rehypejs/rehype-raw) | Raw HTML parsing into an AST |
| S9 | [remark-gfm](https://github.com/remarkjs/remark-gfm/tree/109972e8a773bf5dac1d6d2da0776557f36971aa) | Tables, footnotes, strikethrough, and task lists |
| S10 | [Instapaper folders](https://www.instapaper.com/developers/v2/reference/folders) | Folder IDs and public/private status |
| S11 | [Instapaper application registration](https://www.instapaper.com/developers/applications/create) | Actual registration form |
| S12 | [Instapaper applications](https://www.instapaper.com/developers/applications) | Manage an application and generate its token |
| O1 | [Obsidian developer policies](https://docs.obsidian.md/community-directory/developer-policies) | Disclosures, network use, telemetry, licensing, and trademarks |
| O2 | [Plugin submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins) | Manifest, descriptions, desktop APIs, and command IDs |
| O3 | [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) | UI, DOM safety, lifecycle, vault APIs, and styling |
| O4 | [Submit your plugin](https://docs.obsidian.md/plugins/releasing/submit-plugin) | Required repository files, raw release attachments, and directory submission |

The Obsidian pages were read from the official [developer documentation repository](https://github.com/obsidianmd/obsidian-developer-docs), including the policy and submission source files. Submission procedures may change; check the current official guide before publishing.

## Evidence boundaries

The Bookmarks API describes direct HTML input. That alone does not guarantee preservation of every tag, image, layout, or footnote link. The project separately tested one embedded PNG on a free account.

The reviewed documentation did not establish a maximum HTML request size or an explicit data URI preservation contract. Plugin limits are local safeguards, not inferred Instapaper quotas.

URL-save deduplication does not establish idempotency for URL-less private content. The journal therefore uses local fingerprints and recovery markers while avoiding automatic retries after uncertain saves.

Personal-account parsing and public-app parsing conditions should not be conflated. Expanding the distribution or authentication model requires a separate API-terms review.

The existence of SecretStorage does not establish encryption, synchronization, or isolation guarantees. The environment-variable option avoids persisting a token in plugin data, but is not an encrypted secret store.

## Decisions and tradeoffs

| Decision | Reason | Tradeoff |
| --- | --- | --- |
| Official API HTML saving | Transfer authored content without publishing a web page | Requires token setup and conversion |
| Personal tokens | Small, explicit account setup | No public-app one-click OAuth |
| AST conversion | Static, predictable handling without executing other plugins | Does not reproduce every Obsidian extension |
| Required preview | Show the article and losses before upload | Adds an explicit send step |
| New copies | Preserve prior reading progress and highlights | Edited articles accumulate separately |
| Embedded local images | Avoid automatic public image hosting | Service/client compatibility must be tested |
| Existing private folders | Keep destination behavior simple and private | No folder creation or public-folder sending |
| Durable journal | Reduce duplicate uploads after lost responses | Unknown outcomes can require manual investigation |
| Single-device scope | Keep reliability claims bounded | No distributed deduplication |
| Scoped Obsidian UI styles | Respect themes and CSS snippets | Exported HTML needs a separate visual template |

The repository name remains `obsidian-send2instapaper`; the displayed plugin name is **Send2Reader for Instapaper**. The project uses the MIT license and does not claim first-party affiliation.
