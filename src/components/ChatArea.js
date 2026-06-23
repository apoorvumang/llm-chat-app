import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Send, Globe, Square, Brain } from 'lucide-react';
import Message from './Message';
import styles from './ChatArea.module.css';

const ChatArea = forwardRef(function ChatArea({ messages, onSendMessage, onStopGeneration, isLoading, onEditMessage, onRerunMessage, userColor, isSearchEnabled, onToggleSearch, isThinkingEnabled, onToggleThinking }, ref) {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);
    const lastMessageCountRef = useRef(0);

    // Expose focusInput method to parent component
    useImperativeHandle(ref, () => ({
        focusInput: () => {
            textareaRef.current?.focus();
        }
    }));

    // Stable callbacks to prevent Message re-renders
    const handleEdit = useCallback((index, newContent) => {
        onEditMessage && onEditMessage(index, newContent);
    }, [onEditMessage]);

    const handleRerun = useCallback((index) => {
        onRerunMessage && onRerunMessage(index);
    }, [onRerunMessage]);

    // Only scroll when a new message is added, not during streaming
    useEffect(() => {
        const isNewMessage = messages.length > lastMessageCountRef.current;
        lastMessageCountRef.current = messages.length;

        if (isNewMessage && messages.length > 0) {
            // New message added - scroll to show it
            // Use a slight delay to ensure the DOM has updated
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 50);
        }
        // During streaming (content update but same message count), don't auto-scroll
    }, [messages]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;
        onSendMessage(input);
        setInput('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleInput = (e) => {
        const target = e.target;
        target.style.height = 'auto';
        target.style.height = `${Math.min(target.scrollHeight, 300)}px`;
        setInput(target.value);
    };

    return (
        <main className={styles.chatArea}>
            <div
                className={styles.messagesContainer}
            >
                {messages.length === 0 ? (
                    <div className={styles.emptyState}>
                        <h1>Welcome to AI Chat</h1>
                        <p>Start a conversation to see the magic happen.</p>
                    </div>
                ) : (
                    messages
                        .map((msg, originalIndex) => ({ msg, originalIndex }))
                        .filter(({ msg }) => msg.role !== 'tool')
                        .map(({ msg, originalIndex }) => (
                            <Message
                                key={originalIndex}
                                messageIndex={originalIndex}
                                role={msg.role}
                                content={msg.content}
                                reasoning_content={msg.reasoning_content}
                                metrics={msg.metrics}
                                toolCalls={msg.toolCalls}
                                tool_calls={msg.tool_calls}
                                onEdit={handleEdit}
                                onRerun={handleRerun}
                                userColor={userColor}
                            />
                        ))
                )}
                {isLoading && (
                    <div className={styles.loadingIndicator}>
                        <div className={styles.dot}></div>
                        <div className={styles.dot}></div>
                        <div className={styles.dot}></div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className={styles.inputContainer}>
                <form onSubmit={handleSubmit} className={styles.inputWrapper}>
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message..."
                        className={styles.textarea}
                        rows={1}
                    />
                    <button
                        type="button"
                        className={`${styles.searchToggle} ${isThinkingEnabled ? styles.searchEnabled : ''}`}
                        onClick={onToggleThinking}
                        title={isThinkingEnabled ? "Disable Thinking" : "Enable Thinking"}
                    >
                        <Brain size={20} />
                    </button>
                    <button
                        type="button"
                        className={`${styles.searchToggle} ${isSearchEnabled ? styles.searchEnabled : ''}`}
                        onClick={onToggleSearch}
                        title={isSearchEnabled ? "Disable Web Search" : "Enable Web Search"}
                    >
                        <Globe size={20} />
                    </button>
                    {isLoading ? (
                        <button
                            type="button"
                            className={`${styles.sendBtn} ${styles.stopBtn}`}
                            onClick={onStopGeneration}
                            title="Stop generating"
                        >
                            <Square size={16} fill="currentColor" />
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className={styles.sendBtn}
                            disabled={!input.trim()}
                        >
                            <Send size={20} />
                        </button>
                    )}
                </form>
                <p className={styles.disclaimer}>
                    AI can make mistakes. Consider checking important information.
                </p>
            </div>
        </main>
    );
});

export default ChatArea;

