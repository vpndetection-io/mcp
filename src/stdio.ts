#!/usr/bin/env node

// The stdio entry point: the process an MCP client spawns.
//
// This is the one file that reads the environment. The MCP specification tells
// stdio servers to take credentials that way rather than through the protocol's
// OAuth profile, and everything below it takes its configuration as arguments.

import { createRequire } from 'node:module';

import { Server } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { VPNDetection } from 'vpndetection';

import { clientOptions } from './env.js';
import { createTools, registerTools } from './tools.js';

const version = createRequire(import.meta.url)('../package.json').version as string;

function main(): void {
    const client = new VPNDetection({ ...clientOptions(process.env), fetch: namedFetch() });
    const tools = createTools({ client: client });

    // The opening exchange picks the protocol era, 2025-11-25's `initialize` or
    // 2026-07-28's `server/discover`, and the server this builds is pinned to it.
    serveStdio(() => {
        const server = new Server(
            { name: 'vpndetection', version: version },
            { capabilities: { tools: {} } },
        );
        registerTools(server, tools);
        return server;
    }, {
        // stdout carries the protocol, so a diagnostic can only go to stderr.
        onerror: (err) => {
            console.error(err);
        },
    });
}

/**
 * Puts this server's name ahead of whatever the client SDK put in each request's
 * User-Agent, `vpndetection-mcp/<version>`, so the API can count which releases
 * are still installed. An SDK that names itself has set its header before it
 * calls the fetch it is given, on a `Request` for an API call or in `init` for a
 * file transfer; one that names nothing leaves this server's name alone.
 */
function namedFetch(): typeof globalThis.fetch {
    const name = `vpndetection-mcp/${version}`;
    const agent = (sdk: string | null): string => (sdk === null ? name : `${name} ${sdk}`);
    return (input, init) => {
        if (input instanceof Request) {
            input.headers.set('user-agent', agent(input.headers.get('user-agent')));
            return globalThis.fetch(input, init);
        }
        const headers = new Headers(init?.headers);
        headers.set('user-agent', agent(headers.get('user-agent')));
        return globalThis.fetch(input, { ...init, headers: headers });
    };
}

main();
