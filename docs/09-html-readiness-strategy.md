# HTML readiness and conversion strategy

Implementation update (0.4.0): full-body HTML preservation, static tab/dialog expansion, SVG dashed-line/label preservation, and optional bounded AI formatting review have shipped. The audit below describes the older 0.3.0 baseline. The complete source-coverage report and visual review remain planned; see `10-ai-assistance.md` for current behavior.

## Decision

Treat local HTML as an authored document whose meaning must survive conversion. A successful bookmark request does not establish that the original document survived. Add a preflight comparison from **source to outgoing article**, independently of the existing comparison from **outgoing article to saved content**.

The Transformer tutorial audited below is a suitable candidate for a reading copy, but the current default conversion silently excludes its introduction and closing note. Its diagram also needs a sanitizer correction and browser rasterization verification. Do not describe this document as fully verified yet.

This document specifies proposed work. It does not imply that the preflight features have shipped.

## Local audit on 2026-10-24

Baseline: commit `b5224d6`, Paperlane 0.3.0. Source: the user's local HTML tutorial titled *Transformer 쉽게 그리고 깊게 이해하기*. Source content and generated copies remain outside this repository.

The actual file was passed to `convert()` twice, using default extraction and `wholeBody: true`. The Node audit deliberately supplied no SVG rasterizer. Its missing-image result establishes the need for that callback, **not** a failure of the Obsidian browser rasterizer.

| Item | Source | Conversion result |
| --- | --- | --- |
| Input size | 71,182 UTF-8 bytes | Below the plugin's 5 MiB input limit |
| Introduction and closing note | Header and footer outside `main` | Both absent by default; both present with whole-body conversion |
| Main sections | 17 `h2` headings | All 17 retained |
| Tables | 13 tables, 61 rows, 200 cells | All structural counts retained; normalized text of all 13 tables found in output |
| Code | 2 `pre` blocks | Both normalized text contents retained; exact whitespace and visual readability need separate checks |
| Expandable explanations | 8 `details` and 8 `summary` elements | Expanded to sections; all 8 summary texts retained as headings |
| Diagram | 1 inline SVG, no `img` elements | Requires PNG rasterization; Node audit produced an explicit missing-image warning |
| Executable or embedded content | No script, canvas, iframe or MathML elements | No dependency on these elements detected; this alone does not prove formula readability |
| Output size without diagram | 50,612 bytes default; 52,334 bytes whole-body | These are not final PNG-inclusive payload sizes |

A property-level SVG comparison found `strokeDashArray` removed. The sanitizer allowlist currently uses `strokeDasharray`, while the parser produces `strokeDashArray`. Consequently, dashed lines can become solid. It also removes the SVG's accessible label, and the replacement image currently receives a generic alt text. Preserve the label on the replacement image before sanitization.

The document relies on CSS for cards, formulas, flow steps, colors and spacing. Paperlane strips classes and styles. Text retention therefore does not establish preservation of line breaks, emphasis, reading order or relationships conveyed by layout. The actual diagram uses presentation attributes for its main shapes and labels, making it a promising rasterization candidate, subject to the issues above.

The current post-save verifier starts with the converted article. It cannot discover the already-discarded introduction or footer. This is the central verification gap.

## Product flow

1. Read the selected vault file without executing its scripts or loading arbitrary external resources.
2. Inventory the source: meaningful text blocks, headings, tables, code, formulas, figures, disclosures and unsupported elements.
3. Choose the reading scope and show any proposed omissions. For local authored HTML, prefer the complete body when extraction would remove meaningful prose. Navigation may be omitted only with an explicit recorded reason and a visible scope preview.
4. Transform to semantic, single-column HTML. Compare the result with the inventory before enabling normal sending.
5. Show a concise result: **Ready**, **Review needed**, or **Cannot send**. Explain affected elements and offer specific fixes rather than a generic warning wall.
6. Send only the reviewed result. Keep the existing uncertain-request recovery behavior to avoid accidental duplicate bookmarks.
7. Report storage, content retention and image-reference retention separately. Actual app appearance and offline image availability remain distinct checks.

A proposed preview summary for this tutorial is: “17 sections, 13 tables, 2 code blocks, 8 expanded explanations, 1 diagram. Introduction and closing note included. Diagram appearance needs review.” Counts must be calculated, not hard-coded.

## Conversion policy

