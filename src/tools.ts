import { z } from 'zod';

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DatabaseFormat, Result, VPNDetection } from 'vpndetection';

import {
    CallToolRequestSchema, ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { batchCoverage, COVERAGE_SCHEMA, coverageOf, wireBody } from './coverage.js';
import {
    DATABASE_METADATA_SCHEMA, DATABASE_SCHEMA, DB_CHECKSUMS_SCHEMA, DOWNLOADS_LIMIT,
    LOOKUP_RESULT_SCHEMA,
} from './schema.gen.js';

/** The most addresses one `lookup_ips` call may carry. */
export const BATCH_LIMIT = 100;

export { DOWNLOADS_LIMIT };

// Both spellings of a database id, stated wherever one is taken. `list_databases`
// answers a `base` id (what a license names) and a `versions[].id`; everything
// else accepts only the versioned one. A model that has just read
// `base: "cdn_ip"` will otherwise pass it and get a refusal that reads like a
// bad database rather than a wrong spelling.
const VERSIONED_ID = 'A VERSIONED database id, from `versions[].id` in `list_databases` - '
    + '`cdn_ip_v1`, not `cdn_ip`. The unversioned base id is a license reference and is '
    + 'not accepted here.';

const FORMATS = z.enum(['csvgz', 'mmdb']);

// Each tool's arguments, declared ONCE. `jsonSchema()` publishes the object and
// the handler parses with the same one, so the cap a client is shown is the cap
// it meets. Two lookalike declarations - a schema for the manifest and another
// in the handler - is how an advertised bound and an enforced bound drift.
const LOOKUP_INPUT = z.object({
    ip: z.string().describe('The IPv4 or IPv6 address to classify.'),
});

const LOOKUP_BATCH_INPUT = z.object({
    ips: z.array(z.string()).min(1).max(BATCH_LIMIT)
        .describe(`The addresses to classify, at most ${BATCH_LIMIT}.`),
});

const METADATA_INPUT = z.object({
    dataset_id: z.string().describe(VERSIONED_ID),
});

const CHECKSUM_INPUT = z.object({
    dataset_id: z.string().describe(VERSIONED_ID),
    format: FORMATS.describe('Which published file to digest.'),
});

const DOWNLOADS_INPUT = z.object({
    limit: z.number().int().min(1).max(DOWNLOADS_LIMIT).optional().describe(
        `How many attempts to return, newest first. At most ${DOWNLOADS_LIMIT}; `
        + 'the API defaults to 50.'),
});

export interface ToolContext {
    client: VPNDetection;
    /**
     * Whether to offer the database tools. On by default: a key without the
     * `db.download` scope gets a plain refusal from the API, which reads better
     * than a tool that silently does not exist, and deciding otherwise would
     * mean re-validating the key here against a policy `db_dl_api` owns.
     */
    database?: boolean;
}

export interface ToolDef {
    tool: Tool;
    handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

/**
 * The tool manifest, and the single place either transport gets it from.
 *
 * Descriptions are read by a model rather than a developer, so they say what
 * the tool answers and what it costs, not how it is implemented.
 */
export function createTools(ctx: ToolContext): ToolDef[] {
    const defs: ToolDef[] = [
        {
            tool: {
                name: 'lookup_ip',
                title: 'Look up an IP address',
                description: 'Classify a single IPv4 or IPv6 address: whether it belongs to a VPN, '
                    + 'a residential, datacenter or mobile proxy, a Tor node, a public relay, a '
                    + 'hosting provider or a CDN, with the provider name where we have one. '
                    + 'Private and reserved addresses are answered locally and cost nothing. '
                    + 'Always read `coverage.note` before concluding anything from a field that is '
                    + 'not in the result.',
                inputSchema: jsonSchema(LOOKUP_INPUT),
                outputSchema: objectSchema({
                    result: LOOKUP_RESULT_SCHEMA,
                    coverage: COVERAGE_SCHEMA,
                }, ['result', 'coverage']),
                annotations: {
                    readOnlyHint: true,
                    idempotentHint: true,
                    openWorldHint: true,
                },
            },
            handler: (args) => lookupIp(ctx, args),
        },
        {
            tool: {
                name: 'lookup_ips',
                title: 'Look up several IP addresses',
                description: `Classify up to ${BATCH_LIMIT} addresses in one call, returning a map `
                    + 'keyed by address so duplicates collapse and the order you passed them stops '
                    + 'mattering. Prefer this over repeated `lookup_ip` calls when you already have '
                    + 'the list, for example when triaging a log file. An address that fails '
                    + 'carries its error in place of a result rather than failing the batch.',
                inputSchema: jsonSchema(LOOKUP_BATCH_INPUT),
                outputSchema: objectSchema({
                    results: {
                        type: 'object',
                        description: 'Keyed by address. A value is either a result or an error.',
                        additionalProperties: true,
                    },
                    coverage: COVERAGE_SCHEMA,
                }, ['results', 'coverage']),
                annotations: {
                    readOnlyHint: true,
                    idempotentHint: true,
                    openWorldHint: true,
                },
            },
            handler: (args) => lookupIps(ctx, args),
        },
    ];

    defs.push(accountTool(ctx));

    if (ctx.database !== false) {
        defs.push(...databaseTools(ctx));
    }

    // A handler NEVER throws: an upstream 404 or a rejected argument is a result
    // the model can read and correct itself from, while a JSON-RPC protocol error
    // is not. Wrapping here rather than in `registerTools` keeps that true for
    // any consumer of a ToolDef, including a transport that mounts its own.
    return defs.map((d) => ({ tool: d.tool, handler: guard(d.handler) }));
}

/** Mounts a manifest on a server. Both transports use this and nothing else. */
export function registerTools(server: Server, defs: ToolDef[]): void {
    const byName = new Map(defs.map((d) => [d.tool.name, d]));

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return { tools: defs.map((d) => d.tool) };
    });

    server.setRequestHandler(CallToolRequestSchema, async (req) => {
        const def = byName.get(req.params.name);
        if (def === undefined) {
            throw new Error(`Unknown tool: ${req.params.name}`);
        }
        return await def.handler(req.params.arguments ?? {});
    });
}

