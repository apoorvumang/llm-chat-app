/**
 * Relay Server for Remote Terminal Bridge
 * 
 * This server is the "source of truth" for terminal state and acts as:
 * 1. WebSocket relay between terminal binaries and browsers
 * 2. Smart terminal service handling command execution, markers, and state
 * 
 * Architecture:
 * - Go binary: Pure PTY bridge (bytes in/out only)
 * - Relay (this): All execution logic, marker parsing, state management
 * - Frontend: Talks to relay as if it IS the terminal
 */

import { Server } from 'socket.io';
import http from 'http';
import next from 'next';
import { parse } from 'url';

const dev = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 3000;

// Session registry: sessionId -> Session instance
const sessions = new Map();

// ============================================================================
// Utilities
// ============================================================================

function generateSessionId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 6; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
}

function generateRequestId() {
    return Math.random().toString(36).substring(2, 10);
}

/**
 * Strip ANSI escape sequences from a string
 * Handles colors, cursor movement, and other terminal control codes
 */
function stripAnsi(str) {
    // Comprehensive regex for ANSI escape sequences:
    // - \x1b\[[0-9;]*[A-Za-z] : CSI sequences (colors, cursor, etc.)
    // - \x1b\][^\x07]*\x07 : OSC sequences (title, etc.) terminated by BEL
    // - \x1b\][^\x1b]*\x1b\\ : OSC sequences terminated by ST
    // - \x1b[PX^_][^\x07]*\x07 : DCS, SOS, PM, APC sequences with BEL
    // - \x1b[PX^_][^\x1b]*\x1b\\ : DCS, SOS, PM, APC sequences with ST
    // - \x1b[\[\]()#;?]*[0-9;]*[A-Za-z] : Other escape sequences
    // - \x1b. : Simple two-byte sequences
    return str.replace(/\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b\][^\x1b]*\x1b\\|\x1b[PX^_][^\x07]*\x07|\x1b[PX^_][^\x1b]*\x1b\\|\x1b[\[\]()#;?]*[0-9;]*[A-Za-z]|\x1b./g, '');
}

// ============================================================================
// Session Class - Encapsulates all state and logic for one terminal session
// ============================================================================

class Session {
    constructor(id, bridgeSocket) {
        this.id = id;
        this.bridgeSocket = bridgeSocket;
        this.browserSockets = new Set();
        this.createdAt = Date.now();

        // Execution state
        this.pendingExecute = null; // { id, resolve, reject, timeout }
        this.outputBuffer = '';

        // Screen buffer (circular, last 64KB)
        this.screenBuffer = '';
        this.maxScreenSize = 64 * 1024;
    }

    // ========================================================================
    // Terminal I/O
    // ========================================================================

    /**
     * Write data to terminal (send input to bridge)
     */
    writeToTerminal(data) {
        if (this.bridgeSocket) {
            this.bridgeSocket.emit('input', data);
        }
    }

    /**
     * Handle output received from terminal
     * - Forwards to all connected browsers
     * - Appends to screen buffer
     * - Checks for execution completion markers
     */
    handleOutput(data) {
        // Forward to all browsers (human sees everything in real-time)
        for (const socket of this.browserSockets) {
            socket.emit('output', data);
        }

        // Append to screen buffer (circular)
        this.screenBuffer += data;
        if (this.screenBuffer.length > this.maxScreenSize) {
            this.screenBuffer = this.screenBuffer.slice(-this.maxScreenSize);
        }

        // Check for execution completion if we have a pending execute
        if (this.pendingExecute) {
            this.outputBuffer += data;
            this.checkExecutionComplete();
        }
    }

    // ========================================================================
    // Command Execution
    // ========================================================================

    /**
     * Check if execution marker is present in output buffer
     */
    checkExecutionComplete() {
        if (!this.pendingExecute) return;

        const { id, resolve } = this.pendingExecute;
        const endMarker = `__EXEC_DONE_${id}__`;

        // Strip ANSI codes for marker detection (macOS terminals especially)
        const cleanBuffer = stripAnsi(this.outputBuffer);

        // Find first occurrence (in the command echo)
        const firstIndex = cleanBuffer.indexOf(endMarker);
        if (firstIndex === -1) return;

        // Find second occurrence (actual marker output)
        const secondIndex = cleanBuffer.indexOf(endMarker, firstIndex + endMarker.length);
        if (secondIndex === -1) return;

        // Extract output between the two occurrences (from the clean buffer)
        let output = cleanBuffer.slice(firstIndex + endMarker.length, secondIndex);

        // Clean up leading/trailing whitespace and newlines
        output = output.trim();

        // Clear pending state
        clearTimeout(this.pendingExecute.timeout);
        this.pendingExecute = null;
        this.outputBuffer = '';

        // Resolve the promise
        resolve({
            output: output,
            exitCode: 0
        });
    }

    /**
     * Execute a command and wait for completion
     */
    execute(command, timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            if (this.pendingExecute) {
                reject(new Error('Already executing a command'));
                return;
            }

            if (!this.bridgeSocket) {
                reject(new Error('Terminal bridge not connected'));
                return;
            }

            const id = generateRequestId();
            const endMarker = `__EXEC_DONE_${id}__`;

            // Set up timeout
            const timeout = setTimeout(() => {
                if (this.pendingExecute && this.pendingExecute.id === id) {
                    this.pendingExecute = null;
                    this.outputBuffer = '';
                    reject(new Error('Command timed out'));
                }
            }, timeoutMs);

            // Store pending state
            this.pendingExecute = { id, resolve, reject, timeout };
            this.outputBuffer = '';

            // Send command with just end marker
            const wrappedCommand = `${command}; echo '${endMarker}'\n`;
            this.writeToTerminal(wrappedCommand);
        });
    }
    /**
     * Interrupt current execution (send Ctrl+C)
     */
    interrupt() {
        // Send Ctrl+C to terminal
        this.writeToTerminal('\x03');

        // If there's a pending execute, reject it
        if (this.pendingExecute) {
            clearTimeout(this.pendingExecute.timeout);
            this.pendingExecute.reject(new Error('Interrupted'));
            this.pendingExecute = null;
            this.outputBuffer = '';
        }

        return { success: true };
    }

    // ========================================================================
    // Status & Screen
    // ========================================================================

    /**
     * Get current session status
     */
    getStatus() {
        return {
            busy: this.pendingExecute !== null,
            connected: this.bridgeSocket !== null
        };
    }

    /**
     * Read the screen buffer (last 64KB of output)
     */
    readScreen() {
        return { content: this.screenBuffer };
    }

    // ========================================================================
    // Human Input Handling
    // ========================================================================

    /**
     * Handle input from browser (human typing)
     * For now, just forwards. Could add locking/queueing logic later.
     */
    handleHumanInput(data) {
        this.writeToTerminal(data);
    }

    /**
     * Handle terminal resize from browser
     */
    handleResize(size) {
        if (this.bridgeSocket) {
            this.bridgeSocket.emit('resize', size);
        }
    }

    // ========================================================================
    // Cleanup
    // ========================================================================

    /**
     * Clean up session resources
     */
    destroy() {
        // Reject any pending execution
        if (this.pendingExecute) {
            clearTimeout(this.pendingExecute.timeout);
            this.pendingExecute.reject(new Error('Session destroyed'));
            this.pendingExecute = null;
        }

        // Notify all browsers
        for (const socket of this.browserSockets) {
            socket.emit('bridge_disconnected');
        }
    }
}