| Content | Preferred transformation | Fallback or review condition |
| --- | --- | --- |
| Header, main, footer | Preserve meaningful authored prose in document order | Show omitted blocks before accepting narrower extraction |
| Cards, callouts, flow steps | Headings, paragraphs, ordered lists and explicit labels | Flag relationships encoded only by position or color; never guess their meaning |
| Tables | Keep semantic tables and headers | Offer per-table list conversion for wide simple tables; preserve row/column spans or warn when flattening would lose relationships |
| Code | Preserve `pre`/`code` characters and line breaks | Remove syntax colors without altering source; do not collapse whitespace for the code-specific comparison |
| Plain-text formulas | Preserve Unicode and explicit grouping, provide readable wrapping | Flag CSS-dependent alignment; do not claim that a formula merely retaining its text is visually correct |
| Rendered equations | Preserve accessible source text plus a verified static rendering where supported | Unrendered TeX, MathJax/KaTeX dependencies or unsupported MathML require a specific warning and fallback |
| Inline SVG | Sanitize, rasterize to PNG, preserve label/caption | Record removed meaningful attributes; require review when styling or unsupported SVG features affect the result |
| Local images | Read through Vault API and embed supported bytes | Missing assets require replacement or explicit acceptance of omission |
| Remote images | Preserve validated HTTPS references | Explain that reachability, authentication and offline caching are separate from URL retention |
| Details | Expand with a heading and all children | Compare the complete body of every disclosure, not just its summary |
| Scripts, canvas, embeds | Do not execute | Explain missing content; require a static export or locally supplied image for essential content |

Avoid turning the entire page into a screenshot: it loses selectable text, searchability and adaptable reading size. Use images selectively for diagrams and visual notation. No LLM is required for the deterministic conversion or checks. An optional LLM rewrite would change the fidelity contract and is outside this plan.

## Proposed implementation

### 1. Source inventory and coverage

Add an `HtmlReadinessReport` with source block IDs, element kinds, scope decisions, transformation outcomes, unresolved losses and payload estimates. Keep this report local; do not insert diagnostics or local file paths into the article.

Assign stable source IDs before extraction. Record each meaningful block as retained, intentionally transformed, explicitly omitted or unresolved. Avoid a character-percentage-only score: losing one equation or diagram can matter more than losing a long navigation menu. Compare ordinary text with Unicode/whitespace normalization, code with line-ending normalization only, and tables with ordered cell/header relationships.

Include `h4` through `h6`, captions, formulas and standalone card text. The existing checkpoint list does not cover all these independently. Track duplicate block occurrences so one repeated sentence cannot satisfy several missing occurrences.

### 2. Conservative extraction and semantic adaptation

Detect meaningful source content outside the selected main/article candidate. Default to retaining it for local documents and expose a clear scope choice. Do not silently discard it. Perform safe, supported semantic conversions before stripping CSS. Class names alone are insufficient evidence to infer reading order or meaning; unfamiliar layouts should trigger review.

Correct SVG property names, preserve accessible labels, and report unsupported presentation features. Add a browser integration fixture for the PNG path, including dashed connectors and text labels. Keep external references and executable SVG content blocked.

### 3. Readiness UI and send gating

- **Ready:** no unresolved content losses, valid payload, all required local assets converted.
- **Review needed:** potentially changed layout, omitted prose, missing images, unsupported content, or unverified diagram appearance. Present affected elements with a concrete choice: include full body, use a static image, change table rendering, or explicitly accept the loss.
- **Cannot send:** empty result, parsing/budget failure, or no usable representation of required content. Explain what must change.

Recalculate readiness after changing scope, images or table options. Bind approval to the exact prepared result; a later rebuild must not reuse an earlier loss acknowledgment. Keep “saved with warnings” distinct from “verified.”

### 4. End-to-end validation

Use synthetic public fixtures for automated tests; do not commit the user's tutorial. Test source-to-output coverage independently of saved-content verification. A fixture should reproduce a header/main/footer document with cards, one dashed SVG, tables, code and closed disclosures.

Acceptance criteria:

- No meaningful block is silently omitted by default extraction.
- The tutorial retains its introduction, closing note, 17 section headings, all 13 tables and their 200 cells, both code blocks, and all disclosure contents.
- Code whitespace is compared exactly apart from line endings.
- The SVG keeps dashed connectors, captions and accessible text; the real browser path produces a readable PNG within budgets.
- Narrow previews expose table/formula overflow without claiming to emulate Instapaper perfectly.
- Simulated server content loss is detected independently of local conversion loss.
- Only an explicitly authorized real-account test can establish saved output and device appearance. The local audit did not send this tutorial to Instapaper.

## Practical handling today

For this particular file, enable **HTML 전체 본문 사용** in the preview to retain the introduction and closing note. Review the PNG diagram in Obsidian and inspect tables/formulas in the outgoing reading copy. Current 0.3.0 still has the SVG dashed-line issue described above, so do not treat it as a faithful final rendering without correction.

Recommended implementation order: source coverage and scope handling; SVG fidelity fix; readiness summary and gating; table/formula layout review; independently verified saved-content comparison.

## API evidence and limits

The official Instapaper API v2 OpenAPI document was retrieved on 2026-10-24 from `https://www.instapaper.com/api/2/openapi.json`. `CreateBookmarkRequest` documents `content` as full article HTML and requires it with `private_source`; `private_source` permits this flow instead of `url`. This supports sending local reading copies without publishing a website first.

That request schema does not establish CSS fidelity, SVG rendering, offline image availability or a maximum article size. The 5 MiB input, 8 MiB per-image and 24 MiB output limits discussed here are Paperlane limits, not documented Instapaper limits. The final PNG-inclusive payload must be measured after conversion.
