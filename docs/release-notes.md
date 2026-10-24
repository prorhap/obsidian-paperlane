# Paperlane 0.3.0

- Add an opt-in Sync tags setting. Markdown frontmatter tags and inline hashtags are sent with the article; categories, code, link destinations, escaped hashtags, and hidden comments are excluded. The preview lists outgoing tags.
- Show Sending… while saving, a clear result panel and notification afterwards, and Done for confirmed saves. Unconfirmed outcomes offer View history instead of retrying.
- Include outgoing tags in duplicate detection, while preserving existing fingerprints when no tags are sent.

Tag transfer is one-way at send time. Changing tags creates a new snapshot when sent again; it does not modify an existing bookmark. Turning the setting off does not remove remote tags. HTML files do not supply Obsidian tags.

Requires desktop Obsidian 1.13.0 or later. Existing settings and transfer history are preserved.
