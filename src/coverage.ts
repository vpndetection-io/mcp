import type { Result } from 'vpndetection';

import { LOOKUP_GATED_MEMBERS, LOOKUP_MEMBERS } from './schema.gen.js';

/**
 * What a lookup result did and did not cover.
 *
 * The API's contract is that a missing member means "not in this plan", never
 * "we checked and found nothing". A model reading a served body cannot tell the
 * two apart and will report an absent `is_tor` as a negative finding, so every
 * result carries this alongside it.
 */
export interface Coverage {
    /** Members the API returned, so they were actually checked. */
    included: string[];
    /** Members this plan does not buy. Absent, not false. */
    not_included: string[];
    note: string;
}

const NOTE_PARTIAL = 'The fields in not_included were not returned, because this API key\'s plan does '
    + 'not include them. Their absence is not a negative result: the address was never checked '
    + 'against those datasets. Do not state or imply that the address is not hosting, a relay, Tor, '
    + 'a CDN or a proxy on the basis of a field missing from this result.';

const NOTE_DAY_SPENT = 'This key is on the free plan, and its organization\'s answers with every '
    + 'field are spent for today, so this answer has the core fields and the fields in not_included '
    + 'were not returned. A new UTC day brings them back. Their absence is not a negative result: the '
    + 'address was never checked against those datasets. Do not state or imply that the address is '
    + 'not hosting, a CDN or a proxy on the basis of a field missing from this result.';

const NOTE_CAP_REACHED = 'This key\'s organization has reached the overage cap it set on its paid plan, so '
    + 'this answer has the core fields, unbilled, and the fields in not_included were not returned. '
    + 'Raising or removing the cap in Billing brings them back. Their absence is not a negative result: '
    + 'the address was never checked against those datasets. Do not state or imply that the address is '
    + 'not hosting, a CDN or a proxy on the basis of a field missing from this result.';

const NOTE_FULL = 'This plan covers every dataset the API serves, so every field was checked. A '
    + 'false flag here is a real negative result.';

const NOTE_BOGON = 'This is a private, reserved or otherwise non-routable address. It was answered '
    + 'locally without calling the API, so every flag is false by definition rather than by lookup, '
    + 'and it did not count against the key\'s allowance.';

const NOTE_UNKNOWN = 'No served answer was available to derive coverage from, so this batch says '
    + 'nothing about which datasets the plan covers.';

const NOTE_MIXED = 'The answers in this batch do not all carry the same fields, and these lists are the '
    + 'narrowest answer\'s: one marked `cap_reached: true` or `trial_expired: true` has only the core '
    + 'fields, while the others have every field.';

/**
 * The answer in the names the API publishes, which is what a model has read the
 * docs in and what this server's `outputSchema` declares: the client SDK's `raw`.
 * A served answer is the API's body, its `is_bogon` included, and a bogon the SDK
 * answered locally is the documented bogon shape in the same names - every flag
 * present and false but `is_bogon`, every detail object present and empty, and the
 * location, AS, company and abuse contact with every member empty, zero or false.
 */
export function wireBody(result: Result): Record<string, unknown> {
    return result.raw as unknown as Record<string, unknown>;
}

/**
 * Derives coverage from the result body alone.
 *
 * Deliberately no tier table: the members are read from the pinned spec and the
 * absent ones are whatever the API left out, so a dataset added to the API
 * starts appearing here as soon as `scripts/download-spec.sh` is re-run. The
 * caller's tier is never named, because the plan's identity is not the useful
 * fact - what it failed to check is.
 */
export function coverageOf(body: Record<string, unknown>): Coverage {
    const included = LOOKUP_MEMBERS.filter((m) => m in body);
    const notIncluded = LOOKUP_GATED_MEMBERS.filter((m) => !(m in body));
    let note = notIncluded.length === 0 ? NOTE_FULL : NOTE_PARTIAL;
    if (notIncluded.length > 0 && body['trial_expired'] === true) {
        note = NOTE_DAY_SPENT;
    } else if (notIncluded.length > 0 && body['cap_reached'] === true) {
        note = NOTE_CAP_REACHED;
    }
    if (body['is_bogon'] === true) {
        note = NOTE_BOGON;
    }
    return { included: included, not_included: notIncluded, note: note };
}

/**
 * One coverage for a whole batch, taken from its narrowest served answer.
 *
 * A bogon is answered locally in the full shape, so reading coverage off one
 * would report every dataset as covered whatever the plan actually buys. Errors
 * carry no shape at all. With neither available there is nothing honest to say,
 * which is what `NOTE_UNKNOWN` says. Served answers can differ: a free-plan key's
 * full answers for the day can run out between its single lookups, and a paid key's
 * overage cap can be reached part way through a batch, either of which answers the
 * rest with the core fields. Reading the widest one would call every field checked, so the
 * narrowest one speaks for the batch and `NOTE_MIXED` says the answers differ.
 */
export function batchCoverage(bodies: Record<string, unknown>[]): Coverage {
    const answered = bodies.filter((b) => b['is_bogon'] !== true).map((b) => coverageOf(b));
    if (answered.length === 0) {
        return { included: [], not_included: [], note: NOTE_UNKNOWN };
    }
    const narrowest = answered.reduce((a, b) => (b.not_included.length > a.not_included.length ? b : a));
    if (answered.every((c) => c.not_included.length === narrowest.not_included.length)) {
        return narrowest;
    }
    return { ...narrowest, note: `${NOTE_MIXED} ${narrowest.note}` };
}

export const COVERAGE_SCHEMA = {
    type: 'object',
    description: 'Which datasets this result covered. Read `note` before interpreting any absent field.',
    properties: {
        included: { type: 'array', items: { type: 'string' } },
        not_included: { type: 'array', items: { type: 'string' } },
        note: { type: 'string' },
    },
    required: ['included', 'not_included', 'note'],
} as const;
