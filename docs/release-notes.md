# Paperlane 0.4.1

- Replace custom settings controls when switching providers instead of accumulating Advanced panels, secret selectors, or connection status elements.
- Dispose each render once so delayed cleanup cannot remove the current provider's controls.
- Keep Bedrock defaults at us-west-2 with global inference IDs. AWS profile continues to use GPT-6 Astra with low reasoning.

Validation: 65 tests plus lint, type checking, and build passed. Provider-switch regression tests cover all four providers and stale cleanup callbacks. No paid model requests were made.
