// Asserts the shared conformance corpus, from the MCP server's side of it.
//
// The other twelve SDKs assert that the corpus decodes into the right client
// values. This one asserts the thing only it can get wrong: that a tier-gated
// answer reaches a model carrying an explicit statement of what was NOT checked,
// so an absent member is never read as a negative finding.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { VPNDetection } from 'vpndetection';

import { createTools, LOOKUP_GATED_MEMBERS } from '../dist/index.js';

const data = JSON.parse(readFileSync(new URL('../testdata/testdata.json', import.meta.url), 'utf8'));

// Answers every lookup with `body`. A batch arrives as one POST per chunk and
// is answered from the addresses in its body, `body` under each of them.
function serving(body, status = 200) {
    const state = { calls: 0 };
    const fn = async (input, init) => {
        state.calls++;
        const url = typeof input === 'string' ? input : input.url;
        let answer = body;
        if (new URL(url).pathname === '/batch') {
            const text = typeof input === 'string' ? (init?.body ?? '') : await input.text();
            const results = {};
            for (const ip of JSON.parse(text || '{}').ips ?? []) {
                results[ip] = { ...body, ip: ip };
            }
            answer = { results: results, errors: {} };
        }
        return new Response(JSON.stringify(answer), {
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

test('an answer of the required members alone names every gated member as not covered', async () => {
    const bare = data.lookup.find((c) => c.name === 'required-only-not-vpn');
    const stub = serving(bare.body);
    const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: bare.body.ip });

    assert.deepEqual(out.structuredContent.coverage.not_included, [...LOOKUP_GATED_MEMBERS]);
    assert.deepEqual(out.structuredContent.coverage.included, ['ip', 'is_vpn']);
    assert.match(out.structuredContent.coverage.note, /not a negative result/);
});

// Every answer carries is_bogon, and a paid one location and asn beside every class,
// and spec 2026.11.20's network and service members, company, hostname and abuse,
// which the corpus's other max cases predate, so they are added here from the cases
// that carry them.
const { is_bogon: SERVED_IS_BOGON } = data.lookup.find((c) => c.name === 'max-full-shape').body;
const PAID_SINCE_2026_11_20 = (() => {
    const before = data.lookup.find((c) => c.name === 'max-full-shape').body;
    const now = data.lookup.find((c) => c.name === 'paid-satellite').body;
    return Object.fromEntries(Object.entries(now)
        .filter(([m]) => !(m in before) && m !== 'location' && m !== 'asn'));
})();

test('a max answer that found nothing reports full coverage, not absence', async () => {
    const max = data.lookup.find((c) => c.name === 'max-nothing-found');
    const { location, asn } = data.lookup.find((c) => c.name === 'unlimited-location-asn').body;
    const body = {
        ...max.body, ...PAID_SINCE_2026_11_20, is_bogon: SERVED_IS_BOGON, location: location, asn: asn,
    };
    const stub = serving(body);
    const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: body.ip });

    assert.deepEqual(out.structuredContent.coverage.not_included, []);
    assert.match(out.structuredContent.coverage.note, /real negative result/);
});

// The distinction the whole coverage note exists to carry: an answer serving
// `is_hosting` but not the `hosting` object holds one real answer and one thing
// that was never looked at.
test('a served flag stays apart from a detail object that was not served', async () => {
    const flags = data.lookup.find((c) => c.name === 'flags-without-detail');
    const stub = serving(flags.body);
    const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: flags.body.ip });
    const cov = out.structuredContent.coverage;

    assert.ok(cov.included.includes('is_hosting'));
    assert.ok(cov.included.includes('is_resproxy'));
    assert.ok(cov.not_included.includes('hosting'));
    assert.ok(cov.not_included.includes('vpn'));
});

// The Unlimited tier's answer carries the Tor and relay members, location and
// asn, and coverage must name the flags a paid plan adds as not covered, never
// as false.
test('an Unlimited answer names the flags a paid plan adds as not covered', async () => {
    const unlimited = data.lookup.find((c) => c.name === 'unlimited-location-asn');
    const stub = serving(unlimited.body);
    const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: unlimited.body.ip });
    const cov = out.structuredContent.coverage;

    assert.ok(cov.included.includes('is_tor'));
    assert.ok(cov.included.includes('location'));
    assert.ok(cov.not_included.includes('is_hosting'));
    assert.ok(cov.not_included.includes('vpn'));
});

// trial_expired says which answer a free-plan key got, so it is neither a dataset
// covered nor one left out, and the result carries it verbatim.
test("a free-plan key's full answer reports full coverage and keeps trial_expired", async () => {
    const trial = data.lookup.find((c) => c.name === 'trial-full-answer');
    const body = { ...trial.body, ...PAID_SINCE_2026_11_20, is_bogon: SERVED_IS_BOGON };
    const stub = serving(body);
    const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: body.ip });
    const { result, coverage } = out.structuredContent;

    assert.equal(result.trial_expired, false);
    assert.ok(!coverage.included.includes('trial_expired'));
    assert.deepEqual(coverage.not_included, []);
    assert.match(coverage.note, /real negative result/);
});

