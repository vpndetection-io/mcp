// Asserts the shared conformance corpus, from the MCP server's side of it.
//
// The other twelve SDKs assert that the corpus decodes into the right client
// values. This one asserts the thing only it can get wrong: that a tier-gated
// answer reaches a model carrying an explicit statement of what was NOT checked,
// so an absent member is never read as a negative finding.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { VPNDetection } from 'vpndetection';

import { createTools, LOOKUP_GATED_MEMBERS } from '../dist/index.js';

const data = JSON.parse(readFileSync(new URL('../testdata/testdata.json', import.meta.url), 'utf8'));

function serving(body, status = 200) {
    const state = { calls: 0 };
    const fn = async () => {
        state.calls++;
        return new Response(JSON.stringify(body), {
            status: status, headers: { 'content-type': 'application/json' },
        });
    };
    return { fetch: fn, state: state };
}

function toolsFor(fetchImpl) {
    const client = new VPNDetection({ apiKey: 'k', cache: false, fetch: fetchImpl });
    const byName = new Map(createTools({ client: client }).map((d) => [d.tool.name, d]));
    return byName;
}

test('every lookup fixture reports exactly the members it did not cover', async () => {
    for (const c of data.lookup) {
        const stub = serving(c.body, c.status);
        const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: c.body.ip });
        const got = out.structuredContent;

        const expected = LOOKUP_GATED_MEMBERS.filter((m) => !(m in c.body));
        assert.deepEqual(got.coverage.not_included, expected, `${c.name}: not_included`);
        assert.deepEqual(got.result, c.body, `${c.name}: result is the served body, verbatim`);

        for (const m of got.coverage.included) {
            assert.ok(m in c.body, `${c.name}: ${m} reported as included but is absent`);
        }
    }
});

test('the free shape names every gated member as not covered', async () => {
    const free = data.lookup.find((c) => c.name === 'free-not-vpn');
    const stub = serving(free.body);
    const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: free.body.ip });

    assert.deepEqual(out.structuredContent.coverage.not_included, [...LOOKUP_GATED_MEMBERS]);
    assert.deepEqual(out.structuredContent.coverage.included, ['ip', 'is_vpn']);
    assert.match(out.structuredContent.coverage.note, /not a negative result/);
});

test('a max answer that found nothing reports full coverage, not absence', async () => {
    const max = data.lookup.find((c) => c.name === 'max-nothing-found');
    const stub = serving(max.body);
    const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: max.body.ip });

    assert.deepEqual(out.structuredContent.coverage.not_included, []);
    assert.match(out.structuredContent.coverage.note, /real negative result/);
});

// The distinction the whole coverage note exists to carry: starter serves
// `is_hosting` but not the `hosting` object, so one is a real answer and the
// other was never looked at.
test('starter separates a served flag from an unbought detail object', async () => {
    const starter = data.lookup.find((c) => c.name === 'starter-vpn-hit');
    const stub = serving(starter.body);
    const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: starter.body.ip });
    const cov = out.structuredContent.coverage;

    assert.ok(cov.included.includes('is_hosting'));
    assert.ok(cov.not_included.includes('hosting'));
    assert.ok(cov.not_included.includes('is_resproxy'));
});

test('the note reaches a client that only renders content', async () => {
    const free = data.lookup.find((c) => c.name === 'free-not-vpn');
    const stub = serving(free.body);
    const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: free.body.ip });

    assert.equal(out.content[0].type, 'text');
    assert.ok(out.content[0].text.includes(out.structuredContent.coverage.note));
});

test('a bogon is answered locally and says so', async () => {
    const stub = serving({});
    for (const c of data.isBogon.filter((x) => x.expect).slice(0, 8)) {
        const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: c.ip });
        assert.match(out.structuredContent.coverage.note, /non-routable/, c.ip);
    }
    assert.equal(stub.state.calls, 0, 'a bogon must never reach the network');
});

// The corpus fixes the bogon shape as every flag present and false and every
// detail object present and empty, so nothing about it can read as uncovered.
test('a bogon is answered in the full documented shape', async () => {
    const stub = serving({});
    const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: '10.0.0.1' });
    const body = out.structuredContent.result;

    for (const flag of data.bogonResponse.flagsFalse) {
        assert.equal(body[flag], false, `${flag} must be present and false`);
    }
    for (const obj of data.bogonResponse.emptyObjects) {
        assert.deepEqual(body[obj], {}, `${obj} must be present and empty`);
    }
    assert.deepEqual(out.structuredContent.coverage.not_included, [],
        'nothing is uncovered in a locally synthesized answer');
});

test('batch coverage comes from a served answer, never from a bogon', async () => {
    const free = data.lookup.find((c) => c.name === 'free-not-vpn');
    const stub = serving(free.body);
    const out = await toolsFor(stub.fetch).get('lookup_ips')
        .handler({ ips: ['10.0.0.1', free.body.ip] });

    assert.deepEqual(out.structuredContent.coverage.not_included, [...LOOKUP_GATED_MEMBERS],
        'the bogon full shape must not be read as full plan coverage');
    assert.equal(Object.keys(out.structuredContent.results).length, 2);
});

test('an all-bogon batch declines to claim coverage', async () => {
    const stub = serving({});
    const out = await toolsFor(stub.fetch).get('lookup_ips')
        .handler({ ips: ['10.0.0.1', '192.168.1.1'] });

    assert.match(out.structuredContent.coverage.note, /No served answer/);
    assert.equal(stub.state.calls, 0);
});
