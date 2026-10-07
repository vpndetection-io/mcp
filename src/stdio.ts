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

import { createTools, registerTools } from './tools.js';

const version = createRequire(import.meta.url)('../package.json').version as string;

function main(): void {
    const apiKey = process.env['VPNDETECTION_API_KEY'];
    const client = new VPNDetection({
        ...(apiKey === undefined || apiKey === '' ? {} : { apiKey: apiKey }),
        ...(process.env['VPNDETECTION_BASE_URL'] === undefined
            ? {} : { baseUrl: process.env['VPNDETECTION_BASE_URL'] }),
    });
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

main();