test("a free-plan key's spent trial says so beside what was not covered", async () => {
    const spent = data.lookup.find((c) => c.name === 'trial-expired-answer');
    const stub = serving(spent.body);
    const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: spent.body.ip });
    const { result, coverage } = out.structuredContent;

    assert.equal(result.trial_expired, true);
    assert.ok(!coverage.included.includes('trial_expired'));
    assert.ok(!coverage.not_included.includes('trial_expired'));
    assert.ok(coverage.not_included.includes('is_hosting'));
    assert.match(coverage.note, /trial/);
    assert.match(coverage.note, /not a negative result/);
});

// cap_reached says a paid key's organization is past the overage cap it set, so the
// answer is Unlimited's: the cap left the fields out, never the plan, which has them.
test("a paid key past its overage cap says the cap left the fields out, not the plan", async () => {
    const capped = data.lookup.find((c) => c.name === 'cap-reached-answer');
    const stub = serving(capped.body);
    const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: capped.body.ip });
    const { result, coverage } = out.structuredContent;

    assert.equal(result.cap_reached, true);
    assert.ok(!coverage.included.includes('cap_reached'));
    assert.ok(!coverage.not_included.includes('cap_reached'));
    assert.ok(coverage.not_included.includes('is_hosting'));
    assert.match(coverage.note, /overage cap/);
    assert.doesNotMatch(coverage.note, /plan does not include/);
    assert.match(coverage.note, /not a negative result/);
});

test("a paid key's full answer reports full coverage and keeps cap_reached", async () => {
    const max = data.lookup.find((c) => c.name === 'max-full-shape');
    const { location, asn } = data.lookup.find((c) => c.name === 'cap-reached-answer').body;
    const body = { ...max.body, ...PAID_SINCE_2026_11_20, location: location, asn: asn };
    const stub = serving(body);
    const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: body.ip });
    const { result, coverage } = out.structuredContent;

    assert.equal(result.cap_reached, false);
    assert.ok(!coverage.included.includes('cap_reached'));
    assert.deepEqual(coverage.not_included, []);
    assert.match(coverage.note, /real negative result/);
});

// A cap reached part way through a batch answers the rest of it with Unlimited's
// fields, in its results beside the full answers before it.
test('a batch the overage cap stops part way through reports its narrowest answer', async () => {
    const full = data.lookup.find((c) => c.name === 'max-full-shape').body;
    const capped = data.lookup.find((c) => c.name === 'cap-reached-answer').body;
    const answers = { '1.1.1.1': { ...full, ip: '1.1.1.1' }, '8.8.8.8': { ...capped, ip: '8.8.8.8' } };
    const fetchImpl = async () => new Response(JSON.stringify({ results: answers, errors: {} }), {
        status: 200, headers: { 'content-type': 'application/json' },
    });
    const out = await toolsFor(fetchImpl).get('lookup_ips').handler({ ips: Object.keys(answers) });
    const { results, coverage } = out.structuredContent;

    assert.deepEqual(results, answers);
    assert.deepEqual(coverage.not_included, LOOKUP_GATED_MEMBERS.filter((m) => !(m in capped)));
    assert.match(coverage.note, /do not all carry the same fields/);
    assert.match(coverage.note, /cap_reached: true/);
    assert.match(coverage.note, /overage cap/);
    assert.doesNotMatch(coverage.note, /real negative result/);
});

// A free-plan key's batch is refused with a 402 and its addresses looked up one at
// a time, so its trial can run out between them: the first answer then has
// every field and the next only Unlimited's.
test('a batch the trial runs out part way through reports its narrowest answer', async () => {
    const answers = {
        '1.1.1.1': { ...data.lookup.find((c) => c.name === 'trial-full-answer').body, ip: '1.1.1.1' },
        '8.8.8.8': { ...data.lookup.find((c) => c.name === 'trial-expired-answer').body, ip: '8.8.8.8' },
    };
    for (const body of Object.values(answers)) {
        body.is_bogon = SERVED_IS_BOGON;
    }
    const fetchImpl = async (input) => {
        const path = new URL(input.url).pathname;
        if (path === '/batch') {
            return new Response('{"error":"POST /batch needs a paid plan"}', {
                status: 402, headers: { 'content-type': 'application/json' },
            });
        }
        return new Response(JSON.stringify(answers[path.slice(1)]), {
            status: 200, headers: { 'content-type': 'application/json' },
        });
    };
    const out = await toolsFor(fetchImpl).get('lookup_ips').handler({ ips: Object.keys(answers) });
    const { results, coverage } = out.structuredContent;

    assert.deepEqual(results, answers);
    const spent = answers['8.8.8.8'];
    assert.deepEqual(coverage.not_included, LOOKUP_GATED_MEMBERS.filter((m) => !(m in spent)));
    assert.match(coverage.note, /do not all carry the same fields/);
    assert.match(coverage.note, /trial/);
    assert.doesNotMatch(coverage.note, /real negative result/);
});

