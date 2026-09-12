#!/usr/bin/env node

// The stdio entry point: the process an MCP client spawns.
//
// This is the one file that reads the environment. The MCP specification tells
// stdio servers to take credentials that way rather than through the protocol's
// OAuth profile, and everything below it takes its configuration as arguments.

import { createRequire } from 'node:module';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { VPNDetection } from 'vpndetection';

import { createTools, registerTools } from './tools.js';

const version = createRequire(import.meta.url)('../package.json').version as string;

async function main(): Promise<void> {
    const apiKey = process.env['VPNDETECTION_API_KEY'];
    const client = new VPNDetection({
        ...(apiKey === undefined || apiKey === '' ? {} : { apiKey: apiKey }),
        ...(process.env['VPNDETECTION_BASE_URL'] === undefined
            ? {} : { baseUrl: process.env['VPNDETECTION_BASE_URL'] }),
    });

    const server = new Server(
        { name: 'vpndetection', version: version },
        { capabilities: { tools: {} } },
    );
    registerTools(server, createTools({ client: client }));

    await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
    // stdout carries the protocol, so a diagnostic can only go to stderr.
    console.error(err);
    process.exitCode = 1;
});
