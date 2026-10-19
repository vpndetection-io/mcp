// server.json is what the official MCP registry lists, and the release workflow publishes it
// right after npm. The registry takes its version as the npm version it points at, so the two
// must agree before a tag, not after a failed publish.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const server = JSON.parse(readFileSync(new URL('../server.json', import.meta.url), 'utf8'));
const release = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');

test('server.json names this package at its version', () => {
    assert.equal(server.name, pkg.mcpName);
    assert.equal(server.version, pkg.version);
    assert.equal(server.packages.length, 1);
    assert.equal(server.packages[0].identifier, pkg.name);
    assert.equal(server.packages[0].version, pkg.version);
});

// The release signs in for one domain, which may publish only names under that domain reversed.
// A name outside it is refused by the registry after npm has already taken the version.
test('server.json names a server the release may publish', () => {
    const login = release.match(/login dns --domain (\S+)/);
    assert.ok(login, 'release.yml signs in to the registry by DNS');
    const namespace = login[1].split('.').reverse().join('.');
    assert.ok(server.name.startsWith(`${namespace}/`), `${server.name} is outside ${namespace}/`);
});
