# 🔐 Telegram Approval Buttons for OpenClaw

> One-tap `exec` approvals in Telegram — no more typing `/approve <uuid> allow-once`.

## What does this look like?

<p align="center">
  <img src="https://raw.githubusercontent.com/JairFC/openclaw-telegram-approval-buttons/main/docs/banner.png" alt="Plugin workflow: approval request → allowed → health check" />
</p>

## What does this do?

OpenClaw's Discord has built-in approval buttons. **Telegram doesn't** — you're stuck typing long `/approve` commands. This plugin fixes that.

**Features:**
- ✅ **One-tap approvals** — Allow Once · 🔏 Always · ❌ Deny
- 🔄 **Auto-resolve** — edits the message after decision (removes buttons, shows result)
- ⏰ **Expiry handling** — stale approvals auto-cleaned and marked as expired
- 🩺 **Self-diagnostics** — `/approvalstatus` checks health and stats
- 🛡️ **Graceful fallback** — if buttons fail, the original text goes through
- 📦 **Zero dependencies** — uses only Node.js built-in `fetch`

## Quick Start

### Step 1: Install the plugin

```bash
openclaw plugins install telegram-approval-buttons
```

That's it — OpenClaw downloads it from npm and enables it automatically.

<details>
<summary>Alternative: install from source (for development)</summary>

```bash
git clone https://github.com/JairFC/openclaw-telegram-approval-buttons.git
```

Then add the path manually to your `openclaw.json`:

```jsonc
{
  "plugins": {
    "load": {
      "paths": ["/path/to/openclaw-telegram-approval-buttons"]
    }
  }
}
```

</details>

### Step 2: Configure approvals and plugin

Open your `~/.openclaw/openclaw.json` and add two things:

1. **Exec approvals targeting Telegram** — without this, approvals stay as plain text
2. **Plugin config with your bot token and chat ID** — the plugin needs these to send buttons

```jsonc
{
  "approvals": {
    "exec": {
      "enabled": true,
      "mode": "targets",
      "targets": [
        {
          "channel": "telegram",
          "to": "<your_telegram_chat_id>"
        }
      ]
    }
  },
  "plugins": {
    "entries": {
      "telegram-approval-buttons": {
        "enabled": true,
        "config": {
          "botToken": "<your_bot_token>",
          "chatId": "<your_telegram_chat_id>"
        }
      }
    }
  }
}
```