test('the note reaches a client that only renders content', async () => {
    const bare = data.lookup.find((c) => c.name === 'required-only-not-vpn');
    const stub = serving(bare.body);
    const out = await toolsFor(stub.fetch).get('lookup_ip').handler({ ip: bare.body.ip });

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

// The corpus fixes the bogon shape as every flag present and false, every detail
// object present and empty, and each other member as it names it - the location, AS,
// company and abuse contact with every key empty or zero, web an empty list and
// hostname an empty string - so nothing about it can read as uncovered.
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
    const named = Object.entries(data.bogonResponse)
        .filter(([k]) => !['why', 'flagsFalse', 'emptyObjects'].includes(k));
    assert.ok(named.length > 0, 'the corpus names no other bogon member');
    for (const [member, value] of named) {
        assert.deepEqual(body[member], value, `${member} must be as the corpus names it`);
    }
    assert.deepEqual(out.structuredContent.coverage.not_included, [],
        'nothing is uncovered in a locally synthesized answer');
    assert.ok(!('trial_expired' in body), 'a bogon was never served, so it carries no trial marker');
    assert.ok(!('cap_reached' in body), 'a bogon was never served, so it carries no cap marker');
});

// A server listening on :: logs every IPv4 visitor as ::ffff:a.b.c.d, and a model triaging that
// log passes the form on: it must find each answer under the address it passed.
test('an IPv4-mapped address is the IPv4 address it carries, keyed as passed', async () => {
    const bare = data.lookup.find((c) => c.name === 'required-only-not-vpn');
    const stub = serving({ ...bare.body, ip: '8.8.8.8' });
    const paths = [];
    const tools = toolsFor((input, init) => {
        paths.push(new URL(typeof input === 'string' ? input : input.url).pathname);
        return stub.fetch(input, init);
    });
    for (const c of data.ipv4Mapped) {
        paths.length = 0;
        const out = await tools.get('lookup_ip').handler({ ip: c.ip });
        assert.equal(out.structuredContent.result.ip, c.carries, c.ip);
        assert.equal(out.structuredContent.result.is_bogon === true, c.expect, c.ip);
        assert.deepEqual(paths, c.expect ? [] : [`/${c.carries}`], `${c.ip}: what was sent`);
    }

    const ips = data.ipv4Mapped.map((c) => c.ip);
    const out = await tools.get('lookup_ips').handler({ ips: ips });
    assert.deepEqual(Object.keys(out.structuredContent.results), ips);
    for (const c of data.ipv4Mapped) {
        assert.equal(out.structuredContent.results[c.ip].ip, c.carries, c.ip);
    }
});

// Each case serves a value no published list holds. Every tool hands it back as served,
// and its schema admits it, but for a list the spec says never gains a value (a plan's
// tier): that value is refused by its `enum` alone. A case's paths are the API answer's,
// which my_entitlement answers under `entitlement`.
const VOCABULARY_TOOLS = {
    myEntitlement: { name: 'my_entitlement', under: ['entitlement'] },
    listDatabases: { name: 'list_databases', under: [] },
    listDownloads: { name: 'list_downloads', under: [] },
};

test('a value the API adds to a list comes back as served, and only a closed list refuses it', async () => {
    const ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    for (const c of data.vocabulary.cases) {
        const { name, under } = VOCABULARY_TOOLS[c.call];
        const def = toolsFor(serving(c.answer).fetch).get(name);
        const out = await def.handler({});
        assert.equal(out.isError, undefined, `${c.name}: ${out.content[0].text}`);

        const refused = [];
        for (const [path, want] of Object.entries(c.expect)) {
            const segs = [...under, ...path.split('.')];
            assert.equal(segs.reduce((v, seg) => v[seg], out.structuredContent), want, `${c.name}: ${path}`);
            const schema = segs.reduce((n, seg) => (/^\d+$/.test(seg) ? n.items : n.properties[seg]),
                def.tool.outputSchema);
            if (Array.isArray(schema.enum) && !schema.enum.includes(want)) {
                assert.match(schema.description, /never gains a value/, `${c.name}: ${path} is closed`);
                refused.push(`/${segs.join('/')}`);
            }
        }

        const validate = ajv.compile(def.tool.outputSchema);
        const valid = validate(out.structuredContent);
        assert.equal(valid, refused.length === 0, `${c.name}: ${ajv.errorsText(validate.errors)}`);
        if (!valid) {
            assert.deepEqual(validate.errors.map((e) => [e.keyword, e.instancePath]),
                refused.map((p) => ['enum', p]), `${c.name}: refused for its closed list alone`);
        }
    }
});

test('batch coverage comes from a served answer, never from a bogon', async () => {
    const bare = data.lookup.find((c) => c.name === 'required-only-not-vpn');
    const stub = serving(bare.body);
    const out = await toolsFor(stub.fetch).get('lookup_ips')
        .handler({ ips: ['10.0.0.1', bare.body.ip] });

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
