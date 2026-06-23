'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { io } from 'socket.io-client';
import { AlertCircle, RefreshCw, ExternalLink, Cloud } from 'lucide-react';
import styles from './TerminalWindow.module.css';

const TerminalWindow = ({ sessionId }) => {
    const terminalRef = useRef(null);
    const xtermRef = useRef(null);
    const socketRef = useRef(null);
    const [status, setStatus] = useState(sessionId ? 'connecting' : 'no_session');

    useEffect(() => {
        if (!terminalRef.current || !sessionId) return;

        const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            scrollback: 10000,
            allowProposedApi: true,
            theme: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
                cursor: '#aeafad',
                selectionBackground: '#264f78',
                black: '#000000',
                red: '#cd3131',
                green: '#0dbc79',
                yellow: '#e5e510',
                blue: '#2472c8',
                magenta: '#bc3fbc',
                cyan: '#11a8cd',
                white: '#e5e5e5',
                brightBlack: '#666666',
                brightRed: '#f14c4c',
                brightGreen: '#23d18b',
                brightYellow: '#f5f543',
                brightBlue: '#3b8eea',
                brightMagenta: '#d670d6',
                brightCyan: '#29b8db',
                brightWhite: '#e5e5e5',
            },
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);

        // Use ResizeObserver for more robust fitting
        const resizeObserver = new ResizeObserver(() => {
            if (terminalRef.current) {
                fitAddon.fit();
                socketRef.current?.emit('resize', {
                    cols: term.cols,
                    rows: term.rows,
                });
            }
        });

        if (terminalRef.current) {
            resizeObserver.observe(terminalRef.current);
        }

        xtermRef.current = term;

        // Connect to relay server with sessionId
        const socket = io(window.location.origin, {
            reconnectionAttempts: 5,
            timeout: 2000,
            query: { sessionId }
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            setStatus('connected');
        });

        socket.on('disconnect', () => {
            setStatus('disconnected');
        });

        socket.on('connect_error', () => {
            setStatus('disconnected');
        });

        socket.on('bridge_disconnected', () => {
            setStatus('disconnected');
            term.write('\r\n\x1b[31m[Terminal bridge disconnected]\x1b[0m\r\n');
        });

        socket.on('error', (data) => {
            setStatus('disconnected');
            term.write(`\r\n\x1b[31m[Error: ${data.message}]\x1b[0m\r\n`);
        });

        socket.on('output', (data) => {
            term.write(data);
        });

        term.onData((data) => {
            socket.emit('input', data);
        });

        return () => {
            resizeObserver.disconnect();
            socket.disconnect();
            term.dispose();
        };
    }, [sessionId]);

    const handleRetry = () => {
        if (sessionId && socketRef.current) {
            setStatus('connecting');
            socketRef.current.connect();
        }
    };

    const openRepo = () => {
        window.open('https://github.com/apoorvumang/llm-terminal', '_blank');
    };

    return (
        <div className={styles.container}>
            {status !== 'connected' && (
                <div className={styles.setupOverlay}>
                    <div className={styles.setupCard}>
                        <div className={status === 'no_session' || status === 'disconnected' ? styles.errorIcon : styles.loadingIcon}>
                            {status === 'connecting'
                                ? <RefreshCw className={styles.spin} size={32} />
                                : <AlertCircle size={32} />}
                        </div>

                        {status === 'no_session' ? (
                            <>
                                <h3>Terminal Setup Required</h3>
                                <p>
                                    To use the terminal, run the llm-terminal binary on any machine you want to connect to.
                                </p>
                                <button className={styles.retryBtn} onClick={openRepo}>
                                    <ExternalLink size={14} /> View Setup Instructions
                                </button>
                                <p className={styles.hint}>
                                    Download the binary for your platform from the llm-terminal repository.
                                </p>
                            </>
                        ) : status === 'disconnected' ? (
                            <>
                                <h3>Terminal Disconnected</h3>
                                <p className={styles.hint}>
                                    <Cloud size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                                    Session: {sessionId}
                                </p>
                                <button className={styles.retryBtn} onClick={handleRetry}>
                                    <RefreshCw size={14} /> Retry Connection
                                </button>
                            </>
                        ) : (
                            <>
                                <h3>Connecting to Terminal...</h3>
                                <p className={styles.hint}>
                                    <Cloud size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                                    Session: {sessionId}
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}
            <div ref={terminalRef} className={styles.terminal} style={{ visibility: status === 'connected' ? 'visible' : 'hidden' }} />
        </div>
    );
};

export default TerminalWindow;
