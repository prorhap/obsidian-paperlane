# Installation and usage

## Install the development build

This build targets macOS desktop and requires Obsidian 1.13.0 or later. The directory entry is submitted; automated review and in-app validation are still pending.

1. Download `main.js`, `manifest.json`, and `styles.css` from the same GitHub release.
2. Put the files in your vault's `.obsidian/plugins/paperlane/` directory, preserving existing `data.json`.
3. Restart Obsidian.
4. Enable **Paperlane** under **Settings → Community plugins**.

Alternatively, build a local installation ZIP with `npm ci` followed by `npm run package`. Published releases intentionally contain only the three files Obsidian installs; full license notices are embedded in `main.js`. The build does not install itself in a vault or modify another plugin's settings.

The current interface uses Korean labels. This English guide describes controls by purpose and provides stable command IDs for identifying the commands.

### Upgrading from the initial 0.1.0 package



## Generate a personal token

1. Register an application at [New App](https://www.instapaper.com/developers/applications/create).
2. Open it under [Your Apps](https://www.instapaper.com/developers/applications).
3. Use **Generate access token** for the personal account that owns the application.

The Authentication page is a documentation page, not the registration form. The actual form was inspected on 2026-10-24; registering the application and generating its token are user actions.

Never put a real token in a note, issue, screenshot, Git commit, or example command. No shared developer client secret is included in this plugin.

## Connect through Obsidian secret storage

1. Open the plugin settings and select the secret-storage credential source.
2. Select or create an entry using Obsidian's secret control.
3. Press the connection-check button.
4. Confirm the account and choose home or an existing private folder.

The connection check reads the account and folders; it does not create a test article. Only the secret reference is saved in plugin data.

## Connect through an environment variable

Select the environment-variable credential source. Leave the name as `INSTAPAPER_ACCESS_TOKEN`, or supply your own valid variable name. Enter the **name**, never the token, in this field.

The plugin reads that variable from the running Obsidian process. It does not read `.env` files or execute `.zshrc`. A missing variable stops connection instead of falling back to another stored account.

On macOS, fully quit Obsidian with Cmd+Q, then run this from the project directory:

```zsh
zsh scripts/launch-obsidian.zsh
```

The launcher asks for the token without echoing it, exports it to the child process, and starts `/Applications/Obsidian.app/Contents/MacOS/Obsidian`. It does not write the token to disk or place it in a command-line argument. In the launched app, select the environment method and check the connection.

For a different installation path, set only the executable path in the command:

```zsh
OBSIDIAN_BINARY='/path/to/Obsidian.app/Contents/MacOS/Obsidian' zsh scripts/launch-obsidian.zsh
```

The launcher sets the default token variable. A custom variable requires you to launch Obsidian with that variable yourself. Do not assume a later Finder/Dock launch receives the same environment. The launcher refuses to start while an Obsidian process is already running, because an existing app session may retain its old environment.

Environment variables avoid writing the key into plugin settings, but are not encrypted secret storage. Other code in the process may be able to access them. The launcher has been syntax-checked; actual Obsidian environment inheritance remains part of the in-app validation checklist.

Disconnect returns the plugin to secret storage with no entry selected. It does not delete process environment variables or revoke a token on Instapaper.

## Select and preview a document

| Command ID | Action |
| --- | --- |
| `paperlane:send-current` | Preview the current Markdown or HTML file |
| `paperlane:choose-file` | Browse folders to choose a supported file |
| `paperlane:history` | Review transfer results |

The picker starts at the vault root and searches only the current folder. Select a folder to enter it or `../` to go up. It does not search every file in the vault.

You can also use the file menu action on `.md`, `.html`, and `.htm` files. HTML selection does not require an HTML viewer.

Review the title, destination, body, image list, and warnings. For HTML, a unique article/main section is preferred; select the whole-body option if needed. Wide tables can be converted to labeled lists through the plugin preference.

| Image state | Meaning |
| --- | --- |
| Remote HTTPS | The saved article references an external host |
| Mapped HTTPS | You supplied a public HTTPS URL for that image |
| Embedded | Image bytes are inside the HTML |
| Missing | The source or supported image data could not be obtained |

Local images are embedded by default when supported. To substitute an image URL, enter a public HTTPS address and refresh the preview. There is no automatic image hosting.

Acknowledge reported conversion losses before sending. If the source text changed after preview creation, close and reopen the preview. If only an image file changed, refresh the preview to capture its new bytes.

## Send and interpret the result

Press send to upload the reviewed article. A description with a random recovery marker is included so uncertain transfers can be found later.

| Result | Meaning |
| --- | --- |
| Saved | A bookmark ID was received |
| Verified | The retrieved body passed text and image-reference checks |
| Warning | Saved, but comparison was incomplete or found a difference |
| Unknown | The request outcome needs reconciliation before another save |
| Failed | A definitive failure was recorded |

A saved image reference does not prove that the reader downloaded or cached the image. Check the actual Instapaper client, particularly for offline reading.

Sending the same final content from the same path and account reuses its recorded result. Changing the title or body saves a new copy. Changing only the folder does not automatically move or duplicate the existing one.

For an uncertain result, open history and run its result-check action. After a restart, the plugin no longer has the original prepared body, so it cannot perform a complete comparison against that old snapshot. If the recovery marker cannot be resolved, automatic retransmission remains blocked.

## Export reading HTML

Use the preview's HTML-export action to create a file under `Paperlane Exports` in the vault. It works without an Instapaper account.

The export includes reading styles and embedded local images. Remote images retain URLs and may contact their hosts when the file is opened. Scripts are removed; interactive source-page behavior is not reproduced.

## Troubleshooting and limits

- **Missing token:** check the selected credential source. For environment mode, fully quit and use the launcher again.
- **Wrong account or folder:** check the connection and reopen the preview. Public folders cannot be selected.
- **Missing local image:** verify the path, file format, and size. Files linked outside the vault are rejected.
- **Unknown save result:** inspect history and Instapaper before trying to send again.
- **Image looks correct locally but not in Instapaper:** record the format, dimensions, approximate HTML size, and reader platform. Do not include the token or private document in a public report.

Local limits are 5 MiB for input, 8 MiB per image, and 24 MiB for final HTML. These are not official Instapaper limits. SVG conversion may change appearance; Mermaid, Dataview, and mathematical notation are not fully rendered. PDF upload, bulk sending, mobile support, and multi-device deduplication are not implemented.

## Upgrade to Paperlane 0.2.0

Version 0.2.0 uses to `prorhap/obsidian-paperlane` and changes the plugin ID to `paperlane`. Obsidian treats it as a separate plugin, so existing installations do not automatically migrate. Obsidian 1.13.0 or later is required for searchable settings.

1. Disable any previous development installation and close Obsidian.
2. Back up the previous installation’s `data.json` if it exists. It contains settings and transfer history, including private metadata. Do not upload it to GitHub or the community directory.
3. Install the new release in `.obsidian/plugins/paperlane/`. Copy the old `data.json` into that directory to retain history and the secret-storage reference or environment-variable name. No raw token migration is needed.
4. Restart Obsidian, enable only the new Paperlane plugin, and check the connection. Reassign hotkeys using the `paperlane:` command prefix. Keep the old plugin disabled.

The local source checkout can retain its original directory name; Git remotes and the manifest determine the published identity.

### Vault file boundary

Paperlane reads only selected files and referenced images registered in the current vault and creates HTML exports through the Vault API. It no longer resolves symlinks with Node.js. Files in linked folders may reside physically outside the vault if Obsidian exposes them as vault entries. Review the selected document and referenced images before sending.