function guard(handler: ToolDef['handler']): ToolDef['handler'] {
    return async (args) => {
        try {
            return await handler(args);
        } catch (err) {
            return toolError(err);
        }
    };
}

async function lookupIp(ctx: ToolContext, args: Record<string, unknown>): Promise<CallToolResult> {
    const { ip } = LOOKUP_INPUT.parse(args);
    const body = wireBody(await ctx.client.lookup(ip));
    return ok({ result: body, coverage: coverageOf(body) });
}

async function lookupIps(ctx: ToolContext, args: Record<string, unknown>): Promise<CallToolResult> {
    const { ips } = LOOKUP_BATCH_INPUT.parse(args);

    const answers = await ctx.client.lookupBatch(ips);
    const results: Record<string, unknown> = {};
    const served: Record<string, unknown>[] = [];
    for (const [addr, answer] of answers) {
        const failed = asClientError(answer);
        if (failed !== undefined) {
            results[addr] = { error: { kind: failed.kind, message: failed.message } };
            continue;
        }
        const body = wireBody(answer as Result);
        results[addr] = body;
        served.push(body);
    }
    return ok({ results: results, coverage: batchCoverage(served) });
}

/**
 * What the presented key is entitled to, and what it has spent.
 *
 * There is deliberately NO `my_ip` counterpart. The SDKs have one, but over a
 * HOSTED transport the address our edge observes belongs to whatever proxied
 * the call - Claude's infrastructure, not the person asking - so the tool would
 * answer confidently and wrongly for the reading a model would put on it. The
 * account is the same answer whoever forwards the request, because it describes
 * the credential rather than the connection.
 */
