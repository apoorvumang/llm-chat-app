'use client';

import { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatArea from '@/components/ChatArea';
import SettingsModal from '@/components/SettingsModal';
import { Menu, ChevronDown, Terminal as TerminalIcon, X, Minus, ChevronUp } from 'lucide-react';
import styles from './page.module.css';
import { getAllChats, saveChats, getSetting, saveSetting, migrateFromLocalStorage } from '@/utils/db';
import dynamic from 'next/dynamic';

const TerminalWindow = dynamic(() => import('@/components/TerminalWindow'), { ssr: false });

export default function Home() {
    const [chats, setChats] = useState([]);
    const [currentChatId, setCurrentChatId] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [terminalState, setTerminalState] = useState('hidden'); // 'hidden', 'visible', 'minimized'
    const [terminalHeight, setTerminalHeight] = useState(350);
    const [isResizing, setIsResizing] = useState(false);

    // Multiple endpoints state - server (read-only) and user (editable)
    const [serverEndpoints, setServerEndpoints] = useState([]);
    const [userEndpoints, setUserEndpoints] = useState([]);
    const [serverEndpointApiKeys, setServerEndpointApiKeys] = useState({}); // API keys stored locally per server endpoint
    // Combined endpoints for model selector
    const endpoints = [...serverEndpoints, ...userEndpoints];
    const [selectedEndpointId, setSelectedEndpointId] = useState(null);
    const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
    const [userColor, setUserColor] = useState('#374151');
    const [isSearchEnabled, setIsSearchEnabled] = useState(false);
    const [isThinkingEnabled, setIsThinkingEnabled] = useState(false);
    const [sessionId, setSessionId] = useState(null); // Remote terminal session ID
    const [apiKeyError, setApiKeyError] = useState(null); // Show error when API key missing
    const chatAreaRef = useRef(null);
    const abortControllerRef = useRef(null); // For canceling ongoing requests

    // Load chats and settings from IndexedDB and Server on mount
    useEffect(() => {
        async function loadData() {
            try {
                // Migrate from localStorage if needed
                await migrateFromLocalStorage();

                // Load chats (keep local)
                const savedChats = await getAllChats();

                // Load settings from Server first (server endpoints)
                let serverData = { serverEndpoints: [], userColor: '#374151' };
                try {
                    const res = await fetch('/api/settings');
                    if (res.ok) {
                        serverData = await res.json();
                    }
                } catch (e) {
                    console.error('Failed to fetch server settings:', e);
                }

                // Load user endpoints and server API keys from local IndexedDB
                const savedUserEndpoints = await getSetting('llm-user-endpoints');
                const savedServerApiKeys = await getSetting('llm-server-endpoint-api-keys');
                const savedSelectedEndpointId = await getSetting('llm-selected-endpoint-id');
                const savedUserColor = await getSetting('llm-user-color');

                // Apply server data with local fallbacks
                setUserColor(serverData.userColor || savedUserColor || '#374151');
                setServerEndpoints(serverData.serverEndpoints || []);
                setServerEndpointApiKeys(savedServerApiKeys ? (typeof savedServerApiKeys === 'string' ? JSON.parse(savedServerApiKeys) : savedServerApiKeys) : {});

                // Parse and set user endpoints
                const parsedUserEndpoints = savedUserEndpoints
                    ? (typeof savedUserEndpoints === 'string' ? JSON.parse(savedUserEndpoints) : savedUserEndpoints)
                    : [];
                setUserEndpoints(parsedUserEndpoints);

                // Combine all endpoints for selection logic
                const allEndpoints = [...(serverData.serverEndpoints || []), ...parsedUserEndpoints];

                // Check URL for session ID (remote terminal mode)
                const pathMatch = window.location.pathname.match(/^\/t\/([a-z0-9]+)$/i);
                if (pathMatch) {
                    setSessionId(pathMatch[1]);
                    // Auto-show terminal in remote mode
                    setTerminalState('visible');
                }

                // Check URL parameter for endpoint
                const urlParams = new URLSearchParams(window.location.search);
                const endpointFromUrl = urlParams.get('endpoint');

                // Priority: URL param > saved preference > first endpoint
                if (endpointFromUrl && allEndpoints.find(ep => ep.id === endpointFromUrl)) {
                    setSelectedEndpointId(endpointFromUrl);
                    await saveSetting('llm-selected-endpoint-id', endpointFromUrl);
                } else if (savedSelectedEndpointId && allEndpoints.find(ep => ep.id === savedSelectedEndpointId)) {
                    setSelectedEndpointId(savedSelectedEndpointId);
                } else if (allEndpoints.length > 0) {
                    setSelectedEndpointId(allEndpoints[0].id);
                }

                // Handle chats - sort by createdAt (newest first)
                if (savedChats && savedChats.length > 0) {
                    const sortedChats = [...savedChats].sort((a, b) =>
                        new Date(b.createdAt) - new Date(a.createdAt)
                    );
                    setChats(sortedChats);
                    setCurrentChatId(sortedChats[0].id);
                } else {
                    createNewChat();
                }
            } catch (error) {
                console.error('Error loading data:', error);
                // Fallback to creating new chat
                createNewChat();
            }
        }

        loadData();
    }, []);

    // Update document title based on current chat
    useEffect(() => {
        const currentChat = chats.find(c => c.id === currentChatId);
        if (currentChat) {
            document.title = `${currentChat.title} | Mercury Chat`;
        } else {
            document.title = 'Mercury Chat';
        }
    }, [currentChatId, chats]);

    // Save chats to IndexedDB whenever they change
    useEffect(() => {
        if (chats.length > 0) {
            saveChats(chats).catch(error => {
                console.error('Error saving chats to IndexedDB:', error);
            });
        }
    }, [chats]);

    const handleSaveSettings = async ({ userEndpoints: newUserEndpoints, serverEndpointApiKeys: newServerApiKeys, userColor }) => {
        setUserEndpoints(newUserEndpoints);
        setServerEndpointApiKeys(newServerApiKeys);
        setUserColor(userColor);
        setApiKeyError(null); // Clear any API key error

        try {
            // Save userColor to server
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userColor })
            });

            // Save user endpoints and server API keys to local IndexedDB
            await saveSetting('llm-user-endpoints', JSON.stringify(newUserEndpoints));
            await saveSetting('llm-server-endpoint-api-keys', JSON.stringify(newServerApiKeys));
            await saveSetting('llm-user-color', userColor);

            // Check if currently selected endpoint was deleted
            const allEndpoints = [...serverEndpoints, ...newUserEndpoints];
            if (!allEndpoints.find(ep => ep.id === selectedEndpointId)) {
                const newSelectedId = allEndpoints.length > 0 ? allEndpoints[0].id : null;
                setSelectedEndpointId(newSelectedId);
                if (newSelectedId) {
                    await saveSetting('llm-selected-endpoint-id', newSelectedId);
                }
            }
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    };

    const handleSelectEndpoint = async (id) => {
        setSelectedEndpointId(id);
        try {
            await saveSetting('llm-selected-endpoint-id', id);
        } catch (error) {
            console.error('Error saving selected endpoint to IndexedDB:', error);
        }
        setIsModelSelectorOpen(false);
    };


    const createNewChat = () => {
        const newChat = {
            id: Date.now().toString(),
            title: 'New Chat',
            messages: [],
            createdAt: new Date().toISOString(),
        };
        setChats(prev => [newChat, ...prev]);
        setCurrentChatId(newChat.id);
        if (window.innerWidth < 768) {
            setIsSidebarOpen(false);
        }
        // Focus the chatbox after creating new chat
        setTimeout(() => chatAreaRef.current?.focusInput(), 0);
    };

    const deleteChat = (chatId) => {
        const newChats = chats.filter(c => c.id !== chatId);
        setChats(newChats);
        // Chats will be saved automatically by the useEffect hook

        if (currentChatId === chatId) {
            if (newChats.length > 0) {
                setCurrentChatId(newChats[0].id);
            } else {
                createNewChat();
            }
        }
    };

    const handleRenameChat = (chatId, newTitle) => {
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: newTitle } : c));
    };

    const getCurrentChat = () => {
        return chats.find(c => c.id === currentChatId) || chats[0];
    };

    const getSelectedEndpoint = () => {
        const endpoint = endpoints.find(ep => ep.id === selectedEndpointId);
        if (!endpoint) return null;

        // For server endpoints, merge in the locally stored API key
        if (endpoint.isServerEndpoint) {
            return {
                ...endpoint,
                apiKey: serverEndpointApiKeys[endpoint.id] || ''
            };
        }
        return endpoint;
    };

    const handleTerminalResize = (e) => {
        if (!isResizing) return;
        const newHeight = window.innerHeight - e.clientY;
        if (newHeight > 100 && newHeight < window.innerHeight * 0.8) {
            setTerminalHeight(newHeight);
        }
    };

    const stopResizing = () => {
        setIsResizing(false);
    };

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', handleTerminalResize);
            window.addEventListener('mouseup', stopResizing);
        } else {
            window.removeEventListener('mousemove', handleTerminalResize);
            window.removeEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', handleTerminalResize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing]);

    const handleStopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
    };

    const handleSendMessage = async (content, existingHistory = null) => {
        const currentChat = getCurrentChat();
        const endpoint = getSelectedEndpoint();

        if (!currentChat || !endpoint) return;

        // Check for missing API key
        if (!endpoint.apiKey) {
            setApiKeyError({
                message: 'API key required',
                description: 'Please add your Mercury API key in Settings to use this model.',
                link: 'https://platform.inceptionlabs.ai/',
                linkText: 'Get your free API key'
            });
            return;
        }
        setApiKeyError(null);

        // Cancel any ongoing request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        let messagesForApi = existingHistory;
        if (!messagesForApi) {
            const userMessage = { role: 'user', content };
            messagesForApi = [...currentChat.messages, userMessage];

            // Update state with user message if it's the start of a turn
            setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: messagesForApi } : c));
        }

        setIsLoading(true);

        // Generate title if it's the first message
        if (!existingHistory && messagesForApi.length === 1) {
            fetch('/api/title', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: content,
                    baseUrl: endpoint.baseUrl,
                    modelName: endpoint.modelName,
                    apiKey: endpoint.apiKey
                }),
            })
                .then(res => res.json())
                .then(data => {
                    if (data.title) {
                        setChats(prev => prev.map(c =>
                            c.id === currentChatId ? { ...c, title: data.title } : c
                        ));
                    }
                })
                .catch(err => console.error('Error generating title:', err));
        }

        try {
            const requestStartTime = Date.now();
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: messagesForApi,
                    systemPrompt: 'You are a helpful assistant.',
                    baseUrl: endpoint.baseUrl,
                    modelName: endpoint.modelName,
                    apiKey: endpoint.apiKey,
                    extraParams: endpoint.extraParams || [],
                    useSearch: isSearchEnabled,
                    enableThinking: isThinkingEnabled
                }),
                signal,
            });

            if (!response.ok) throw new Error('Failed to fetch response');

            const botMessage = { role: 'assistant', content: '', toolCalls: [], metrics: null };
            let currentMessages = [...messagesForApi, botMessage];

            setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: currentMessages } : c));

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = '';
            let accumulatedReasoning = '';
            let toolCallsInChunk = [];
            let firstTokenTime = null;
            let metrics = null;
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);
                        console.log('Parsed chunk:', data.type, data.content?.substring(0, 30));
                        if (data.type === 'text') {
                            accumulatedContent += data.content;
                            if (firstTokenTime === null) firstTokenTime = Date.now();
                        } else if (data.type === 'reasoning_content') {
                            accumulatedReasoning += data.content;
                            console.log('Reasoning accumulated:', accumulatedReasoning.length);
                        } else if (data.type === 'tool_call') {
                            // Map the stream tool_call format to the UI's tool format
                            const toolCall = {
                                id: data.id,
                                tool: data.tool,
                                query: data.args.query,
                                command: data.args.command,
                                args: data.args
                            };
                            toolCallsInChunk.push(toolCall);
                        }
                    } catch (e) {
                        console.error('Error parsing chunk:', e);
                    }
                }

                const latency = (Date.now() - requestStartTime) / 1000;
                const toksDuration = firstTokenTime ? (Date.now() - firstTokenTime) / 1000 : 0;
                const tokens = accumulatedContent.length / 4;
                const toks = toksDuration > 0 ? (tokens / toksDuration).toFixed(1) : '0.0';
                metrics = { tokensPerSecond: toks, latency: latency.toFixed(2) };

                setChats(prev => prev.map(c => {
                    if (c.id === currentChatId) {
                        const messages = [...c.messages];
                        messages[messages.length - 1] = {
                            ...messages[messages.length - 1],
                            content: accumulatedContent,
                            reasoning_content: accumulatedReasoning,
                            thinking: accumulatedReasoning,
                            metrics: metrics,
                            toolCalls: toolCallsInChunk
                        };
                        return { ...c, messages };
                    }
                    return c;
                }));
            }

            // After stream is done, check if we need to execute tools
            if (toolCallsInChunk.length > 0) {
                const toolResults = [];

                for (const toolCall of toolCallsInChunk) {
                    let result;
                    try {
                        if (toolCall.tool === 'run_command') {
                            if (!sessionId) {
                                throw new Error('No terminal session. Run llm-terminal on your machine first.');
                            }
                            const res = await fetch(`/execute/${sessionId}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ command: toolCall.command })
                            });
                            if (!res.ok) throw new Error('Terminal bridge not responding');
                            const data = await res.json();
                            result = JSON.stringify({ stdout: data.output, stderr: data.error || '' });
                        } else if (toolCall.tool === 'search') {
                            const res = await fetch('/api/search', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ query: toolCall.query })
                            });
                            const data = await res.json();
                            result = JSON.stringify(data);
                        }
                    } catch (e) {
                        const isTerminalError = toolCall.tool === 'run_command';
                        result = JSON.stringify({
                            error: isTerminalError
                                ? "No terminal session connected. Run the llm-terminal binary on your machine and access this app via the URL it provides. See https://github.com/apoorvumang/llm-terminal for setup."
                                : e.message
                        });
                    }

                    toolResults.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: result
                    });
                }

                // Append the assistant message (with tool calls) and the tool results to history
                const finalAssistantMessage = {
                    role: 'assistant',
                    content: accumulatedContent,
                    reasoning_content: accumulatedReasoning,
                    thinking: accumulatedReasoning,
                    tool_calls: toolCallsInChunk.map(t => ({
                        id: t.id,
                        type: 'function',
                        function: {
                            name: t.tool,
                            arguments: JSON.stringify(t.args || (t.tool === 'search' ? { query: t.query } : { command: t.command }))
                        }
                    })),
                    toolCalls: toolCallsInChunk,
                    metrics: metrics
                };

                const nextHistory = [...messagesForApi, finalAssistantMessage, ...toolResults];

                // Update state with the tool execution progress before recursing
                setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: nextHistory } : c));

                // Recursively call for the next turn
                // Check if aborted before recursing
                if (signal.aborted) {
                    setIsLoading(false);
                    return;
                }
                return handleSendMessage(null, nextHistory);
            }

            setIsLoading(false);
            abortControllerRef.current = null;
        } catch (error) {
            if (error.name === 'AbortError') {
                // User cancelled the request - this is expected
                console.log('Request was cancelled by user');
            } else {
                console.error('Error:', error);
            }
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    };

    const handleEditMessage = async (index, newContent) => {
        if (!currentChatId) return;

        const currentChat = chats.find(c => c.id === currentChatId);
        if (!currentChat) return;

        // Keep messages up to the edited one (not including it)
        const previousMessages = currentChat.messages.slice(0, index);

        // Add the new user message with the edited content
        const userMessage = { role: 'user', content: newContent };
        const historyWithEdit = [...previousMessages, userMessage];

        // Update state first to show the edited message
        setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: historyWithEdit } : c));

        // Call handleSendMessage with null content since the message is already in history
        return handleSendMessage(null, historyWithEdit);
    };

    const handleRerunMessage = async (index) => {
        if (!currentChatId) return;

        const currentChat = chats.find(c => c.id === currentChatId);
        if (!currentChat) return;

        // Keep messages up to the one we want to rerun
        const messageToRerun = currentChat.messages[index];
        if (messageToRerun.role !== 'user') return;

        const historyBefore = currentChat.messages.slice(0, index);

        // Include the message to rerun in the history
        const historyWithMessage = [...historyBefore, messageToRerun];

        // Update state first
        setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: historyWithMessage } : c));

        return handleSendMessage(null, historyWithMessage);
    };

    return (
        <div className={styles.container}>
            <div className={`${styles.sidebarWrapper} ${isSidebarOpen ? styles.open : ''}`}>
                <Sidebar
                    chats={chats}
                    currentChatId={currentChatId}
                    onSelectChat={(id) => {
                        setCurrentChatId(id);
                        if (window.innerWidth < 768) setIsSidebarOpen(false);
                        // Focus the chatbox after selecting a chat
                        setTimeout(() => chatAreaRef.current?.focusInput(), 0);
                    }}
                    onNewChat={createNewChat}
                    onDeleteChat={deleteChat}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                    onRenameChat={handleRenameChat}
                />
            </div>

            <div className={styles.mainContent}>
                <header className={styles.header}>
                    <div className={styles.headerLeft}>
                        <button
                            className={styles.menuBtn}
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        >
                            <Menu size={24} />
                        </button>
                        <span className={styles.headerTitle}>
                            {getCurrentChat()?.title || 'New Chat'}
                        </span>
                    </div>

                    <div className={styles.headerRight}>
                        <button
                            className={styles.shareBtn}
                            onClick={() => setTerminalState(terminalState === 'visible' ? 'minimized' : 'visible')}
                            title="Toggle Terminal"
                            style={{ color: terminalState !== 'hidden' ? 'var(--primary)' : 'inherit', borderColor: terminalState !== 'hidden' ? 'var(--primary)' : 'inherit' }}
                        >
                            <TerminalIcon size={18} />
                        </button>


                        <div className={styles.modelSelector}>
                            <button
                                className={styles.modelSelectorBtn}
                                onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)}
                            >
                                {getSelectedEndpoint()?.name || 'Select Model'}
                                <ChevronDown size={16} />
                            </button>

                            {isModelSelectorOpen && (
                                <div className={styles.modelDropdown}>
                                    {endpoints.map(ep => (
                                        <button
                                            key={ep.id}
                                            className={`${styles.modelOption} ${selectedEndpointId === ep.id ? styles.selected : ''}`}
                                            onClick={() => handleSelectEndpoint(ep.id)}
                                        >
                                            {ep.name}
                                            <span className={styles.modelDetail}>{ep.modelName}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <ChatArea
                    ref={chatAreaRef}
                    messages={getCurrentChat()?.messages || []}
                    onSendMessage={handleSendMessage}
                    onStopGeneration={handleStopGeneration}
                    isLoading={isLoading}
                    metrics={true}
                    onEditMessage={handleEditMessage}
                    onRerunMessage={handleRerunMessage}
                    userColor={userColor}
                    isSearchEnabled={isSearchEnabled}
                    onToggleSearch={() => setIsSearchEnabled(!isSearchEnabled)}
                    isThinkingEnabled={isThinkingEnabled}
                    onToggleThinking={() => setIsThinkingEnabled(!isThinkingEnabled)}
                />

                {apiKeyError && (
                    <div className={styles.apiKeyError}>
                        <div className={styles.apiKeyErrorContent}>
                            <strong>{apiKeyError.message}</strong>
                            <p>{apiKeyError.description}</p>
                            <div className={styles.apiKeyErrorActions}>
                                <a href={apiKeyError.link} target="_blank" rel="noopener noreferrer" className={styles.apiKeyLink}>
                                    {apiKeyError.linkText}
                                </a>
                                <button onClick={() => setIsSettingsOpen(true)} className={styles.apiKeySettingsBtn}>
                                    Open Settings
                                </button>
                            </div>
                        </div>
                        <button onClick={() => setApiKeyError(null)} className={styles.apiKeyErrorClose}>×</button>
                    </div>
                )}

                {terminalState !== 'hidden' && (
                    <div
                        className={`${styles.terminalWrapper} ${terminalState === 'minimized' ? styles.minimized : ''}`}
                        style={{
                            height: terminalState === 'minimized' ? '40px' : `${terminalHeight}px`,
                            transition: isResizing ? 'none' : 'height 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                    >
                        <div
                            className={styles.resizeHandle}
                            onMouseDown={() => setIsResizing(true)}
                        />
                        <div className={styles.terminalHeader}>
                            <div className={styles.terminalTitle}>
                                <TerminalIcon size={14} />
                                <span>Terminal</span>
                            </div>
                            <div className={styles.terminalActions}>
                                <button
                                    className={styles.terminalActionBtn}
                                    onClick={() => setTerminalState(terminalState === 'minimized' ? 'visible' : 'minimized')}
                                    title={terminalState === 'minimized' ? 'Maximize' : 'Minimize'}
                                >
                                    {terminalState === 'minimized' ? <ChevronUp size={14} /> : <Minus size={14} />}
                                </button>
                                <button className={styles.terminalActionBtn} onClick={() => setTerminalState('hidden')} title="Close">
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                        <div className={styles.terminalContent}>
                            <TerminalWindow sessionId={sessionId} />
                        </div>
                    </div>
                )}

                <SettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    serverEndpoints={serverEndpoints}
                    userEndpoints={userEndpoints}
                    serverEndpointApiKeys={serverEndpointApiKeys}
                    userColor={userColor}
                    onSave={handleSaveSettings}
                />
            </div>
        </div>
    );
}
