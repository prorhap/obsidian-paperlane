# Requirements and user experience

Updated 2026-10-24 for the 0.1.2 development build. This document consolidates the original design and subsequent implementation decisions. Planned capabilities are explicitly separated from implemented behavior.

## Purpose and success criteria

Send the contents of a selected Obsidian Markdown or HTML file to a personal Instapaper account without publishing the source note on a website. Keep the original file unchanged and transfer a reading copy the user has reviewed.

Three outcomes must remain distinct:

| Outcome | Evidence |
| --- | --- |
| Saved | Instapaper returned a bookmark ID |
| Body and image references checked | Retrieved HTML passed comparison against the prepared article |
| Reader display checked | A person inspected the actual reading client, including offline behavior where relevant |

The plugin cannot automatically certify the third outcome. A local preview demonstrates conversion, not Instapaper rendering.

## Supported environment

The initial target is macOS desktop, Obsidian 1.11.4 or later, one vault, and one sending device. The personal token belongs to the same account that registered the Instapaper application. The plugin does not require a Premium flag to attempt ordinary article saving.

The manifest is desktop-only because filesystem containment checks, hashing, and environment-variable authentication use Node.js APIs. Supporting mobile requires a separate implementation and validation effort.

## Functional requirements

| ID | Requirement | Acceptance criterion |
| --- | --- | --- |
| R01 | Current Markdown note | Read the active editor buffer when available |
| R02 | HTML selection | Choose a vault HTML file without installing an HTML viewer |
| R03 | Static reading conversion | Preserve supported text structures without executing source content |
| R04 | Personal credentials | Show the connected account and subscription state |
| R05 | Destination selection | Use home or an existing private folder |
| R06 | Preview | Show the prepared article and conversion warnings before saving |
| R07 | Duplicate prevention | Reuse an existing recorded result for the same account, path, and article hash |
| R08 | Changed documents | Save an edited article as a new copy without deleting the earlier one |
| R09 | Result verification | Distinguish successful storage from successful body comparison |
| R10 | Uncertain results | Reconcile before permitting another save for that file |
| R11 | Preserve source | Do not change source text, frontmatter, or filename |
| R12 | Credentials outside ordinary data | Do not persist token values in settings, journal, or logs |

Implemented behavior is covered by local tests where practical. Completion of these requirements inside a real Obsidian session remains a release gate.

## Entry points

| Local command ID | Purpose |
| --- | --- |
| `send-current` | Preview the current supported file |
| `choose-file` | Select a `.md`, `.html`, or `.htm` file from the vault |
| `history` | Review transfer status and reconcile uncertain results |

Obsidian prefixes these IDs with `send-to-instapaper:`. The file menu also offers a send action for supported files. No default hotkeys are assigned. The current interface has Korean labels; English command descriptions here describe their purpose rather than their literal labels.

## Credentials and connection

Choose either an Obsidian secret-storage entry or an environment variable. The default environment variable is `INSTAPAPER_ACCESS_TOKEN`. A missing variable must fail clearly; it must never silently use a stored token from a different source.

Changing the credential source or its reference clears the cached connection and destination. Connection checking reads the account and existing private folders without creating a test article. Disconnecting removes this plugin's active credential reference; it does not revoke the remote token or erase another application's environment.

SecretStorage and environment access are credential delivery mechanisms, not guarantees of isolation from every other plugin. Do not promise encryption, synchronization, or cross-device behavior that has not been tested.

## Preview and sending

The preview shows the source path, account, editable title, destination, converted body, image states, and conversion warnings. HTML files offer an option to use the whole body instead of a unique article/main candidate. Image URL mappings require a preview refresh before use.

A document with conversion losses requires explicit acknowledgement before sending. Unsupported or missing content must not be reported as fully preserved. An empty article is rejected.

The source text is checked again before sending. If it changed, the user must reopen the preview. The current implementation does not offer to send an outdated source snapshot. Image bytes are those captured during conversion; image-only changes require a preview refresh.

Pressing send authorizes one article upload. There is no background watcher or automatic batch upload. Closing a preview before sending does not save an article, although connection checking may already have made read-only requests.

## Conversion behavior

| Input | Reading copy |
| --- | --- |
| Frontmatter | Removed from body; a string `title` can supply the article title |
| Headings, lists, emphasis, quotations | Equivalent semantic HTML |
| Tables | HTML table, optionally converted to labeled row lists |
| Code blocks | Literal content; never executed |
| Footnotes | Definitions and internal references preserved by conversion tests |
| Wiki links | Alias or target name as readable text |
| Callouts | Readable block quotations |
| Collapsed details | Content made readable in the copy |
| Local raster images | Validated bytes embedded as data URIs |
| SVG | Restricted static subset rasterized to PNG |
| Remote HTTPS images | Static image references; preview placeholders |
| Embedded notes and dynamic blocks | No recursive execution or automatic note traversal; warnings where identified |
| Mermaid and mathematical notation | Source notation rather than complete rendered output |

HTML input is parsed as static content. Scripts, event handlers, forms, frames, and other disallowed structures are removed. Original CSS, fonts, interactions, and JavaScript-generated content are not reproduced. With multiple article candidates, the converter does not arbitrarily choose one and discard the others.

## Duplicates and recovery

- The same account, file path, final title, HTML, and converter version reuse the prior recorded result when an ID exists.
- A changed title or body creates a new copy. The previous copy and its highlights are left alone.
- Changing only the destination does not move or duplicate an existing copy.
- Different source paths are treated as separate documents, even when their content matches.
- Rename events observed while the plugin is loaded update local journal paths. Offline renames are not automatically reconciled.
- Unknown or submitting jobs block another save for that file until their result is resolved.
- A request timeout is not proof of cancellation. A late success can still update the journal.

The journal is local plugin data, not a distributed lock. Multiple devices or deletion of history can undermine deduplication.

## Out of scope and future work

No full-vault scanning, automatic background saving, highlight synchronization, replacement of existing articles, PDF upload, image hosting, mobile release, or public-app OAuth is implemented. Future work should prioritize real Obsidian validation, image fidelity, and reading-device checks before adding bulk automation.
