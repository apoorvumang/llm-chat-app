import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req) {
    try {
        const { messages, systemPrompt, baseUrl, modelName, apiKey, extraParams, useSearch, enableThinking } = await req.json();

        const client = new OpenAI({
            baseURL: baseUrl || "https://1d5ec949a357.ngrok.app/v1",
            apiKey: apiKey || 'dummy',
        });

        const extraParamsObj = {};
        if (extraParams && Array.isArray(extraParams)) {
            extraParams.forEach(param => {
                if (param.key && param.value) {
                    let value = param.value;
                    try {
                        value = JSON.parse(param.value);
                    } catch {
                        // not valid JSON — keep as string
                    }
                    extraParamsObj[param.key] = value;
                }
            });
        }

        // Some chat templates (e.g. diffusiongemma) reject assistant messages with
        // empty content, which happens when the model emits only a tool call. Backfill
        // a placeholder so the tool-call follow-up request is accepted.
        const normalizedMessages = (messages || []).map(m =>
            m.role === 'assistant' && (m.content == null || String(m.content).trim() === '')
                ? { ...m, content: '(calling tool)' }
                : m
        );

        const tools = [
            {
                type: 'function',
                function: {
                    name: 'run_command',
                    description: 'Run a bash command on the local machine. Use this to interact with the system, run scripts, and SSH into remote clusters.',
                    parameters: {
                        type: 'object',
                        properties: {
                            command: { type: 'string', description: 'The bash command to execute' },
                        },
                        required: ['command'],
                    },
                },
            }
        ];

        if (useSearch) {
            tools.push({
                type: 'function',
                function: {
                    name: 'search',
                    description: 'Search the web for information using Exa. Use this tool when the user asks for current events, facts, or information you don\'t know.',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'The search query' },
                        },
                        required: ['query'],
                    },
                },
            });
        }

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    const response = await client.chat.completions.create({
                        model: modelName || "mercury-24-11",
                        messages: [
                            { role: "system", content: systemPrompt || "You are a helpful assistant." },
                            ...normalizedMessages
                        ],
                        tools: tools,
                        stream: true,
                        temperature: 0.75,
                        ...extraParamsObj,
                        max_tokens: 20000,
                        chat_template_kwargs: {
                            ...(extraParamsObj.chat_template_kwargs || {}),
                            enable_thinking: !!enableThinking,
                        },
                    });

                    let toolCalls = [];

                    for await (const chunk of response) {
                        const delta = chunk.choices[0]?.delta;

                        // Handle content
                        if (delta?.content) {
                            controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'text', content: delta.content }) + '\n'));
                        }

                        // Handle reasoning content (some models use `reasoning_content`, others use `reasoning`)
                        const reasoningContent = chunk.choices[0]?.delta?.reasoning_content ?? chunk.choices[0]?.delta?.reasoning;
                        if (reasoningContent != null && reasoningContent !== '') {
                            controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'reasoning_content', content: reasoningContent }) + '\n'));
                        }

                        // Handle tool calls
                        if (delta?.tool_calls) {
                            for (const toolCallDelta of delta.tool_calls) {
                                const index = toolCallDelta.index;
                                if (!toolCalls[index]) {
                                    toolCalls[index] = {
                                        id: toolCallDelta.id,
                                        type: 'function',
                                        function: { name: '', arguments: '' }
                                    };
                                }

                                if (toolCallDelta.id) toolCalls[index].id = toolCallDelta.id;
                                if (toolCallDelta.function?.name) toolCalls[index].function.name += toolCallDelta.function.name;
                                if (toolCallDelta.function?.arguments) toolCalls[index].function.arguments += toolCallDelta.function.arguments;
                            }
                        }
                    }

                    // After stream ends, send completed tool calls to client
                    for (const toolCall of toolCalls) {
                        if (toolCall) {
                            // Extract arguments for cleaner processing on client
                            let parsedArgs = {};
                            try {
                                parsedArgs = JSON.parse(toolCall.function.arguments);
                            } catch (e) {
                                console.warn("Failed to parse tool arguments:", toolCall.function.arguments);
                            }

                            controller.enqueue(new TextEncoder().encode(JSON.stringify({
                                type: 'tool_call',
                                tool: toolCall.function.name,
                                args: parsedArgs,
                                id: toolCall.id
                            }) + '\n'));
                        }
                    }

                    controller.close();
                } catch (err) {
                    console.error('Stream error:', err);
                    controller.error(err);
                }
            },
        });

        return new NextResponse(stream, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });

    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        return NextResponse.json({ error: 'Failed to fetch response' }, { status: 500 });
    }
}