// ============================================================================
// Session Cleanup
// ============================================================================

function cleanupSessions() {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();

    for (const [id, session] of sessions) {
        if (now - session.createdAt > maxAge) {
            console.log(`Session ${id} expired, cleaning up`);
            session.destroy();
            if (session.bridgeSocket) {
                session.bridgeSocket.disconnect();
            }
            sessions.delete(id);
        }
    }
}

// Run cleanup every hour
setInterval(cleanupSessions, 60 * 60 * 1000);

// ============================================================================
// HTTP Endpoint Handlers
// ============================================================================

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * POST /execute/:sessionId
 * Execute a command and return the result
 * Body: { command: string, timeout?: number }
 * Response: { output: string, exitCode: number } or { error: string }
 */
function handleExecuteEndpoint(req, res, sessionId) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
    }

    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
        try {
            const { command, timeout } = JSON.parse(body);

            if (!command) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing command' }));
                return;
            }

            const result = await session.execute(command, timeout || 30000);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                output: result.output,
                exitCode: result.exitCode
            }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
    });
}

/**
 * POST /interrupt/:sessionId
 * Interrupt current execution (send Ctrl+C)
 * Response: { success: boolean }
 */
function handleInterruptEndpoint(req, res, sessionId) {
    setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const session = sessions.get(sessionId);
    if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
    }

    const result = session.interrupt();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
}

/**
 * GET /status/:sessionId
 * Get session status
 * Response: { busy: boolean, connected: boolean }
 */
function handleStatusEndpoint(req, res, sessionId) {
    setCorsHeaders(res);

    const session = sessions.get(sessionId);
    if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(session.getStatus()));
}

/**
 * GET /screen/:sessionId
 * Read the screen buffer
 * Response: { content: string }
 */
function handleScreenEndpoint(req, res, sessionId) {
    setCorsHeaders(res);

    const session = sessions.get(sessionId);
    if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(session.readScreen()));
}

