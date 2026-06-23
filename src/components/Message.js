import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { User, Copy, Check, Edit2, RefreshCw, Search, Terminal as TerminalIcon, ChevronDown, ChevronRight, Brain } from 'lucide-react';
import MercuryLogo from './MercuryLogo';
import styles from './Message.module.css';

// Format user message with basic code block and inline code support
function formatUserMessage(text) {
    const parts = [];
    let lastIndex = 0;
    let keyCounter = 0;

    // Match code blocks (triple backticks) and inline code (single backticks)
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```|`([^`]+)`/g;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            const textBefore = text.slice(lastIndex, match.index);
            textBefore.split('\n').forEach((line, i, arr) => {
                parts.push(
                    <React.Fragment key={`text-${keyCounter++}`}>
                        {line}
                        {i < arr.length - 1 && <br />}
                    </React.Fragment>
                );
            });
        }

        if (match[2] !== undefined) {
            // Code block (triple backticks)
            parts.push(
                <pre key={`code-block-${keyCounter++}`} className={styles.userCodeBlock}>
                    <code>{match[2]}</code>
                </pre>
            );
        } else if (match[3] !== undefined) {
            // Inline code (single backticks)
            parts.push(
                <code key={`inline-code-${keyCounter++}`} className={styles.userInlineCode}>
                    {match[3]}
                </code>
            );
        }

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        const remainingText = text.slice(lastIndex);
        remainingText.split('\n').forEach((line, i, arr) => {
            parts.push(
                <React.Fragment key={`text-${keyCounter++}`}>
                    {line}
                    {i < arr.length - 1 && <br />}
                </React.Fragment>
            );
        });
    }

    return parts.length > 0 ? parts : [text];
}


