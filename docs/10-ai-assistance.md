# AI-assisted HTML review

## Requirements and acceptance criteria

Offer four choices in one provider menu: Bedrock API key, Gemini, OpenAI, and AWS profile. Keep assistance off for existing installations. Show only the selected provider's credentials, with a suggested model and optional advanced overrides. Secrets belong in Obsidian secret storage, never plugin data. Preserve each provider's settings when switching.

A manual preview action sends only the selected document's static text and structure to the named provider. No background document upload, image upload, JavaScript execution, tools, external URL fetches, or automatic provider fallback. Connection tests use a small synthetic document and disclose that an API charge may apply.

Models return a bounded, validated plan rather than replacement prose or executable HTML. The plugin applies allowed formatting changes to original nodes, preserving their text. The user sees review findings and explicitly applies the plan before sending. Invalid or incomplete replies leave the current preview intact. Closing or rebuilding a preview invalidates pending review results.

HTML full-body preservation, static tab/dialog expansion, and SVG dashed-line/label preservation are prerequisites. JavaScript-generated content remains unavailable and must be reported. AI review is text/structure review, not visual or factual verification.

AWS profiles are handled by an optional authenticated loopback helper, outside the Obsidian runtime bundle. The helper reads AWS configuration using Boto3 and exposes only the review operation. It never returns AWS credentials. The plugin must not add filesystem or subprocess access. Initial helper setup is explicit; the plugin cannot silently install/start it under this boundary.

Validation: provider request/response fixtures, refusal/truncation/error handling, credential isolation, plan bounds and text preservation, synthetic tab/dialog/code fixtures, helper authentication/origin/host/body limits and fake-model integration. Live paid requests and private-document transmission are not part of automated tests.

## Setup and daily use

1. Open **Settings → Paperlane → AI assistance** and select a provider. Existing settings start at Off.
2. For an API-key provider, link its **AI API key** using Obsidian's Link/Add secret control. AWS profile needs no key entry: its helper connects automatically. Provider settings are preserved independently when switching.
3. Keep the suggested model. Advanced exposes a model override and, for Bedrock, a region override. Access depends on the provider account; there is no automatic fallback to another provider or model.
4. Optionally click **Test connection**. It sends a tiny synthetic sample and can incur an API charge. It never sends a vault note.
5. Open an HTML preview and click **Review with AI**. The disclosure names the selected provider and explains that static text and structure will be uploaded. Review model observations and proposed formatting, click **Apply and preview**, then inspect and send normally. Use **Use local conversion** to discard applied AI formatting.

Defaults checked against official documentation on 2026-10-24:

| Selection | Default model | Authentication |
| --- | --- | --- |
| Bedrock API key | `global.anthropic.claude-sonnet-4-6`, `us-west-2` | Bearer key in secret storage |
| Gemini | `gemini-3.8-flash` | Google API key in secret storage |
| OpenAI | `gpt-6-luna`, low reasoning | OpenAI API key in secret storage |
| AWS profile | `global.openai.gpt-6-astra`, low reasoning, `us-west-2` | Local AWS profile; automatic helper authentication |

AWS profile's model and effort are fixed to the user's requested Astra/low combination. Region can be changed, but must support that global inference profile. Requests start in us-west-2 by default; global routing can process them in other regions worldwide. This is global cross-region routing, not a promise of processing in the source region. Choose provider settings according to your data requirements. The other defaults are practical starting points, not a benchmark claim that they are universally optimal.

### AWS profile one-time setup

Click **Setup instructions → Export helper**. This creates `Paperlane Helper/paperlane-helper.py` and `review-protocol.json` inside the vault using Vault API. Re-exporting replaces those generated files. Neither contains AWS credentials or pairing tokens.

Open a terminal in that folder and run the three commands displayed in the modal. They create a Python virtual environment outside the vault, install Boto3, and start the helper. Python 3 must be installed. If using AWS SSO, run `aws sso login --profile YOUR_PROFILE` first. Existing profile-based credential mechanisms are handled by Boto3, not by the plugin.

