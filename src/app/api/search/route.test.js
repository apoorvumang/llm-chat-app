import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

// Mock Exa
vi.mock('exa-js', () => {
    return {
        default: class {
            constructor() { }
            searchAndContents = vi.fn().mockResolvedValue({
                results: [{ title: 'Test Result', url: 'https://example.com' }]
            });
        }
    };
});

// Mock next/server
vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn().mockImplementation((data, init) => ({
            body: data,
            status: init?.status || 200,
            json: async () => data
        })),
    },
}));

describe('Search API Route', () => {
    beforeEach(() => {
        process.env.EXA_API_KEY = 'test-exa-key';
    });

    it('should return search results for a valid query', async () => {
        const req = {
            json: vi.fn().mockResolvedValue({ query: 'test query' }),
        };

        const response = await POST(req);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('results');
        expect(response.body.results[0].title).toBe('Test Result');
    });

    it('should return 500 error when search is not configured', async () => {
        delete process.env.EXA_API_KEY;

        const req = {
            json: vi.fn().mockResolvedValue({ query: 'test query' }),
        };

        const response = await POST(req);

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('error', 'Search is not configured');
    });

    it('should return 500 error when search fails', async () => {
        // Force an error in req.json() to simulate broad failure
        const req = {
            json: vi.fn().mockRejectedValue(new Error('Payload error')),
        };

        const response = await POST(req);

        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('error', 'Failed to search');
    });
});
