# [<img src="https://s3.vpndetection.io/vpndetection-public/brand/mark.svg" alt="VPNDetection" height="28"/>](https://vpndetection.io/) VPNDetection MCP Server

[![npm](https://img.shields.io/npm/v/vpndetection-mcp.svg)](https://www.npmjs.com/package/vpndetection-mcp)
[![license](https://img.shields.io/npm/l/vpndetection-mcp.svg)](LICENSE)

The official [Model Context Protocol](https://modelcontextprotocol.io) server for the [VPNDetection](https://vpndetection.io) API.

It gives an AI agent seven read-only tools for anonymity detection: whether an address belongs to a VPN, a residential, datacenter or mobile proxy, a Tor node, a public relay, a hosting provider or a CDN, plus the catalogue of databases your organization is licensed to download.

## Getting Started

We host it at `https://mcp.vpndetection.io/mcp`, and you sign in to it with your VPNDetection account. It also runs on your own machine from npm.

### In Claude

In claude.ai or the Claude desktop app, go to **Customize > Connectors**, click **Add custom connector** and enter `https://mcp.vpndetection.io/mcp`. If Claude asks how it should identify itself, choose **Use Claude's published identity**: there's no client ID or secret to enter. Click **Connect**, sign in, pick which of your organization's API keys the connection uses, and approve. On a Team or Enterprise plan an Owner adds it once under **Organization settings > Connectors**, and each member then connects with their own account.

In Claude Code:

```bash
claude mcp add --transport http vpndetection https://mcp.vpndetection.io/mcp
```

Then run `/mcp`, pick `vpndetection` and sign in the same way. Once it's connected, ask something like *"is 45.83.91.1 a VPN?"*.

Claude never sees the key. Our server uses it on your behalf, so every call counts against that key's plan. Approving needs permission to share your organization's API keys, and asks you to confirm it's you. You can disconnect it at any time from the console, under **Settings > Sessions & devices > Connected applications**.

### In any other MCP client

Point it at `https://mcp.vpndetection.io/mcp`. A client that supports MCP authorization signs in the same way. One that doesn't can send a key instead, as `Authorization: Bearer your-key`.

### On your own machine

**No API key needed to start.** The free tier answers `ip` and `is_vpn`, and allows 1000 requests per day per source address.

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

A key unlocks the provider name, the classification databases and the proxy families. Put it in the environment:

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
| `lookup_ips` | Classify a whole list of addresses in one call, keyed by address. A long list is batched for you. |
| `my_entitlement` | What this key is entitled to and what it has spent: plan, field tier, requests so far, allowance, and when it resets. |
| `list_databases` | The databases your organization is licensed for. |
| `database_metadata` | A database's columns, sample rows, row count, build date and file sizes. |
| `database_checksum` | The published digests for one database file. |
| `list_downloads` | Your organization's recent download attempts, refusals included. |

Every tool is read-only. There is deliberately no download tool: the databases run to several GB, which is not something an agent should pull into a conversation. Fetch them with the [client libraries](https://github.com/vpndetection-io) or the API instead.

**There is deliberately no `my_ip` tool, although every client library has one.** Over a hosted transport the address our edge observes belongs to whatever proxied the call - Claude's infrastructure, not the person asking - so the tool would answer confidently and wrongly for the only reading anyone would put on it. `my_entitlement` has no such problem and is the same answer from any transport, because it describes the credential rather than the connection. A test pins the tool's absence so it cannot be added back by accident.

Usage counts against the anniversary of the subscription, not the calendar month and not the billing period. A null `hard_limit` means we never stop serving; it is not a limit of zero.

## Reading a result

Each lookup comes back with a `coverage` block beside it:

```json
{
  "result": { "ip": "45.83.91.1", "is_vpn": true },
  "coverage": {
    "included": ["ip", "is_vpn"],
    "not_included": ["is_hosting", "is_tor", "hosting", "tor", "..."],
    "note": "The fields in not_included were not returned, because this API key's plan does not include them. ..."
  }
}
```

This matters more here than in a normal client library. A field missing from a result means your plan doesn't include it, never "we checked and found nothing" - and a model reading the result on its own will otherwise treat the absence as a negative answer. `coverage` states the difference explicitly so it can't.

## Other Libraries

There are official VPNDetection client libraries available for many languages including PHP, Python, Go, Java, Ruby, and many popular frameworks such as Django, Rails, and Laravel. See our GitHub at https://github.com/vpndetection-io for more.

## About VPNDetection

VPN Detection API: Accurate anonymity detection identifying VPNs, residential proxies, hosting servers, Tor nodes, CDNs, relays and more.

[<img src="https://s3.vpndetection.io/vpndetection-public/brand/mark.svg" alt="VPNDetection" height="64"/>](https://vpndetection.io/)

## License

This project is licensed under the [MIT License](LICENSE).