Enter your AWS profile name and test the connection. No helper token is displayed, copied, or entered. The helper listens only on `127.0.0.1:27183`. Keep its terminal open; Ctrl+C stops it. For subsequent sessions, only the final Python command is needed. No launch agent or background service is installed. After upgrading a helper exported by an older version, export it again and restart that command. Previously linked helper secrets are left untouched but no longer used.

Before each profile request, the plugin creates a random, short-lived connection challenge in the exported helper folder using Vault API. Only the public nonce travels to `/pair`. The helper reads the matching file from its own directory and returns an HMAC proof bound to that nonce and its internal bearer credential. The plugin verifies the proof before trusting the endpoint. Challenges expire after two minutes, are single-use within the running helper, and are removed by the plugin through Vault API after success or failure. A crash can leave an expired challenge file; it is not an AWS credential or a reusable helper token. Because the folder is in the vault, sync may briefly observe challenge files. The helper must run from the same local exported folder.

The actual helper credential stays private in `~/.config/paperlane/helper-token` and is handled only in memory by the plugin. It is never printed, copied into plugin data, or written into the vault. No AWS credentials are exchanged. Pairing performs no model inference and incurs no model charge.

The helper still enforces bearer authentication on `/review`, exact Host, no Origin header, bounded JSON input, one inference at a time, and a fixed Astra/low operation. It disables SDK retries and removes a shell Bedrock bearer key so profile authentication is explicit. It does not expose a shell, arbitrary endpoint, general file-reading API, AWS credential export or model selection API. Failure messages avoid raw provider responses and credentials.

### What review can and cannot do

The model receives static text and selected structural hints, capped at 240 KB. Image bytes, script source, form values, and URL attributes are excluded. Text within the selected article may still contain private information; review transmits that text to the selected provider. No other notes are read for AI review. OpenAI and Gemini requests explicitly use `store: false`; this is not a guarantee of zero provider retention or a replacement for provider data policies.

The plan may change an eligible existing block to a section, paragraph, or preformatted block. It cannot delete/reorder content, rewrite prose, insert scripts, access tools, or fetch missing material. Unknown IDs, incompatible nesting, extra response fields, truncated output and oversized responses are rejected. All changes are validated before application. Original text and child order remain unchanged. Static `tabpanel` and `dialog` elements are expanded locally even without AI; labels are taken from the source. Closed `details` are expanded by the existing converter.

Image appearance, table relationships and math correctness are not proven by a model's findings. Findings are displayed as unverified model observations. Custom tabs/popups without semantic markup may require manual review. Content generated only after JavaScript execution, external dialogs and CSS-generated text remain unavailable. This release does not implement screenshot-based review or the complete source-coverage report described in `09-html-readiness-strategy.md`.

Provider requests time out after 120 seconds without automatic retries. An upstream request can still finish and incur a charge after the UI times out. A closed preview discards the result. Instapaper sending uses the last prepared local article and remains a separate action.

## Sources used for implementation

- OpenAI model catalog: `https://developers.openai.com/api/docs/models`
- OpenAI Responses API: `https://developers.openai.com/api/reference/resources/responses/methods/create`
- Gemini Interactions schema: `https://ai.google.dev/api/interactions`
- Gemini structured output: `https://ai.google.dev/gemini-api/docs/structured-output`
- Bedrock API keys and Converse example: `https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html`
- Bedrock Converse request/response: `https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html`
- GPT-6 Astra on Bedrock: `https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-6-astra.html`

Automated tests use synthetic documents and mocked model replies. Actual keys, profile access, provider billing, and model output quality must be checked in the user's environment; no private document was sent during development. A separately authorized simple AWS CLI inference succeeded with the default profile, us-west-2, global.openai.gpt-6-astra and reasoning low (17 input tokens, 9 output tokens). This verifies AWS access and the request parameters, not the full Obsidian/helper path.