> 💡 **Where to find these values:**
> - **Bot token** — the token you got from [@BotFather](https://t.me/BotFather) when creating your bot. It's the same token OpenClaw uses for Telegram.
> - **Chat ID** — your Telegram user ID. Send a message to [@userinfobot](https://t.me/userinfobot) to get it, or check `openclaw logs --follow` after sending a message to your bot.

### Step 3: Restart and verify

```bash
openclaw gateway restart
```

Then send `/approvalstatus` in your Telegram chat. You should see:

```
🟢 Approval Buttons Status

Config: chatId=✓ · token=✓
Telegram: ✓ connected (@your_bot)
Pending: 0 · Processed: 0
Uptime: 1m
```

> ⚠️ **If you see `DISABLED — missing config`**, the plugin can't find your bot token or chat ID. Double-check that `botToken` and `chatId` are set in `plugins.entries.telegram-approval-buttons.config` in your `~/.openclaw/openclaw.json`.

**That's it!** Next time the AI triggers an `exec` approval, you'll get inline buttons instead of text.

## Prerequisites

- **OpenClaw ≥ 2026.2.9** installed and running
- **Node.js ≥ 20** (uses built-in `fetch`)
- **Telegram configured** in your `openclaw.json` (bot token + `allowFrom`)
- **Exec approvals targeting Telegram** — see Step 2 above

## How it works

```
┌─────────────┐    message_sending     ┌──────────────────┐
│  OpenClaw    │ ── approval text ──→  │     Plugin        │
│  Gateway     │                       │                   │
│              │   cancel original     │  1. Parse text    │
│              │ ←──────────────────── │  2. Send buttons  │
└─────────────┘                        │  3. Track pending │
                                       └────────┬─────────┘
                                                │
                                    Telegram Bot API
                                                │
                                       ┌────────▼─────────┐
                                       │   Telegram Chat   │
                                       │                   │
                                       │  🔐 Exec Approval │
                                       │  [✅ Allow] [🔏]  │
                                       │  [❌ Deny]        │
                                       └──────────────────┘
```

When you tap a button, OpenClaw converts the `callback_data` into a synthetic text message — **no webhook needed**.

## Configuration

The plugin **auto-detects** `botToken` and `chatId` from your Telegram channel config. Most setups need zero extra configuration.

### Config resolution order

| Setting    | Priority 1 (explicit)       | Priority 2 (shared config)         | Priority 3 (env)          |
|------------|-----------------------------|------------------------------------|---------------------------|
| `botToken` | `pluginConfig.botToken`     | `channels.telegram.token`          | `TELEGRAM_BOT_TOKEN`      |
| `chatId`   | `pluginConfig.chatId`       | `channels.telegram.allowFrom[0]`   | `TELEGRAM_CHAT_ID`        |

### Advanced options

```jsonc
{
  "plugins": {
    "entries": {
      "telegram-approval-buttons": {
        "enabled": true,
        "config": {
          "chatId": "123456789",       // Override auto-detected chat ID
          "botToken": "123:ABC...",     // Override auto-detected bot token
          "staleMins": 10,             // Minutes before stale cleanup (default: 10)
          "verbose": false             // Diagnostic logging (default: false)
        }
      }
    }
  }
}
```

## FAQ

**Q: I installed the plugin but I still get old text approvals.**  
A: Most likely your `approvals.exec` section is missing or doesn't target Telegram. Make sure you have `"mode": "targets"` with a target pointing to `"channel": "telegram"` — see Step 2 above. Restart the gateway after changing the config.

**Q: I installed the plugin but no buttons appear at all.**  
A: Make sure `tools.exec.ask` is NOT set to `"off"` in your config. If it's `"off"`, there are no approvals to buttonize. Set it to `"on-miss"` or `"always"`.

**Q: How do I find my Telegram Chat ID?**  
A: Send `/start` to [@userinfobot](https://t.me/userinfobot) on Telegram — it replies with your ID. Alternatively, check `https://api.telegram.org/bot<TOKEN>/getUpdates` after sending a message to your bot.

**Q: Do I need to set up a webhook?**  
A: No! OpenClaw's Telegram integration automatically converts button taps into synthetic text messages. No extra setup needed.

**Q: What happens if the plugin fails to send buttons?**  
A: The original plain-text approval message goes through normally. The plugin never blocks approvals.

**Q: Does this work in group chats?**  
A: Yes, but the bot needs to be an admin or it needs permission to edit its own messages.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `DISABLED — missing config` in logs | Add `botToken` and `chatId` to `plugins.entries.telegram-approval-buttons.config` in your `~/.openclaw/openclaw.json`. See Step 2. |
| Still getting old text approvals | Your `approvals.exec` config must target Telegram. See Step 2. |
| `/approvalstatus` says "unknown command" | Plugin didn't load. Run `openclaw plugins install telegram-approval-buttons` and restart the gateway. |
| No buttons appear | Check `tools.exec.ask` is not `"off"`. Run `/approvalstatus` to check config. |
| Buttons show but nothing happens | Bot needs message editing permission. Use a private chat or make bot admin. |
| `/approvalstatus` says "token=✗" | Set `botToken` in plugin config. See Step 2. |
| `/approvalstatus` says "chatId=✗" | Set `chatId` in plugin config. See Step 2. |
| Buttons say "expired" | Approval timed out before you tapped. Adjust `staleMins` if needed. |

## Architecture

```
telegram-approval-buttons/
├── index.ts                  # Entry point — orchestration only
├── types.ts                  # Shared TypeScript interfaces
├── lib/
│   ├── telegram-api.ts       # Telegram Bot API client (isolated)
│   ├── approval-parser.ts    # Parse OpenClaw approval text format
│   ├── message-formatter.ts  # HTML formatting for Telegram messages
│   ├── approval-store.ts     # In-memory pending approval tracker
│   └── diagnostics.ts        # Config resolution, health checks
├── openclaw.plugin.json      # Plugin manifest
└── package.json
```

## Contributing

Issues and PRs welcome. Each file in `lib/` is self-contained with a single responsibility.

## License

[MIT](LICENSE)