function accountTool(ctx: ToolContext): ToolDef {
    return {
        tool: {
            name: 'my_account',
            title: 'Plan and usage for this key',
            description: 'What this API key is entitled to and how much of it has been used: the '
                + 'plan, the field tier that decides how much of a lookup answer comes back, the '
                + 'requests counted so far, the allowance, and when it resets. Use it to explain '
                + 'why a field is missing from a lookup, or before a large batch. Usage counts '
                + 'against the anniversary of the subscription rather than the calendar month, '
                + 'and can lag a few seconds behind. A null `hard_limit` means we never stop '
                + 'serving - it is NOT a limit of zero.',
            inputSchema: { type: 'object', additionalProperties: false },
            outputSchema: objectSchema({
                account: { type: 'object', additionalProperties: true },
            }, ['account']),
            annotations: {
                readOnlyHint: true,
                // Not idempotent: the number it reports moves with every other
                // call, which is the whole point of asking.
                idempotentHint: false,
                openWorldHint: true,
            },
        },
        handler: async () => {
            return ok({ account: await ctx.client.myAccount() });
        },
    };
}

function databaseTools(ctx: ToolContext): ToolDef[] {
    return [
        {
            tool: {
                name: 'list_databases',
                title: 'List databases',
                description: 'The database catalog as this API key\'s organization may see it, '
                    + 'one entry per database FAMILY, with the license type and term. A database '
                    + 'absent from this list is one the organization does not hold. Each entry has '
                    + 'a `base` id, which is what the license names, and a `versions` array whose '
                    + '`id` is what the other database tools take - pass `versions[].id` '
                    + '(`cdn_ip_v1`), never the `base` (`cdn_ip`). Ask again rather than holding '
                    + 'on to this: it is answered per key and is not the same for everyone.',
                inputSchema: { type: 'object', additionalProperties: false },
                outputSchema: objectSchema({
                    databases: { type: 'array', items: DATABASE_SCHEMA },
                }, ['databases']),
                annotations: {
                    readOnlyHint: true,
                    idempotentHint: true,
                    openWorldHint: true,
                },
            },
            handler: async () => {
                return ok({ databases: await ctx.client.database.list() });
            },
        },
        {
            tool: {
                name: 'database_metadata',
                title: 'Describe a database',
                description: 'What is inside one database before you fetch it: the columns in each '
                    + 'published format with their types, a few sample rows, the row count, the '
                    + 'build date and the file sizes. Use this to answer questions about what a '
                    + 'database contains without downloading it - the files reach several GB - and '
                    + 'to budget a transfer before starting one.',
                inputSchema: jsonSchema(METADATA_INPUT),
                outputSchema: DATABASE_METADATA_SCHEMA,
                annotations: {
                    readOnlyHint: true,
                    idempotentHint: true,
                    openWorldHint: true,
                },
            },
            handler: async (args) => {
                const { dataset_id } = METADATA_INPUT.parse(args);
                return ok(await ctx.client.database.metadata(dataset_id));
            },
        },
        {
            tool: {
                name: 'database_checksum',
                title: 'Get a database\'s checksums',
                description: 'The published digests for one database file, for verifying a copy '
                    + 'you already hold or deciding whether a build has changed since you last '
                    + 'fetched it.',
                inputSchema: jsonSchema(CHECKSUM_INPUT),
                outputSchema: objectSchema({ checksums: DB_CHECKSUMS_SCHEMA }, ['checksums']),
                annotations: {
                    readOnlyHint: true,
                    idempotentHint: true,
                    openWorldHint: true,
                },
            },
            handler: async (args) => {
                const parsed = CHECKSUM_INPUT.parse(args);
                const checksums = await ctx.client.database.checksums(
                    parsed.dataset_id, parsed.format as DatabaseFormat);
                return ok({ checksums: checksums });
            },
        },
        {
            tool: {
                name: 'list_downloads',
                title: 'List recent download attempts',
                description: 'This organization\'s own recent download attempts, newest first, '
                    + 'REFUSALS INCLUDED - a denial carries the `outcome` and `http_status` that '
                    + 'answer "it stopped working", which nothing else here can. Use it to explain '
                    + 'a failing fetch, to confirm a transfer ran, or to check whether a request '
                    + 'was theirs. This is a bounded WINDOW of at most '
                    + `${DOWNLOADS_LIMIT} rows, so a database missing from the answer means it is `
                    + 'not in this window - never that it was never downloaded.',
                inputSchema: jsonSchema(DOWNLOADS_INPUT),
                outputSchema: objectSchema({
                    downloads: { type: 'array', items: { type: 'object', additionalProperties: true } },
                }, ['downloads']),
                annotations: {
                    readOnlyHint: true,
                    idempotentHint: false,
                    openWorldHint: true,
                },
            },
            handler: async (args) => {
                const { limit } = DOWNLOADS_INPUT.parse(args);
                const downloads = await ctx.client.database.downloads(
                    limit === undefined ? {} : { limit: limit });
                return ok({ downloads: downloads });
            },
        },
    ];
}

