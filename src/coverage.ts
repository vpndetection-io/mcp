import type { Result } from 'vpndetection';

import {
    LOOKUP_ECHOES, LOOKUP_GATED_MEMBERS, LOOKUP_MARKERS, LOOKUP_MEMBERS, LOOKUP_RESULT_SCHEMA,
} from './schema.gen.js';

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

const NOTE_TRIAL_SPENT = 'This key is on the free plan, and its organization\'s trial of every '
    + 'field is spent, so this answer is Unlimited\'s and the fields in not_included were '
    + 'not returned. Their absence is not a negative result: the address was never checked against those '
    + 'datasets. Do not state or imply that the address is not hosting, a CDN or a proxy on the basis '
    + 'of a field missing from this result.';

const NOTE_CAP_REACHED = 'This key\'s organization has reached the overage cap it set on its paid plan, so '
    + 'this answer is Unlimited\'s, unbilled, and the fields in not_included were not returned. Raising or '
    + 'removing the cap in Billing brings them back. Their absence is not a negative result: the address was '
    + 'never checked against those datasets. Do not state or imply that the address is not hosting, a CDN or '
    + 'a proxy on the basis of a field missing from this result.';

const NOTE_FULL = 'This plan covers every dataset the API serves, so every field was checked. A '
    + 'false flag here is a real negative result.';

const NOTE_BOGON = 'This is a private, reserved or otherwise non-routable address. It was answered '
    + 'locally without calling the API, so every flag is false by definition rather than by lookup, '
    + 'and it did not count against the key\'s allowance.';

const NOTE_UNKNOWN = 'No served answer was available to derive coverage from, so this batch says '
    + 'nothing about which datasets the plan covers.';

const NOTE_MIXED = 'The answers in this batch do not all carry the same fields, and these lists are the '
    + 'narrowest answer\'s: one marked `cap_reached: true` or `trial_expired: true` has only Unlimited\'s '
    + 'fields, while the others have every field.';

/**
 * The answer in the names the API publishes, which is what a model has read the
 * docs in and what this server's `outputSchema` declares.
 *
 * A served answer already carries it as `raw`, the API's `is_bogon` included. A
 * bogon the SDK answered locally does not: it lands on the SDK's own camelCase
 * members and leaves `raw` empty. So `isBogon` alone does not say which, since the
 * SDK also sets it from a served `is_bogon`. Rebuilding the local one from the
 * spec's own property types avoids a second copy of the wire names here, and lands
 * on the documented bogon shape by construction - every flag present and false
 * but `is_bogon`, every detail object present and empty, `web` an empty list,
 * `hostname` an empty string, and the location, AS, company and abuse contact
 * with every member empty, zero or false.
 */
export function wireBody(result: Result): Record<string, unknown> {
    const raw = result.raw as unknown as Record<string, unknown>;
    if (!result.isBogon || Object.keys(raw).length > 0) {
        return raw;
    }
    const out: Record<string, unknown> = { ip: result.ip, is_bogon: true };
    for (const [name, schema] of Object.entries(LOOKUP_RESULT_SCHEMA.properties ?? {})) {
        // A marker is the API's word about the answer it served, and an echo answers
        // what the request sent: a bogon was never served, nor sent anything.
        if (name in out || LOOKUP_MARKERS.includes(name) || LOOKUP_ECHOES.includes(name)) {
            continue;
        }
        out[name] = emptyValue(schema as MemberSchema);
    }
    return out;
}

/** The part of a member's schema a bogon's answer is built from. */
interface MemberSchema {
    type?: unknown;
    properties?: Record<string, object>;
    required?: string[];
}

/** What a bogon answers for a member of this type: false, zero, an empty string or list. */
function emptyValue(schema: MemberSchema): unknown {
    switch (schema.type) {
        case 'boolean':
            return false;
        case 'integer':
        case 'number':
            return 0;
        case 'array':
            return [];
        case 'object':
            return emptyObject(schema);
        default:
            return '';
    }
}

/**
 * A detail object is `{}` when its flag is false, while the location, the AS, the
 * company and the abuse contact carry every member even where nothing is known. A
 * detail object requires nothing, so the schema's own `required` list says which
 * shape an object takes.
 */
function emptyObject(schema: MemberSchema): Record<string, unknown> {
    if ((schema.required ?? []).length === 0) {
        return {};
    }
    return Object.fromEntries(Object.entries(schema.properties ?? {})
        .map(([member, prop]) => [member, emptyValue(prop as MemberSchema)]));
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
        note = NOTE_TRIAL_SPENT;
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
 * A bogon is synthesized locally in the full shape, so reading coverage off one
 * would report every dataset as covered whatever the plan actually buys. Errors
 * carry no shape at all. With neither available there is nothing honest to say,
 * which is what `NOTE_UNKNOWN` says. Served answers can differ: a free-plan key's
 * trial can run out between its single lookups, and a paid key's overage cap
 * can be reached part way through a batch, either of which answers the rest with
 * Unlimited's fields. Reading the widest one would call every field checked, so the
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
