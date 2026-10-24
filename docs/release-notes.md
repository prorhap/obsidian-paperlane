# Paperlane 0.4.0

- Add optional HTML review with four provider choices: Bedrock API key, Gemini, OpenAI, and AWS profile. Keys are linked through Obsidian secret storage; model and region overrides are under Advanced.
- Default both Bedrock methods to us-west-2 and global inference IDs. Actual inference may run in other regions.
- Use GPT-6 Astra with low reasoning for AWS profiles through an authenticated loopback helper, exported from the settings screen. AWS credentials are never read by the plugin.
- Let models propose bounded formatting plans and apply them to original blocks after explicit review. No model-authored replacement prose, automatic document uploads, or provider fallback.
- Preserve the full HTML body by default, expand static tab panels/dialogs, and preserve SVG dashed connectors and accessible labels.
- Keep existing Instapaper credentials, tag settings, and history. AI assistance is off until configured.

Live paid provider calls have not been run as part of this release validation. Review plans are text/structure analysis, not visual or factual verification. JavaScript-generated content is not fetched or executed.
