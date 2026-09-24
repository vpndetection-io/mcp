import type { Result } from 'vpndetection';

import {
    LOOKUP_GATED_MEMBERS, LOOKUP_MEMBERS, LOOKUP_RESULT_SCHEMA, type ObjectSchema,
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

const NOTE_FULL = 'This plan covers every dataset the API serves, so every field was checked. A '
    + 'false flag here is a real negative result.';

const NOTE_BOGON = 'This is a private, reserved or otherwise non-routable address. It was answered '
    + 'locally without calling the API, so every flag is false by definition rather than by lookup, '
    + 'and it cost nothing against the key\'s allowance.';

const NOTE_UNKNOWN = 'No served answer was available to derive coverage from, so this batch says '
    + 'nothing about which datasets the plan covers.';

/**
 * The answer in the names the API publishes, which is what a model has read the
 * docs in and what this server's `outputSchema` declares.
 *
 * A served answer already carries it as `raw`. A bogon does not: the SDK answers
 * those locally onto its own camelCase members and leaves `raw` empty. Rebuilding
 * it from the spec's own property types avoids a second copy of the wire names
 * here, and lands on the documented bogon shape by construction - every flag
 * present and false, every detail object present and empty.
 */
export function wireBody(result: Result): Record<string, unknown> {
    if (!result.isBogon) {
        return result.raw as unknown as Record<string, unknown>;
    }
    const out: Record<string, unknown> = { ip: result.ip, is_bogon: true };
    for (const [name, schema] of Object.entries(LOOKUP_RESULT_SCHEMA.properties ?? {})) {
        if (name === 'ip') {
            continue;
        }
        const type = (schema as { type?: string }).type;
        if (type === 'boolean') {
            out[name] = false;
        } else if (type === 'object') {
            out[name] = {};
        }
    }
    return out;
}

/**
 * A lookup answer as this package serves it: the spec's members, plus the SDK-only
 * `is_bogon` marker `wireBody` adds. The API never serves that marker, so the spec
 * cannot generate it and it is declared here instead.
 */
export const LOOKUP_ANSWER_SCHEMA: ObjectSchema = {
    ...LOOKUP_RESULT_SCHEMA,
    properties: {
        ...LOOKUP_RESULT_SCHEMA.properties,
        is_bogon: {
            type: 'boolean',
            description: 'Present, and true, only for a private, reserved or otherwise non-routable '
                + 'address. Such an answer is given locally without calling the API, so every other flag '
                + 'in it is false by definition rather than by lookup. Absent from every served answer.',
        },
    },
};

/**
 * Derives coverage from the result body alone.
 *
 * Deliberately no tier table: the members are read from the pinned spec and the
 * absent ones are whatever the API left out, so a dataset added to `ip_api`
 * starts appearing here as soon as `scripts/download-spec.sh` is re-run. The
 * caller's tier is never named, because the plan's identity is not the useful
 * fact - what it failed to check is.
 */
export function coverageOf(body: Record<string, unknown>): Coverage {
    const included = LOOKUP_MEMBERS.filter((m) => m in body);
    const notIncluded = LOOKUP_GATED_MEMBERS.filter((m) => !(m in body));
    let note = notIncluded.length === 0 ? NOTE_FULL : NOTE_PARTIAL;
    if (body['is_bogon'] === true) {
        note = NOTE_BOGON;
    }
    return { included: included, not_included: notIncluded, note: note };
}

/**
 * One coverage for a whole batch, taken from the first served answer.
 *
 * A bogon is synthesized locally in the full shape, so reading coverage off one
 * would report every dataset as covered whatever the plan actually buys. Errors
 * carry no shape at all. With neither available there is nothing honest to say,
 * which is what `NOTE_UNKNOWN` says.
 */
export function batchCoverage(bodies: Record<string, unknown>[]): Coverage {
    const served = bodies.find((b) => b['is_bogon'] !== true);
    if (served === undefined) {
        return { included: [], not_included: [], note: NOTE_UNKNOWN };
    }
    return coverageOf(served);
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
