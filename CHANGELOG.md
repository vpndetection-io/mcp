# Changelog

What each release changed for you, newest first. Each line is a commit's summary, linked to its full description and diff. Releases before 5.3.4 are described by their release commits.

## 6.5.0 - 2026-11-14

### Features

- Re-pin the spec to 2026.11.14: is_bogon on every answer, and provider names ([`9a54043`](https://github.com/vpndetection-io/mcp/commit/9a540436021fdd9e930766748fe85f4323b96922))

### Fixes

- Pass a served answer marked is_bogon on as served ([`4bc4932`](https://github.com/vpndetection-io/mcp/commit/4bc493285dc65a1efb9f2bd18ebc096f9f22e3d6))

## 6.4.3 - 2026-11-12

### Fixes

- Re-pin the spec to 2026.11.12: a batch of one address without a key ([`cc00bca`](https://github.com/vpndetection-io/mcp/commit/cc00bcab8d2891ac11a839caa695a372479b91c0))

## 6.4.2 - 2026-11-11

### Fixes

- Require vpndetection 5.13.2: Unlimited, the free plan, never the Unlimited tier ([`b1f8729`](https://github.com/vpndetection-io/mcp/commit/b1f8729999e82d6d525bf8f06125cd15b140b390))

## 6.4.1 - 2026-11-11

### Fixes

- Say the free plan's daily trial, never a trial key, and re-pin the spec ([`0cd2c83`](https://github.com/vpndetection-io/mcp/commit/0cd2c83098e92ad9408ec9e3262ab8f147bc2f2b))
- Require vpndetection 5.13.1: the free plan's daily trial, never a trial key ([`9c64eb8`](https://github.com/vpndetection-io/mcp/commit/9c64eb89257229214f1fba782488f313b6fe292a))

## 6.4.0 - 2026-11-11

### Features

- Look a trial key's short batch up one address at a time, and re-pin the spec ([`25d0510`](https://github.com/vpndetection-io/mcp/commit/25d0510e777d22ab15c3c4123f5d0446e8b18b7b))
- Require vpndetection 5.13.0: trial_expired on a trial key's answers ([`9f75a9f`](https://github.com/vpndetection-io/mcp/commit/9f75a9faa972402bdcb40d7c17ab9033d643d4f5))

## 6.3.2 - 2026-11-11

### Fixes

- Name the Unlimited tier and its terms, and re-pin the spec ([`c7cd0aa`](https://github.com/vpndetection-io/mcp/commit/c7cd0aa49ce3d8edf23c1935741c8f5079268bda))

## 6.3.1 - 2026-11-11

### Fixes

- Re-pin the spec's 2026.11.11 rebuild: plainer words on lookups without a key ([`299fdb1`](https://github.com/vpndetection-io/mcp/commit/299fdb191b7f51bd2df122637770740375eb6544))

## 6.3.0 - 2026-11-11

### Features

- Re-pin the spec to 2026.11.11: a lookup without a key answers more ([`954487e`](https://github.com/vpndetection-io/mcp/commit/954487edf87ebf5221ea733fb72ecc8b54d5d819))

## 6.2.9 - 2026-11-11

### Features

- Install as a Gemini CLI extension ([`ad1a0e3`](https://github.com/vpndetection-io/mcp/commit/ad1a0e3ba1a2b22763c293b4fe526d38e1e89d42))

## 6.2.8 - 2026-11-11

### Fixes

- Re-pin the spec to 2026.11.10: what a datacenter proxy is ([`25cd584`](https://github.com/vpndetection-io/mcp/commit/25cd584c7f2d2f0b9a88265489f4346a7321c6ea))

## 6.2.7 - 2026-11-08

### Fixes

- Re-pin the spec to 2026.11.08: reworded operation descriptions ([`cf4beb6`](https://github.com/vpndetection-io/mcp/commit/cf4beb64dfc765d4defec12f3ffdced752049531))

## 6.2.6 - 2026-11-05

### Fixes

- Re-pin the spec to 2026.11.05: a proxy's dates outlive the window ([`26e7cab`](https://github.com/vpndetection-io/mcp/commit/26e7cabe080563bdd339b4aacacbdac3186c841e))

## 6.2.5 - 2026-11-04

### Fixes

- Re-pin the spec to 2026.11.03: a proxy flag keeps its last values ([`43a9ffd`](https://github.com/vpndetection-io/mcp/commit/43a9ffdde8e742b3f973e7e0d7831c76dfc89ccb))

## 6.2.4 - 2026-11-03

### Fixes

- Re-pin the spec's 2026.11.02 republish: ID in the output descriptions ([`5d1d6e1`](https://github.com/vpndetection-io/mcp/commit/5d1d6e1953231b84e483277f2036ae63c75aac3c))

## 6.2.3 - 2026-11-02

### Fixes

- Re-pin the spec to 2026.11.02: the spent-allowance messages ([`55cd7ef`](https://github.com/vpndetection-io/mcp/commit/55cd7efcd45191a637d9e0218e70f723f63d237c))
- Write ID, not id, in the tool descriptions ([`0c0ed75`](https://github.com/vpndetection-io/mcp/commit/0c0ed753672bc363060a6d3d4d443df561696e44))

## 6.2.2 - 2026-10-29

### Fixes

- Hint open world on the lookups alone, and say bogons skip the API ([`15fe901`](https://github.com/vpndetection-io/mcp/commit/15fe901dd872a70ef3eda2e833e47a12152297f8))

## 6.2.1 - 2026-10-26

### Fixes

- Re-pin the spec to 2026.10.25: Retry-After on a 429 ([`ddf8611`](https://github.com/vpndetection-io/mcp/commit/ddf861161843b3d55bbd0fad0de97acf31b839f3))

## 6.2.0 - 2026-10-20

### Features

- Re-pin the spec to 2026.10.20: location and asn in every keyed answer ([`9a5b59c`](https://github.com/vpndetection-io/mcp/commit/9a5b59c11295c3f3f738159e727a93df134e6563))

## 6.1.4 - 2026-10-19

### Fixes

- Answer every address lookup_ips was given, `__proto__` included ([`45a6acf`](https://github.com/vpndetection-io/mcp/commit/45a6acf31f2e664a19d1d9f0d1a082ea9807f9f0))

## 6.1.3 - 2026-10-19

### Fixes

- Take spec 2026.10.19 ([`afc1826`](https://github.com/vpndetection-io/mcp/commit/afc1826cbeda653a124d6f3d1104afb365acef70))

## 6.1.2 - 2026-10-19

### Fixes

- List in the MCP registry as io.vpndetection/mcp ([`e974ae2`](https://github.com/vpndetection-io/mcp/commit/e974ae2020815b2d62ea7e128732017287f8c4a3))

## 6.1.1 - 2026-10-18

### Fixes

- Take spec 2026.10.18 again: pubproxy's num_ports and num_proxies ([`cf12856`](https://github.com/vpndetection-io/mcp/commit/cf12856f12b270644b146808164b1f099f0a91a0))
- Name public proxies and web gateways in lookup_ip's description ([`4c91de9`](https://github.com/vpndetection-io/mcp/commit/4c91de9fe2e7de6425d2683431c81e7d70f91050))

## 6.1.0 - 2026-10-18

### Features

- Take spec 2026.10.18: is_pubproxy and the pubproxy detail ([`541a290`](https://github.com/vpndetection-io/mcp/commit/541a290d6e7741e16fb3caae4cdc9c1683aa2ee5))

## 6.0.5 - 2026-10-17

### Fixes

- Take spec 2026.10.16: dynamic client registration ([`49a3005`](https://github.com/vpndetection-io/mcp/commit/49a3005dd34dc01df4cf335225374a9fdb159892))

## 6.0.4 - 2026-10-15

### Fixes

- Take spec 2026.10.15: catalog and neighbors in US spelling ([`f25712a`](https://github.com/vpndetection-io/mcp/commit/f25712a93c8a07e7a9aacf092c61114b83579f27))

## 6.0.3 - 2026-10-13

### Fixes

- Refuse an argument a tool does not take, on every tool ([`7e4ad93`](https://github.com/vpndetection-io/mcp/commit/7e4ad937f50a19a919ab9962874a78315ff2ca42))

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
