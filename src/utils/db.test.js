import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { saveSetting, getSetting, initDB } from './db';

describe('Database Utilities', () => {
    beforeEach(async () => {
        // Reset the database before each test
        const db = await initDB();
        const transaction = db.transaction(['settings'], 'readwrite');
        transaction.objectStore('settings').clear();
        await new Promise((resolve) => transaction.oncomplete = resolve);
    });

    it('should save and retrieve a setting', async () => {
        const key = 'test-key';
        const value = 'test-value';

        await saveSetting(key, value);
        const retrievedValue = await getSetting(key);

        expect(retrievedValue).toBe(value);
    });

    it('should return undefined for a non-existent setting', async () => {
        const value = await getSetting('non-existent');
        expect(value).toBeUndefined();
    });

    it('should handle complex objects as settings', async () => {
        const key = 'user-prefs';
        const value = { theme: 'dark', fontSize: 14 };

        await saveSetting(key, value);
        const retrievedValue = await getSetting(key);

        expect(retrievedValue).toEqual(value);
    });
});
