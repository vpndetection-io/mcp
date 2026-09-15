// Exercises the PUBLISHED server, spawned the way a client spawns it, against
// the staging API.
//
// The unit suite stubs the network, so it cannot see the one thing that matters
// most here: that the coverage note shrinks as a real plan widens. A tier ladder
// stated in fixtures proves nothing about what the API actually serves.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { keyFor, observableRungs, RUNGS, skipFor, UNAUTH_RUNG } from '../lib/tiers.mjs';

const BASE_URL = 'https://api-staging.vpndetection.io';
const VPN_IP = '45.83.91.1';

async function connect(rung) {
    const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', 'vpndetection-mcp'],
        env: {
            ...process.env,
            VPNDETECTION_BASE_URL: BASE_URL,
            VPNDETECTION_API_KEY: keyFor(rung),
        },
    });
    const client = new Client({ name: 'integration', version: '0' });
    await client.connect(transport);
    return client;
}

async function coverageAt(rung) {
    const client = await connect(rung);
    try {
        const out = await client.callTool({ name: 'lookup_ip', arguments: { ip: VPN_IP } });
        return out.structuredContent.coverage;
    } finally {
        await client.close();
    }
}

test('the server starts and lists its tools', async () => {
    const client = await connect(UNAUTH_RUNG);
    try {
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name);
        assert.deepEqual(names, [
            'lookup_ip', 'lookup_ips', 'my_entitlement', 'list_databases', 'database_metadata',
            'database_checksum', 'list_downloads',
        ]);
        assert.ok(!names.some((n) => n.includes('download') && n !== 'list_downloads'));
    } finally {
        await client.close();
    }
});

for (const rung of RUNGS) {
    test(`${rung.tier}: a served answer's coverage matches what came back`, {
        skip: skipFor(rung),
    }, async () => {
        const client = await connect(rung);
        try {
            const out = await client.callTool({ name: 'lookup_ip', arguments: { ip: VPN_IP } });
            const { result, coverage } = out.structuredContent;

            for (const m of coverage.included) {
                assert.ok(m in result, `${m} claimed as included but absent from the result`);
            }
            for (const m of coverage.not_included) {
                assert.ok(!(m in result), `${m} claimed as not included but present`);
            }
            assert.ok(coverage.note.length > 0);
        } finally {
            await client.close();
        }
    });
}

// The relation, not the counts. Pinning "starter leaves 8 members out" turns a
// pricing change into a red build; a higher tier covering at least as much as
// the one below it is what this server actually promises.
test('a higher tier never covers less than the tier below it', async () => {
    const rungs = observableRungs();
    if (rungs.length < 2) {
        return;
    }
    let previous = null;
    for (const rung of rungs) {
        const coverage = await coverageAt(rung);
        if (previous !== null) {
            for (const m of previous.included) {
                assert.ok(coverage.included.includes(m),
                    `${rung.tier} dropped ${m}, which ${previous.tier} covered`);
            }
        }
        previous = { tier: rung.tier, included: coverage.included };
    }
});

test('a bogon is answered locally at every tier', async () => {
    const client = await connect(UNAUTH_RUNG);
    try {
        const out = await client.callTool({ name: 'lookup_ip', arguments: { ip: '10.0.0.1' } });
        assert.equal(out.structuredContent.result.is_bogon, true);
        assert.deepEqual(out.structuredContent.coverage.not_included, []);
    } finally {
        await client.close();
    }
});

test('a key without db.download gets a readable refusal, not a crash', {
    skip: skipFor(UNAUTH_RUNG),
}, async () => {
    const client = await connect(UNAUTH_RUNG);
    try {
        const out = await client.callTool({ name: 'list_databases', arguments: {} });
        assert.equal(out.isError, true);
        assert.equal(out.structuredContent, undefined);
        assert.ok(out.content[0].text.includes('error'));
    } finally {
        await client.close();
    }
});
