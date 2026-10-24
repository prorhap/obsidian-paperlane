# Image support findings

Reviewed and tested on 2026-10-24.

## Conclusion

**A free Instapaper account successfully saved HTML with a base64 PNG and displayed it in the web reader.** The tested PNG was 354,289 bytes and the HTML was 472,669 bytes. External image hosting was unnecessary for that sample. Other formats, larger articles, and mobile/offline display remain unverified.

The official Bookmarks API supports HTML `content` with `private_source`. The reviewed documentation did not specify a standalone local-image upload endpoint, a data URI preservation contract, or a maximum HTML request-body size.

## Sources and what they establish

| Topic | Source | Supported conclusion |
| --- | --- | --- |
| Direct HTML saving | [Bookmarks API](https://www.instapaper.com/developers/v2/reference/bookmarks) | A URL-less content-saving route exists |
| Data URI images | Project live test | The tested PNG retained its exact src and displayed in the web reader |
| Request size | Bookmarks API and [errors](https://www.instapaper.com/developers/v2/reference/errors) | No maximum body size established; a list limit is not a byte limit |
| Unresolved lazy-image placeholders | [lazysizes issue 110](https://github.com/aFarkas/lazysizes/issues/110), June 2015 | The author reported width/quality placeholders failing in Instapaper and a static-value fix |
| Low-quality placeholder saved | [glennmccomb-com issue 7](https://github.com/lenymo/glennmccomb-com/issues/7), April 2019 | The site author reported a low-quality placeholder being saved |
| PDF saving | [Instapaper PDF documentation](https://www.instapaper.com/docs/save/pdfs) | A Premium feature that extracts content for reading; not implemented here |

The two user reports are old, site-specific cases, not estimates of current failure rates or universal format support. Authentication cookies, expiring URLs, and hotlink restrictions are plausible remote-image failure causes, not established blanket Instapaper policies in this investigation.

## Implemented image policy

1. Normalize ordinary image sources, lazy attributes, srcset, and picture candidates into static image references.
2. Do not treat unresolved `{width}` or `{quality}` templates as final URLs; report a warning.
3. Validate the file signatures of PNG, JPEG, GIF, and WebP before embedding their bytes.
4. Reduce SVG to a static subset without external resources, then rasterize it to PNG. Appearance may change.
5. Permit a user-specified public HTTPS mapping for an individual image.
6. Never automatically create a public bucket, upload images to a host, or publish the source note.
7. After saving, inspect actual img references in the parsed body. An API metadata image list alone is insufficient.
8. Report missing or rewritten references rather than claiming complete preservation.

The local preview hides remote images to avoid fetching them. Standalone HTML export embeds local raster images but retains remote references; such an export is not necessarily self-contained offline.

## Size limits

The plugin caps input documents at 5 MiB, individual images at 8 MiB, and converted HTML at 24 MiB. **These are local implementation limits, not official Instapaper limits.** Actual service acceptance may require lower limits.

Base64 expands image bytes to roughly four thirds of their original size, before HTML and JSON overhead. Size acceptance and image-format compatibility are separate questions.

## Recorded live test

Both articles used the same non-sensitive public PNG asset from Instapaper.

| Measurement | HTTPS control | Embedded base64 |
| --- | --- | --- |
| Account | Free | Same free account |
| Original PNG | 354,289 bytes | Same file |
| Submitted HTML | 315 bytes | 472,669 bytes |
| Save | Successful | Successful |
| Body retrieval | Successful | Successful |
| Images in body | 1 | 1 |
| Exact input src preserved | Yes | Yes |
| Final paragraph preserved | Yes | Yes |
| Web-reader visual inspection | Not separately performed | Visible; natural dimensions 1696 × 770 |

The test created two bookmarks and did not automatically delete them. Raw results containing account/bookmark identifiers are kept under ignored `output/private/`. No token was written into project files.

## Next tests

First validate the packaged plugin inside Obsidian, including the extra DOM-sanitization step used by its preview. Then test representative document sizes and image formats in the service and reading client. Synchronize the client, disconnect the network, and inspect the images again.

Do not infer an unlimited request size from the successful sample or treat API retrieval as proof of offline display. Use small, non-sensitive samples and bounded tests rather than service load testing.
