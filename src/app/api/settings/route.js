import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const SETTINGS_FILE = path.join(process.cwd(), 'server-settings.json');

// Helper to read settings
async function readSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // If file doesn't exist, return empty object or defaults
        if (error.code === 'ENOENT') {
            return { endpoints: [] };
        }
        throw error;
    }
}

export async function GET() {
    try {
        const settings = await readSettings();
        // Return server endpoints as read-only
        // Mark them so frontend knows they can't be edited
        const serverEndpoints = (settings.endpoints || []).map(ep => ({
            ...ep,
            isServerEndpoint: true // Mark as server-provided, read-only
        }));
        return NextResponse.json({
            serverEndpoints,
            systemPrompt: settings.systemPrompt || '',
            userColor: settings.userColor || '#374151'
        });
    } catch (error) {
        console.error('Error reading settings:', error);
        return NextResponse.json({ error: 'Failed to read settings' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { systemPrompt, userColor } = await request.json();

        // Read existing to preserve endpoints
        const currentSettings = await readSettings();

        // Only update systemPrompt and userColor, NOT endpoints
        // Endpoints are now managed per-user in IndexedDB
        const updatedSettings = {
            ...currentSettings,
            systemPrompt: systemPrompt ?? currentSettings.systemPrompt,
            userColor: userColor ?? currentSettings.userColor
        };

        // Write back
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(updatedSettings, null, 2), 'utf8');

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error saving settings:', error);
        return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
    }
}
