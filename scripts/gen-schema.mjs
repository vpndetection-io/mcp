// Emits src/schema.gen.ts from the pinned OpenAPI spec.
//
// Two things come out of it, and both exist so that no copy of the tier ladder
// is ever written down here. The MEMBER list is what a coverage note is derived
// from: a result's absent members are the spec's members minus the ones served,
// so a dataset added to ip_api appears in the note as soon as the spec is
// refreshed. The output SCHEMAS are what MCP clients validate against.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(readFileSync(resolve(root, 'spec/openapi.json'), 'utf8'));

const schema = (name) => deref(spec, spec.components.schemas[name]);

const lookup = schema('LookupResponse');
const members = Object.keys(lookup.properties);

// `ip` and `is_vpn` are the spec's required members, so they are served at every
// tier and can never be part of an absence note.
const gated = members.filter((m) => !(lookup.required ?? []).includes(m));

const downloadsLimit = queryParam('/api/v1/database/downloads', 'limit');

const out = `${banner()}

export const LOOKUP_MEMBERS: readonly string[] = [
${members.map((m) => `    '${m}',`).join('\n')}
];

export const LOOKUP_GATED_MEMBERS: readonly string[] = [
${gated.map((m) => `    '${m}',`).join('\n')}
];

export const SPEC_VERSION = '${spec.info.version}';

/** The most history rows \`list_downloads\` may ask for. The API clamps to the same. */
export const DOWNLOADS_LIMIT = ${numeric(downloadsLimit, 'maximum')};

/** What the API returns when \`list_downloads\` names no limit. */
export const DOWNLOADS_LIMIT_DEFAULT = ${numeric(downloadsLimit, 'default')};

// Matches the shape the MCP Tool type wants for inputSchema/outputSchema, so a
// generated schema can be handed straight to a tool definition.
export interface ObjectSchema {
    type: 'object';
    properties?: Record<string, object>;
    required?: string[];
    [k: string]: unknown;
}

export const LOOKUP_RESULT_SCHEMA: ObjectSchema = ${ts(lookup)};

export const DATABASE_SCHEMA: ObjectSchema = ${ts(schema('Database'))};

export const DATABASE_METADATA_SCHEMA: ObjectSchema = ${ts(schema('DatabaseMetadata'))};

export const DB_CHECKSUMS_SCHEMA: ObjectSchema = ${ts(schema('DbChecksums'))};
`;

writeFileSync(resolve(root, 'src/schema.gen.ts'), out);
console.log(`src/schema.gen.ts  (spec ${spec.info.version}, ${members.length} lookup members)`);

// Inlines every $ref. MCP clients validate tool output with an ordinary JSON
// Schema validator that has no document to resolve a local $ref against, so a
// schema carrying one would fail validation rather than skip it.
function deref(doc, node, seen = new Set()) {
    if (node === null || typeof node !== 'object') {
        return node;
    }
    if (Array.isArray(node)) {
        return node.map((n) => deref(doc, n, seen));
    }
    if (typeof node.$ref === 'string') {
        if (seen.has(node.$ref)) {
            throw new Error(`circular $ref: ${node.$ref}`);
        }
        const path = node.$ref.replace(/^#\//, '').split('/');
        let target = doc;
        for (const p of path) {
            target = target[p];
        }
        if (target === undefined) {
            throw new Error(`unresolvable $ref: ${node.$ref}`);
        }
        return deref(doc, target, new Set([...seen, node.$ref]));
    }
    const out = {};
    for (const [k, v] of Object.entries(node)) {
        if (k === 'example' || k === 'examples') {
            continue;
        }
        out[k] = deref(doc, v, seen);
    }
    return flattenSingleAllOf(out);
}

// The spec wraps each detail member as `allOf: [$ref]` purely to hang a
// per-member description off a shared schema. Once the $ref is inlined the
// wrapper is noise, and it hides the member's `type` one level down - which is
// how a reader (or a bogon synthesizer) ends up thinking the member has no type
// at all. The member's own description wins, since it is the more specific one.
function flattenSingleAllOf(node) {
    if (!Array.isArray(node.allOf) || node.allOf.length !== 1) {
        return node;
    }
    const { allOf, ...rest } = node;
    return { ...allOf[0], ...rest };
}

// The bounds the API enforces on one query parameter, read off the spec rather
// than restated in the manifest. Each reaches a tool description and its runtime
// check by re-pinning the spec, the same contract the output schemas have. The
// DEFAULT is the copy that misleads soonest: it is stated in prose a model
// reads, and nothing rejects it once the API moves off it.
function queryParam(path, name) {
    const params = spec.paths[path]?.get?.parameters ?? [];
    const param = params.find((q) => q.name === name && q.in === 'query');
    if (param?.schema === undefined) {
        throw new Error(`spec has no query parameter ?${name} on GET ${path}`);
    }
    return { path: path, name: name, schema: param.schema };
}

function numeric(param, field) {
    const value = param.schema[field];
    if (typeof value !== 'number') {
        throw new Error(`spec has no numeric ${field} for GET ${param.path} ?${param.name}`);
    }
    return value;
}

function ts(node) {
    return JSON.stringify(node, null, 4);
}

function banner() {
    return '// Code generated by scripts/gen-schema.mjs from spec/openapi.json. DO NOT EDIT.';
}
