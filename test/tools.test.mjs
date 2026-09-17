// The manifest itself, and the behaviors a transport relies on.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { VPNDetection } from 'vpndetection';

import { createTools, DOWNLOADS_LIMIT } from '../dist/index.js';

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

test('no tool downloads a database', () => {
    const names = toolsFor(serving({})).map((d) => d.tool.name);
    assert.deepEqual(names, [
        'lookup_ip', 'lookup_ips', 'my_entitlement', 'list_databases', 'database_metadata',
        'database_checksum', 'list_downloads',
    ]);
    for (const n of names) {
        assert.doesNotMatch(n, /download(?!s$)/,
            'a download tool would hand an agent a multi-GB file');
    }
});

test('the database tools can be withheld', () => {
    const names = toolsFor(serving({}), { database: false }).map((d) => d.tool.name);
    assert.deepEqual(names, ['lookup_ip', 'lookup_ips', 'my_entitlement']);
});

// Uncapped by decision: the caller's whole list goes in one call and the SDK
// splits it at the endpoint's own bound. A private address is answered locally,
// so it never takes room in a batch.
test('lookup_ips takes any number of addresses, one POST /batch per 1000', async () => {
    const posts = [];
    const batchServer = async (input) => {
        const { ips } = JSON.parse(await input.text());
        posts.push({ method: input.method, path: new URL(input.url).pathname, ips: ips });
        const results = Object.fromEntries(ips.map((ip) => [ip, { ip: ip, is_vpn: false }]));
        return new Response(JSON.stringify({ results: results, errors: {} }), {
            status: 200, headers: { 'content-type': 'application/json' },
        });
    };
    const batch = toolsFor(batchServer).find((d) => d.tool.name === 'lookup_ips');
    assert.equal(batch.tool.inputSchema.properties.ips.maxItems, undefined, 'no cap is published');

    const routable = Array.from({ length: 2500 }, (_, i) => `9.9.${(i >> 8) & 255}.${i & 255}`);
    const bogons = Array.from({ length: 100 }, (_, i) => `10.0.0.${i}`);
    const out = await batch.handler({ ips: [...routable, ...bogons] });

    assert.equal(out.isError, undefined, 'a long list must be answered, not refused');
    assert.deepEqual(posts.map((p) => `${p.method} ${p.path}`), Array(3).fill('POST /batch'));
    assert.deepEqual(posts.map((p) => p.ips.length).sort((a, b) => b - a), [1000, 1000, 500]);
    assert.deepEqual(posts.flatMap((p) => p.ips).sort(), [...routable].sort(),
        'every routable address is sent exactly once, and no private one is sent at all');

    const { results } = out.structuredContent;
    assert.equal(Object.keys(results).length, 2600, 'one entry per address');
    assert.ok(routable.every((ip) => results[ip].is_vpn === false), 'a served answer per address');
    assert.ok(bogons.every((ip) => results[ip].is_bogon === true), 'a local answer per bogon');
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

// Every nullable field null at once, so the schema has to admit each of them.
const NULL_CATALOG = {
    databases: [{
        base: 'cdn_ip', name: 'CDN IP', summary: 'CDN ranges', license_type: null,
        starts: null, expires: null, renews_at: null, notice_due_at: null,
        in_term: false, standing: 'unlicensed',
        versions: [{ id: 'cdn_ip_v1', version: 1, formats: [{ format: 'mmdb', bytes: null }] }],
    }],
};

test('a catalog with every nullable field null validates', async () => {
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    const def = toolsFor(serving(NULL_CATALOG)).find((d) => d.tool.name === 'list_databases');
    const validate = ajv.compile(def.tool.outputSchema);
    const out = await def.handler({});
    assert.equal(out.isError, undefined);
    assert.ok(validate(out.structuredContent), ajv.errorsText(validate.errors));
});

// JSON Schema has no `nullable`; OpenAPI 3.0 does. A validator that follows JSON
// Schema ignores the keyword and rejects the nulls above, as the Python MCP SDK
// does. Ajv honors it as an OpenAPI extension, so the test above passes with or
// without it and cannot be the check.
test('no published schema leans on OpenAPI\'s nullable', () => {
    for (const { tool } of toolsFor(serving({}))) {
        assert.deepEqual(keywordPaths(tool.inputSchema, 'nullable'), [], `${tool.name}: inputSchema`);
        assert.deepEqual(keywordPaths(tool.outputSchema, 'nullable'), [], `${tool.name}: outputSchema`);
    }
});

// Both spellings exist and only one is accepted, so the description is the only
// thing standing between a model that has just read `base` and a refusal that
// looks like a missing database. Shared constant, so the two cannot drift apart -
// they did, and `database_checksum` carried a truncated copy.
test('every id-taking tool names both spellings', () => {
    const byName = new Map(toolsFor(serving({})).map((d) => [d.tool.name, d]));
    for (const n of ['database_metadata', 'database_checksum']) {
        const described = byName.get(n).tool.inputSchema.properties.dataset_id.description;
        assert.match(described, /versions\[\]\.id/, `${n}: does not name the versioned id`);
        assert.match(described, /base id/, `${n}: does not warn about the base id`);
    }
});

// The unwrap DEPTH is the documented way these bindings break: the nodejs SDK
// shipped 1.0.x reading a top-level `sha256` off a body that nests it.
test('each database tool answers at the documented depth', async () => {
    const catalog = { databases: [{ base: 'cdn_ip', versions: [{ id: 'cdn_ip_v1' }] }] };
    const sums = { md5: 'm', sha1: 's1', sha256: 's256', sha512: 's512' };

    const listed = await toolsFor(serving(catalog))
        .find((d) => d.tool.name === 'list_databases').handler({});
    assert.deepEqual(listed.structuredContent, catalog,
        'the listing is returned as served, under `databases`');

    const meta = { id: 'cdn_ip_v1', entries: 5 };
    const described = await toolsFor(serving(meta))
        .find((d) => d.tool.name === 'database_metadata').handler({ dataset_id: 'cdn_ip_v1' });
    assert.equal(described.structuredContent.id, 'cdn_ip_v1', 'metadata is NOT wrapped');

    const digested = await toolsFor(serving({ checksums: sums }))
        .find((d) => d.tool.name === 'database_checksum')
        .handler({ dataset_id: 'cdn_ip_v1', format: 'csvgz' });
    assert.equal(digested.structuredContent.sha256, undefined, 'digests must stay nested');
    assert.deepEqual(digested.structuredContent.checksums, sums);

    const history = { downloads: [{ dataset_id: 'cdn_ip_v1', outcome: 'denied', http_status: 403 }] };
    const attempts = await toolsFor(serving(history))
        .find((d) => d.tool.name === 'list_downloads').handler({});
    assert.deepEqual(attempts.structuredContent, history,
        'a refusal is carried through, not filtered out');
});

// The bound a client is SHOWN and the bound it MEETS come from one declaration,
// so they cannot drift. Two lookalike zod objects is how they used to.
test('the downloads window is published and enforced', async () => {
    const def = toolsFor(serving({ downloads: [] })).find((d) => d.tool.name === 'list_downloads');
    const { minimum, maximum } = def.tool.inputSchema.properties.limit;
    assert.equal(maximum, DOWNLOADS_LIMIT);

    for (const outside of [maximum + 1, minimum - 1]) {
        const out = await def.handler({ limit: outside });
        assert.equal(out.isError, true, `${outside} must be refused, not silently clamped`);
        assert.equal(out.structuredContent, undefined, 'an error must not be validated as a success');
    }
});

test('the tool list is deterministic, so clients can cache it', () => {
    const a = toolsFor(serving({})).map((d) => d.tool.name);
    const b = toolsFor(serving({})).map((d) => d.tool.name);
    assert.deepEqual(a, b);
});

const ENTITLEMENT_BODY = {
    org_id: '85bb51e4-2eb6-4a31-8e4d-02ba8b98fe61',
    apikey: { id: '0ab424cc-7619-4dad-b027-afacdc2cedb0', expires: null, allowed_cidrs: [] },
    plan: { key: 'max', tier: 'max' },
    usage: {
        requests: 580,
        quota: 5000000,
        hard_limit: null,
        window_start: '2026-09-04T07:00:00Z',
        window_end: '2026-10-04T07:00:00Z',
    },
};

test('my_entitlement reports the plan and the usage', async () => {
    const def = toolsFor(serving(ENTITLEMENT_BODY)).find((d) => d.tool.name === 'my_entitlement');

    const result = await def.handler({});

    assert.equal(result.structuredContent.entitlement.plan.key, 'max');
    assert.equal(result.structuredContent.entitlement.plan.tier, 'max');
    assert.equal(result.structuredContent.entitlement.usage.requests, 580);
    // Null means NEVER stop, which is not the same as a limit of zero, and the
    // description says so because a model would otherwise read it as a stop.
    assert.equal(result.structuredContent.entitlement.usage.hard_limit, null);
});

// The number it reports moves with every other call, which is the whole point
// of asking - a model told otherwise could cache it across a long session.
test('my_entitlement is not advertised as idempotent', () => {
    const def = toolsFor(serving(ENTITLEMENT_BODY)).find((d) => d.tool.name === 'my_entitlement');
    assert.equal(def.tool.annotations.idempotentHint, false);
});

// Over a hosted transport the observed address belongs to whatever proxied the
// call, so a my_ip tool would answer confidently and wrongly.
test('there is no my_ip tool', () => {
    const names = toolsFor(serving({})).map((d) => d.tool.name);
    assert.ok(!names.includes('my_ip'), 'my_ip cannot mean what a model would read it to mean');
});

// A rejected argument is the one failure a model can fix unaided, so it must not
// arrive as `internal` - which says the server broke and invites an identical
// retry. Every one of these used to.
test('a rejected argument is the model\'s to fix, not an internal failure', async () => {
    const defs = toolsFor(serving({}));
    const byName = new Map(defs.map((d) => [d.tool.name, d]));
    const cases = [
        ['lookup_ip', { ip: 12345 }, 'ip'],
        ['lookup_ips', { ips: [] }, 'ips'],
        ['database_checksum', { dataset_id: 'cdn_ip_v1', format: 'zip' }, 'format'],
        ['list_downloads', { limit: DOWNLOADS_LIMIT + 1 }, 'limit'],
        ['list_downloads', { limit: 0 }, 'limit'],
    ];
    for (const [name, args, field] of cases) {
        const res = await byName.get(name).handler(args);
        assert.equal(res.isError, true, name);
        const { error } = JSON.parse(res.content[0].text);
        assert.equal(error.kind, 'invalid_argument', `${name} must not be 'internal'`);
        assert.equal(error.retryable, false, `${name} is not worth retrying unchanged`);
        // zod's formatter names the field; the raw `issues` array is JSON the
        // model would have to decode before it could act on it.
        assert.match(error.message, new RegExp(field), `${name} must name the field`);
        assert.doesNotMatch(error.message, /"code":/, `${name} must not be a raw issue array`);
    }
});

// zod rejects an array argument one issue per bad element. Spelled out in full, a
// megabyte of numbers passed as `ips` came back as ~37 MB of error text.
test('a rejection lists its first ten issues and counts the rest', async () => {
    const lookupIps = toolsFor(serving({})).find((d) => d.tool.name === 'lookup_ips');
    const cases = [
        [1, undefined],
        [10, undefined],
        [11, '... and 1 more issue'],
        [50000, '... and 49990 more issues'],
    ];
    for (const [bad, tail] of cases) {
        const res = await lookupIps.handler({ ips: Array.from({ length: bad }, (_, i) => i) });
        assert.equal(res.isError, true, `${bad} bad`);
        const { error } = JSON.parse(res.content[0].text);
        assert.equal(error.kind, 'invalid_argument', `${bad} bad`);

        const at = [...error.message.matchAll(/→ at ips\[(\d+)\]/g)].map((m) => Number(m[1]));
        const firstTen = Array.from({ length: Math.min(bad, 10) }, (_, i) => i);
        assert.deepEqual(at, firstTen, `${bad} bad: the first ten are listed, in order`);
        if (tail === undefined) {
            assert.doesNotMatch(error.message, /more issue/, `${bad} bad: nothing is left to count`);
        } else {
            assert.equal(error.message.split('\n').at(-1), tail, `${bad} bad: the rest are counted`);
        }
        assert.ok(res.content[0].text.length < 2000, `${bad} bad: ${res.content[0].text.length} chars`);
    }
});

// Every bound the spec states is READ off it, not restated here: a second copy is
// free to keep advertising the old number. The default is the one a model reads as
// prose, so it is asserted against the published description.
test('the downloads bounds and default come from the spec', () => {
    const spec = JSON.parse(readFileSync(new URL('../spec/openapi.json', import.meta.url), 'utf8'));
    const { schema } = spec.paths['/api/v1/database/downloads'].get.parameters
        .find((p) => p.name === 'limit' && p.in === 'query');

    const published = toolsFor(serving({ downloads: [] }))
        .find((d) => d.tool.name === 'list_downloads').tool.inputSchema.properties.limit;
    assert.equal(published.maximum, schema.maximum);
    assert.equal(published.minimum, schema.minimum);
    assert.match(published.description, new RegExp(`defaults to ${schema.default}\\.`));
});

// Where a keyword appears in a schema. A keyword's value is never an object, so
// a PROPERTY that happens to share the name is not mistaken for one.
function keywordPaths(node, keyword, path = '') {
    if (node === null || typeof node !== 'object') {
        return [];
    }
    return Object.entries(node).flatMap(([k, v]) => {
        if (k === keyword && (v === null || typeof v !== 'object')) {
            return [`${path}/${k}`];
        }
        return keywordPaths(v, keyword, `${path}/${k}`);
    });
}
