# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the issue, the impact, and steps to reproduce.

(Maintainers: enable this under **Settings → Code security → Private
vulnerability reporting**.)

We'll acknowledge the report, investigate, and keep you updated on a fix and
disclosure timeline.

## Supported versions

This is an actively developed desktop app; fixes land on `develop` and ship from
`main`. Only the latest release is supported — please reproduce on the current
`main`/`develop` before reporting.

## Scope notes

- Rabbit Wrangler runs locally and connects to brokers **you** configure.
- Broker credentials are encrypted at rest with the OS keychain (`safeStorage`)
  and only ever decrypted in the Electron main process — they are never sent to
  the renderer.
- The renderer runs with `contextIsolation` on and a Content-Security-Policy
  that restricts outbound connections to `self` and the localhost event
  WebSocket. Reports about weaknesses in these controls are especially welcome.
