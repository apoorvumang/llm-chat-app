import { NextResponse } from 'next/server';
import Exa from 'exa-js';

export async function POST(req) {
    try {
        if (!process.env.EXA_API_KEY) {
            return NextResponse.json({ error: "Search is not configured" }, { status: 500 });
        }

        const exa = new Exa(process.env.EXA_API_KEY);
        const { query } = await req.json();

        const result = await exa.searchAndContents(
            query,
            {
                text: true,
                type: "auto"
            }
        );

        return NextResponse.json(result);
    } catch (e) {
        console.error("Search API error:", e);
        return NextResponse.json({ error: "Failed to search" }, { status: 500 });
    }
}
