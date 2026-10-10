# Changelog

What each release changed for you, newest first. Each line is a commit's summary, linked to its full description and diff. Releases before 5.3.4 are described by their release commits.

## 6.0.2 - 2026-10-10

### Fixes

- State destructiveHint on every tool ([`33de726`](https://github.com/vpndetection-io/mcp/commit/33de7266d06c74a6cbdcb739f64f7fb67b42189a))

## 6.0.1 - 2026-10-10

### Fixes

- Take spec 2026.10.09: rotating a key needs apikeys.reveal ([`06039d8`](https://github.com/vpndetection-io/mcp/commit/06039d86cdebfd95eece42b658c2c5f57c380cf8))
- Trim the environment, and take a blank variable as unset ([`16928fc`](https://github.com/vpndetection-io/mcp/commit/16928fcef9a94f39ce1505a67c36f843e10eba3e))
- Refuse an argument my_entitlement and list_databases do not take ([`c53e551`](https://github.com/vpndetection-io/mcp/commit/c53e55122a130b9d2e9d5a5755f40657204ec5b2))

## 6.0.0 - 2026-10-07

### Breaking changes

- Serve MCP 2026-07-28 too, on MCP SDK v2; registerTools takes its Server ([`8b35e11`](https://github.com/vpndetection-io/mcp/commit/8b35e11ef8b8134bb7b4067bdc6685772225686a))

## 5.3.6 - 2026-10-03

### Features

- List the server in the official MCP registry on every release ([`0f63bef`](https://github.com/vpndetection-io/mcp/commit/0f63befc026d3f04e1ec160e4d706366d9a34672))

### Fixes

- Take spec 2026.10.03: database metadata needs no license ([`59c8ca9`](https://github.com/vpndetection-io/mcp/commit/59c8ca9a1dd7c2df6d078d9e4565a8c9ea8ab4ff))

## 5.3.5 - 2026-09-27

### Fixes

- Publish each tool's title as annotations.title too ([`9797e90`](https://github.com/vpndetection-io/mcp/commit/9797e9075c1469d4f10f5199a8f14a93533f1777))
- Take spec 2026.09.26: OAuth wording only, no tool changes ([`61911ea`](https://github.com/vpndetection-io/mcp/commit/61911eaf0b145d63ac471218b277bed7a5fa4347))

## 5.3.4 - 2026-09-24

### Fixes

- Declare is_bogon in both lookup tools' outputSchema ([`c98773c`](https://github.com/vpndetection-io/mcp/commit/c98773c3a8e27caa96378275dca1b7f18a2244f3))