/**
 * The serialized structured content IS the text block, rather than a prose
 * summary beside it. The coverage note lives inside the structure, so writing
 * it once puts it in front of both a client that reads `structuredContent` and
 * one that only renders `content`.
 */
function ok(structured: Record<string, unknown>): CallToolResult {
    return {
        content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }],
        structuredContent: structured,
    };
}

/**
 * An error carries no `structuredContent`, deliberately.
 *
 * A tool that declares an `outputSchema` has every structured result validated
 * against it by the client, and an error is not shaped like a success - so
 * attaching one turns a readable failure into a protocol error the model cannot
 * act on. The text block is what it reads instead.
 */
function toolError(err: unknown): CallToolResult {
    return {
        content: [{ type: 'text', text: JSON.stringify({ error: errorDetail(err) }, null, 2) }],
        isError: true,
    };
}

function errorDetail(err: unknown): Record<string, unknown> {
    const known = asClientError(err);
    if (known !== undefined) {
        return { kind: known.kind, message: known.message, retryable: known.retryable === true };
    }
    const rejected = asZodError(err);
    if (rejected !== undefined) {
        // The MODEL's own mistake, and the one failure it can fix unaided - so
        // it must not arrive as `internal`, which reads as "the server broke"
        // and invites an identical retry. zod's formatter names the field and
        // what was expected; the raw `issues` array is JSON a model has to
        // decode before it can act on.
        return {
            kind: 'invalid_argument',
            message: z.prettifyError(rejected),
            retryable: false,
        };
    }
    return { kind: 'internal', message: err instanceof Error ? err.message : String(err) };
}

/**
 * Recognises a `VPNDetectionError` by SHAPE, not by `instanceof`.
 *
 * This package and whatever mounts it can each end up with their own copy of the
 * `vpndetection` module - the hosted service depends on both - and two copies of
 * one class are two identities, so `instanceof` silently returns false and every
 * upstream failure degrades to a generic `internal`. A caller then sees "internal"
 * for what was really `unauthorized`, and loses the `retryable` flag that decides
 * whether trying again is worth anything.
 */
function asClientError(err: unknown): ClientError | undefined {
    if (err === null || typeof err !== 'object') {
        return undefined;
    }
    const e = err as Partial<ClientError> & { name?: unknown };
    if (e.name !== 'VPNDetectionError' || typeof e.kind !== 'string') {
        return undefined;
    }
    return e as ClientError;
}

interface ClientError {
    kind: string;
    message: string;
    retryable?: boolean;
}

/**
 * Recognises a `ZodError` by SHAPE, for the same reason `asClientError` does.
 *
 * zod resolves per package here, so `instanceof` would miss a copy thrown by a
 * different one and fall back to exactly the `internal` this exists to replace.
 */
function asZodError(err: unknown): z.ZodError | undefined {
    if (err === null || typeof err !== 'object') {
        return undefined;
    }
    const e = err as { name?: unknown; issues?: unknown };
    if (e.name !== 'ZodError' || !Array.isArray(e.issues)) {
        return undefined;
    }
    return err as z.ZodError;
}

// One zod declaration yields both the published schema and the runtime parse, so
// a cap advertised to a client is the same cap the handler enforces.
function jsonSchema(schema: z.ZodType): Tool['inputSchema'] {
    const out = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
    delete out['$schema'];
    return { ...out, type: 'object' } as Tool['inputSchema'];
}

function objectSchema(properties: Record<string, unknown>, required: string[]): Tool['outputSchema'] {
    return {
        type: 'object',
        properties: properties,
        required: required,
    } as Tool['outputSchema'];
}