// ============================================================================
// Server Setup
// ============================================================================

async function startServer() {
    // Create Next.js app
    const app = next({ dev, dir: process.cwd() });
    const handle = app.getRequestHandler();
    await app.prepare();

    // Create HTTP server
    const server = http.createServer((req, res) => {

        const parsedUrl = parse(req.url, true);
        const { pathname } = parsedUrl;

        // ====================================================================
        // API Endpoints
        // ====================================================================

        if (req.method === 'POST' && pathname.startsWith('/execute/')) {
            const sessionId = pathname.split('/')[2];
            handleExecuteEndpoint(req, res, sessionId);
            return;
        }

        if (req.method === 'POST' && pathname.startsWith('/interrupt/')) {
            const sessionId = pathname.split('/')[2];
            handleInterruptEndpoint(req, res, sessionId);
            return;
        }

        if (req.method === 'GET' && pathname.startsWith('/status/')) {
            const sessionId = pathname.split('/')[2];
            handleStatusEndpoint(req, res, sessionId);
            return;
        }

        if (req.method === 'GET' && pathname.startsWith('/screen/')) {
            const sessionId = pathname.split('/')[2];
            handleScreenEndpoint(req, res, sessionId);
            return;
        }

        // Handle OPTIONS for CORS preflight
        if (req.method === 'OPTIONS' &&
            (pathname.startsWith('/execute/') ||
                pathname.startsWith('/interrupt/') ||
                pathname.startsWith('/status/') ||
                pathname.startsWith('/screen/'))) {
            setCorsHeaders(res);
            res.writeHead(204);
            res.end();
            return;
        }

        // ====================================================================
        // Session URL rewrite: /t/:sessionId -> /
        // ====================================================================

        if (pathname.startsWith('/t/')) {
            req.url = '/';
            parsedUrl.pathname = '/';
        }

        // Let Next.js handle everything else
        handle(req, res, parsedUrl);
    });

    // ========================================================================
    // Socket.IO Setup
    // ========================================================================

    const io = new Server(server, {
        cors: { origin: '*', methods: ['GET', 'POST'] }
    });

    // ------------------------------------------------------------------------
    // Bridge Namespace - Terminal binaries connect here
    // ------------------------------------------------------------------------

    const bridgeNsp = io.of('/bridge');

    bridgeNsp.on('connection', (socket) => {
        console.log('Terminal bridge connected');

        // Create session
        const sessionId = generateSessionId();
        const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
        const session = new Session(sessionId, socket);
        sessions.set(sessionId, session);

        // Send session info to the binary
        socket.emit('session', {
            id: sessionId,
            url: `${baseUrl}/t/${sessionId}`
        });

        console.log(`Session ${sessionId} created`);

        // Handle output from terminal - this is where the magic happens
        socket.on('output', (data) => {
            session.handleOutput(data);
        });

        socket.on('disconnect', () => {
            console.log(`Session ${sessionId} bridge disconnected`);
            session.bridgeSocket = null;
            session.destroy();
            sessions.delete(sessionId);
        });
    });

    // ------------------------------------------------------------------------
    // Default Namespace - Browsers connect here
    // ------------------------------------------------------------------------

    io.on('connection', (socket) => {
        const sessionId = socket.handshake.query.sessionId;

        if (!sessionId) {
            socket.emit('error', { message: 'No sessionId provided' });
            return;
        }

        const session = sessions.get(sessionId);
        if (!session) {
            socket.emit('error', { message: 'Session not found' });
            socket.disconnect();
            return;
        }

        console.log(`Browser connected to session ${sessionId}`);
        session.browserSockets.add(socket);

        // Handle human input from browser
        socket.on('input', (data) => {
            session.handleHumanInput(data);
        });

        // Handle terminal resize
        socket.on('resize', (size) => {
            session.handleResize(size);
        });

        socket.on('disconnect', () => {
            console.log(`Browser disconnected from session ${sessionId}`);
            session.browserSockets.delete(socket);
        });
    });

    // ========================================================================
    // Start Server
    // ========================================================================

    server.listen(PORT, () => {
        console.log(`🚀 Relay server running on http://localhost:${PORT}`);
        console.log('');
        console.log('Endpoints:');
        console.log(`   Terminal binaries: ws://localhost:${PORT}/bridge`);
        console.log(`   Browsers:          ws://localhost:${PORT}?sessionId=xxx`);
        console.log(`   Execute:           POST /execute/:sessionId`);
        console.log(`   Interrupt:         POST /interrupt/:sessionId`);
        console.log(`   Status:            GET  /status/:sessionId`);
        console.log(`   Screen:            GET  /screen/:sessionId`);
    });
}

startServer().catch(console.error);
