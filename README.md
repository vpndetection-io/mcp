# [<img src="https://s3.vpndetection.io/vpndetection-public/brand/mark.svg" alt="VPNDetection" height="28"/>](https://vpndetection.io/) VPNDetection MCP Server

[![npm](https://img.shields.io/npm/v/vpndetection-mcp.svg)](https://www.npmjs.com/package/vpndetection-mcp)
[![license](https://img.shields.io/npm/l/vpndetection-mcp.svg)](LICENSE)

The official [Model Context Protocol](https://modelcontextprotocol.io) server for the [VPNDetection](https://vpndetection.io) API.

It gives an AI agent seven read-only tools for anonymity detection: whether an address belongs to a VPN, a residential, datacenter, mobile or public proxy, a Tor node, a privacy relay or web gateway, a hosting provider or a CDN; whether a crawler or other bot uses it, and whose; whether it is anycast, or a mobile carrier's or satellite operator's space; whether an SSH, mail or web server or an open DNS resolver answered on it, or a BitTorrent client was seen on it; plus the database catalog and where your organization's license for each one stands.

## Getting Started

We host it at `https://mcp.vpndetection.io/mcp`, and you sign in to it with your VPNDetection account. It also runs on your own machine from npm.

### In Claude

In claude.ai, the desktop app or Cowork, add VPNDetection from [Claude's connectors directory](https://claude.ai/directory/vpndetection), or add `https://mcp.vpndetection.io/mcp` yourself as a custom connector and choose **Use Claude's published identity** when asked. In Claude Code, install our plugin, which adds the server with skills:

```console
/plugin marketplace add vpndetection-io/claude-plugin
/plugin install vpndetection@vpndetection
```

Either way you sign in with your VPNDetection account, and Claude never sees your API key. The steps, the skills and how to disconnect: [docs.vpndetection.io/integrations/claude](https://docs.vpndetection.io/integrations/claude).

### In ChatGPT and Codex

VPNDetection is in the plugin directory ChatGPT and Codex share: [add it from its listing](https://chatgpt.com/plugins/plugin_asdk_app_6accd4f290588191a74086b26d749253). Codex also installs our plugin from the command line, which adds the server with skills:

```console
codex plugin marketplace add vpndetection-io/openai-plugin
codex plugin add vpndetection@vpndetection
codex mcp login vpndetection
```

Either way you sign in with your VPNDetection account, and neither sees your API key. The steps: [docs.vpndetection.io/integrations/chatgpt](https://docs.vpndetection.io/integrations/chatgpt) and [docs.vpndetection.io/integrations/codex](https://docs.vpndetection.io/integrations/codex). On the OpenAI API, the Responses API's `mcp` tool takes the server as its `server_url` and your key as its `authorization`.

### In Gemini CLI

Install our extension, which runs the npm package below on your machine:

```console
gemini extensions install https://github.com/vpndetection-io/mcp
```

It asks for your API key and keeps it in your system keychain. Leave it blank to start without one.

### In any other MCP client

Point it at `https://mcp.vpndetection.io/mcp`. A client that supports MCP authorization signs in the same way. One that doesn't can send a key instead, as `Authorization: Bearer your-key`.

### On your own machine

**No API key needed to start.** Unlimited, the free plan, answers `ip`, `is_vpn`, Tor and relay detection, `is_bot`, `is_anycast`, `hostname` (the reverse DNS name), country-level `location` and `asn` with the AS's country and RPKI status, with no daily or monthly cap, with a key or without one. Every paid plan answers every field: `is_hosting`, `is_cdn` and the four proxy flags as well, the carrier and satellite flags, the five service flags (SSH, SMTP, web, DNS resolver and BitTorrent), city-level `location`, the `company` and the `abuse` contact, whose bot uses the address in `bot`, and the provider, confidence and last-seen detail behind each flag. A free account tries every field.

Add this to your MCP client's config:

```json
{
  "mcpServers": {
    "vpndetection": {
      "command": "npx",
      "args": ["-y", "vpndetection-mcp"]
    }
  }
}
```

Requires Node.js 22 or newer.

A key on a paid plan unlocks every field. Put it in the environment:

```json
{
  "mcpServers": {
    "vpndetection": {
      "command": "npx",
      "args": ["-y", "vpndetection-mcp"],
      "env": { "VPNDETECTION_API_KEY": "your-key" }
    }
  }
}
```

`VPNDETECTION_BASE_URL` overrides the endpoint if you need to point somewhere else.

## Tools

| Tool | What it answers |
|---|---|
| `lookup_ip` | Classify one address. |
| `lookup_ips` | Classify a whole list of addresses in one call, keyed by address. A long list is batched for you. Needs a key on a paid plan; with a key on the free plan, a list of up to 10 addresses is looked up one address at a time instead. |
| `my_entitlement` | What this key is entitled to and what it has spent: plan, field tier, requests so far, allowance, and when it resets. |
| `list_databases` | Every database we publish, with its `standing` for your organization: `licensed`, `expired` or `unlicensed`. |
| `database_metadata` | A database's columns, sample rows, row count, build date and file sizes. |
| `database_checksum` | The published digests for one database file. |
| `list_downloads` | Your organization's recent download attempts, refusals included. |

The database tools need a key with the `db.download` scope, which your organization's `Default` key has.

Every tool is read-only. There is deliberately no download tool: the databases run to several GB, which is not something an agent should pull into a conversation. Fetch them with the [client libraries](https://github.com/vpndetection-io) or the API instead.

**There is deliberately no `my_ip` tool, although every client library has one.** Over a hosted transport the address our edge observes belongs to whatever proxied the call - Claude's infrastructure, not the person asking - so the tool would answer confidently and wrongly for the only reading anyone would put on it. `my_entitlement` has no such problem and is the same answer from any transport, because it describes the credential rather than the connection. A test pins the tool's absence so it cannot be added back by accident.

A paid plan's usage counts against the anniversary of the subscription, not the calendar month and not the billing period, and the free plan's counts its trial, over the window the answer gives. `hard_limit` is where full answers stop, and a null one means they never do; it is not a limit of zero.

## Reading a result

Each lookup comes back with a `coverage` block beside it:

```json
{
  "result": { "ip": "45.83.91.1", "is_bogon": false, "is_vpn": true, "is_relay": false, "...": "..." },
  "coverage": {
    "included": ["ip", "is_bogon", "is_vpn", "is_relay", "is_tor", "is_bot", "is_anycast", "relay", "tor", "location", "asn", "hostname"],
    "not_included": ["is_hosting", "is_cdn", "vpn", "hosting", "..."],
    "note": "The fields in not_included were not returned, because this API key's plan does not include them. ..."
  }
}
```

This matters more here than in a normal client library. A field missing from a result means your plan doesn't include it, never "we checked and found nothing" - and a model reading the result on its own will otherwise treat the absence as a negative answer. `coverage` states the difference explicitly so it can't.

An answer to a key on the free plan also carries `trial_expired`: false while its organization's trial of every field lasts, and true once the answer is Unlimited's, which `coverage.note` then says.

An answer to a key on a paid plan carries `cap_reached` the same way: false while the answer has every field, and true once its organization's overage cap is reached. Past the cap a lookup is answered with Unlimited's fields and not billed, and `coverage.note` says the cap left the other fields out, not the plan. Raising or removing the cap in Billing brings them back.

## Other Libraries

There are official VPNDetection client libraries available for many languages including PHP, Python, Go, Java, Ruby, and many popular frameworks such as Django, Rails, and Laravel. See our GitHub at https://github.com/vpndetection-io for more.

## About VPNDetection

VPN Detection API: Accurate anonymity detection identifying VPNs, residential proxies, hosting servers, Tor nodes, CDNs, relays and more.

[<img src="https://s3.vpndetection.io/vpndetection-public/brand/mark.svg" alt="VPNDetection" height="64"/>](https://vpndetection.io/)

## License

This project is licensed under the [MIT License](LICENSE).
