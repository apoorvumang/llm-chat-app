import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req) {
    try {
        const { message, baseUrl, modelName, apiKey } = await req.json();

        const client = new OpenAI({
            baseURL: baseUrl || "https://1d5ec949a357.ngrok.app/v1",
            apiKey: apiKey || 'dummy',
        });

        const response = await client.chat.completions.create({
            model: modelName || "mercury-24-11",
            messages: [
                {
                    role: "system",
                    content: "Generate a short, concise title (max 6 words) for this chat based on the user's message below. Output the title directly."
                },
                {
                    role: "user",
                    content: "<start_user_message>" + message + "<end_user_message>"
                }
            ],
            max_tokens: 5000,
            temperature: 0.5,
        });

        const title = response.choices[0].message.content.trim().replace(/^["']|["']$/g, '');

        return NextResponse.json({ title });

    } catch (error) {
        console.error('Error generating title:', error);
        return NextResponse.json(
            { error: 'Failed to generate title' },
            { status: 500 }
        );
    }
}
