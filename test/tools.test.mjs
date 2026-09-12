// The manifest itself, and the behaviours a transport relies on.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { VPNDetection } from 'vpndetection';

import { BATCH_LIMIT, createTools } from '../dist/index.js';

const data = JSON.parse(readFileSync(new URL('../testdata/testdata.json', import.meta.url), 'utf8'));

// MCP names the allowed characters explicitly; a name outside them is a tool
// some clients will refuse to surface at all.
const NAME_CHARS = /^[A-Za-z0-9_.-]{1,128}$/;

function toolsFor(fetchImpl, opts = {}) {
    const client = new VPNDetection({ apiKey: 'k', cache: false, fetch: fetchImpl });
    return createTools({ client: client, ...opts });
}

function serving(body, status = 200) {
    return async () => new Response(JSON.stringify(body), {
        status: status, headers: { 'content-type': 'application/json' },
    });
}

test('every tool is well formed', () => {
    for (const { tool } of toolsFor(serving({}))) {
        assert.match(tool.name, NAME_CHARS, tool.name);
        assert.ok(tool.description.length > 40, `${tool.name}: description too thin`);
        assert.equal(tool.inputSchema.type, 'object', tool.name);
        assert.ok(tool.outputSchema, `${tool.name}: no outputSchema`);
        assert.equal(tool.annotations.readOnlyHint, true, `${tool.name}: must be read-only`);
    }
});

test('no tool downloads a dataset', () => {
    const names = toolsFor(serving({})).map((d) => d.tool.name);
    assert.deepEqual(names, [
        'lookup_ip', 'lookup_ips', 'list_databases', 'database_metadata', 'database_checksum',
    ]);
    for (const n of names) {
        assert.doesNotMatch(n, /download/, 'a download tool would hand an agent a multi-GB file');
    }
});

test('the dataset tools can be withheld', () => {
    const names = toolsFor(serving({}), { database: false }).map((d) => d.tool.name);
    assert.deepEqual(names, ['lookup_ip', 'lookup_ips']);
});

test('the batch cap is published and enforced', async () => {
    const defs = toolsFor(serving({ ip: '1.1.1.1', is_vpn: false }));
    const batch = defs.find((d) => d.tool.name === 'lookup_ips');
    assert.equal(batch.tool.inputSchema.properties.ips.maxItems, BATCH_LIMIT);

    const tooMany = Array.from({ length: BATCH_LIMIT + 1 }, (_, i) => `9.9.${(i >> 8) & 255}.${i & 255}`);
    const out = await batch.handler({ ips: tooMany });
    assert.equal(out.isError, true, 'over the cap must be refused, not silently truncated');
    assert.equal(out.structuredContent, undefined, 'an error must not be validated as a success');
});

test('an upstream failure becomes a tool execution error, not a throw', async () => {
    const defs = toolsFor(serving({ error: 'no such dataset' }, 404));
    const meta = defs.find((d) => d.tool.name === 'database_metadata');
    const out = await meta.handler({ dataset_id: 'nope' });
    assert.equal(out.isError, true);
    assert.equal(out.structuredContent, undefined, 'an error must not be validated as a success');
    assert.ok(JSON.parse(out.content[0].text).error.kind, 'the error carries a kind the model can act on');
});

// The hosted server depends on this package AND on `vpndetection`, so the two
// can each resolve their own copy of the module. Two copies of a class are two
// identities, so an `instanceof` check would quietly report every upstream
// failure as `internal` - losing the real kind and the retryable flag. This
// stands in a foreign error object carrying the right shape and no shared
// prototype, which is exactly what that situation produces.
test('an upstream error is classified by shape, not by class identity', async () => {
    const foreign = Object.assign(new Error('invalid API key'), {
        name: 'VPNDetectionError',
        kind: 'unauthorized',
        retryable: false,
    });
    const out = await throwingClient(foreign).handler({ ip: '1.1.1.1' });

    const { error } = JSON.parse(out.content[0].text);
    assert.equal(out.isError, true);
    assert.equal(error.kind, 'unauthorized', 'a duplicate module copy must not degrade the kind');
    assert.equal(error.retryable, false);
});

test('an unrecognised throw still produces a readable error', async () => {
    const out = await throwingClient(new Error('socket exploded')).handler({ ip: '1.1.1.1' });
    const { error } = JSON.parse(out.content[0].text);
    assert.equal(error.kind, 'internal');
});

// Rejects from the CLIENT rather than from fetch: the SDK's own retry layer
// turns a transport throw into its own `network` error, so a stub one level
// lower would never reach the classifier under test.
function throwingClient(err) {
    const client = { lookup: async () => { throw err; } };
    return createTools({ client: client }).find((d) => d.tool.name === 'lookup_ip');
}

test('every lookup fixture validates against the published outputSchema', async () => {
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);

    for (const c of data.lookup) {
        const defs = toolsFor(serving(c.body, c.status));
        const lookup = defs.find((d) => d.tool.name === 'lookup_ip');
        const validate = ajv.compile(lookup.tool.outputSchema);
        const out = await lookup.handler({ ip: c.body.ip });
        assert.ok(validate(out.structuredContent),
            `${c.name}: ${ajv.errorsText(validate.errors)}`);
    }
});

test('a bogon answer also validates', async () => {
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    const defs = toolsFor(serving({}));
    const lookup = defs.find((d) => d.tool.name === 'lookup_ip');
    const validate = ajv.compile(lookup.tool.outputSchema);
    const out = await lookup.handler({ ip: '10.0.0.1' });
    assert.ok(validate(out.structuredContent), ajv.errorsText(validate.errors));
});

test('the tool list is deterministic, so clients can cache it', () => {
    const a = toolsFor(serving({})).map((d) => d.tool.name);
    const b = toolsFor(serving({})).map((d) => d.tool.name);
    assert.deepEqual(a, b);
});
