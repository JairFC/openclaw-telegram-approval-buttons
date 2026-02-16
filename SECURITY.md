# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 4.x     | ✅ Active  |
| < 4.0   | ❌ EOL     |

## Reporting a Vulnerability

If you discover a security vulnerability in this plugin, please report it responsibly:

1. **Do NOT open a public issue** — this could expose the vulnerability to others
2. **Email**: [francojair81@gmail.com](mailto:francojair81@gmail.com)
3. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if you have one)

I will acknowledge your report within **48 hours** and aim to release a fix within **7 days** for critical issues.

## Security Model

This plugin runs **in-process** with the OpenClaw Gateway as trusted code:

- **No external network calls** except to the Telegram Bot API (`api.telegram.org`)
- **No data persistence** — all approval state is in-memory and lost on restart
- **No credential storage** — bot token and chat ID are read from OpenClaw's config at runtime
- **Input validation** — callback query data is validated against the pending approvals map; unknown IDs are silently ignored
- **HTML escaping** — all user-supplied text is escaped before Telegram HTML rendering to prevent injection

## Best Practices for Users

- Keep your OpenClaw instance and this plugin updated
- Use `plugins.allow` allowlists to restrict which plugins can load
- Review the source code before installing any community plugin
- Never share your bot token or chat ID publicly