const Message = React.memo(function Message({ role, content, messageIndex, ...props }) {
    const isUser = role === 'user';

    const [isEditing, setIsEditing] = React.useState(false);
    const [editContent, setEditContent] = React.useState(content);
    const [showReasoning, setShowReasoning] = React.useState(false);

    const textareaRef = React.useRef(null);

    React.useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [isEditing, editContent]);

    const handleSave = () => {
        if (props.onEdit && editContent.trim() !== content) {
            props.onEdit(messageIndex, editContent);
        }
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditContent(content);
        setIsEditing(false);
    };

    const handleRerun = () => {
        props.onRerun && props.onRerun(messageIndex);
    };

    return (
        <div className={`${styles.messageWrapper} ${isUser ? styles.userWrapper : styles.botWrapper}`}>
            <div
                className={`${styles.avatar} ${isUser ? styles.userAvatar : styles.botAvatar}`}
                style={isUser && props.userColor ? { backgroundColor: props.userColor } : {}}
            >
                {isUser ? <User size={20} /> : <MercuryLogo size={20} color="white" />}
            </div>
            <div
                className={`${styles.messageContent} ${isUser ? styles.userContent : styles.botContent}`}
                style={isUser && props.userColor ? { backgroundColor: props.userColor } : {}}
            >
                {isUser ? (
                    isEditing ? (
                        <div className={styles.editContainer}>
                            <textarea
                                ref={textareaRef}
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                className={styles.editTextarea}
                                rows={1}
                            />
                            <div className={styles.editActions}>
                                <button onClick={handleSave} className={styles.saveBtn}>Save & Run</button>
                                <button onClick={handleCancel} className={styles.cancelBtn}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <div className={styles.userMessageGroup}>
                            <div className={styles.userText}>{formatUserMessage(content)}</div>
                            <div className={styles.actionButtons}>
                                <button onClick={() => setIsEditing(true)} className={styles.editBtn} title="Edit">
                                    <Edit2 size={12} />
                                </button>
                                <button onClick={handleRerun} className={styles.rerunBtn} title="Rerun">
                                    <RefreshCw size={12} />
                                </button>
                            </div>
                        </div>
                    )
                ) : (
                    <div className={styles.markdown}>
                        {props.reasoning_content && (
                            <div className={styles.reasoningBlock}>
                                <button
                                    className={styles.reasoningToggle}
                                    onClick={() => setShowReasoning(!showReasoning)}
                                >
                                    {showReasoning ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    <Brain size={14} />
                                    <span>Reasoning</span>
                                </button>
                                {showReasoning && (
                                    <pre className={styles.reasoningContent}>
                                        {props.reasoning_content}
                                    </pre>
                                )}
                            </div>
                        )}
                        {(() => {
                            const calls = props.toolCalls || (props.tool_calls && props.tool_calls.map(tc => {
                                let args = {};
                                try {
                                    args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
                                } catch (e) { }
                                return {
                                    tool: tc.function.name,
                                    query: args.query,
                                    command: args.command,
                                    args: args
                                };
                            }));

                            if (calls && calls.length > 0) {
                                return (
                                    <div className={styles.toolCalls}>
                                        {calls.map((tool, index) => (
                                            <div key={index} className={styles.toolCall}>
                                                <span className={styles.toolIcon}>
                                                    {tool.tool === 'search' ? <Search size={14} /> : <TerminalIcon size={14} />}
                                                </span>
                                                <span className={styles.toolText}>
                                                    {tool.tool === 'search' ? `Searching for: ${tool.query}` : `Running command: ${tool.command}`}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            }
                            return null;
                        })()}
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                code({ node, inline, className, children, ...props }) {
                                    const [isCopied, setIsCopied] = React.useState(false);
                                    const codeContent = String(children).replace(/\n$/, '');
                                    const match = /language-(\w+)/.exec(className || '');

                                    // Heuristic: If it's a block (!inline) but has no language AND is single line,
                                    // treat it as inline. This fixes issues where short snippets are treated as blocks.
                                    const isMultiLine = codeContent.includes('\n');
                                    const isBlock = !inline && (match || isMultiLine);

                                    const handleCopy = () => {
                                        navigator.clipboard.writeText(codeContent);
                                        setIsCopied(true);
                                        setTimeout(() => setIsCopied(false), 2000);
                                    };

                                    return isBlock ? (
                                        <div className={styles.codeBlockWrapper}>
                                            <div className={styles.codeHeader}>
                                                <span className={styles.language}>
                                                    {match?.[1] || 'code'}
                                                </span>
                                                <button onClick={handleCopy} className={styles.copyBtn}>
                                                    {isCopied ? <Check size={14} /> : <Copy size={14} />}
                                                    <span>{isCopied ? 'Copied!' : 'Copy'}</span>
                                                </button>
                                            </div>
                                            <SyntaxHighlighter
                                                style={vscDarkPlus}
                                                language={match?.[1]}
                                                PreTag="div"
                                                className={styles.syntaxHighlighter}
                                                customStyle={{ margin: 0, borderRadius: '0 0 0.5rem 0.5rem' }}
                                                {...props}
                                            >
                                                {codeContent}
                                            </SyntaxHighlighter>
                                        </div>
                                    ) : (
                                        <code className={styles.inlineCode} {...props}>
                                            {children}
                                        </code>
                                    )
                                },
                                table({ children, ...props }) {
                                    return (
                                        <div className={styles.tableWrapper}>
                                            <table {...props}>{children}</table>
                                        </div>
                                    );
                                }
                            }}
                        >
                            {content}
                        </ReactMarkdown>
                    </div>
                )}
                {role === 'assistant' && props.metrics && (
                    <div className={styles.metrics}>
                        {typeof props.metrics === 'object' ? (
                            <>
                                {props.metrics.tokensPerSecond} tok/s
                                <span className={styles.metricSeparator}>•</span>
                                {props.metrics.latency}s e2e
                            </>
                        ) : (
                            props.metrics
                        )}
                    </div>
                )}
            </div>
        </div >
    );
});

export default Message;
