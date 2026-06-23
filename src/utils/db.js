/**
 * IndexedDB wrapper for chat application storage
 * Provides a simple API for storing chats and settings
 */

const DB_NAME = 'llm-chat-db';
const DB_VERSION = 1;
const CHATS_STORE = 'chats';
const SETTINGS_STORE = 'settings';

let dbInstance = null;

/**
 * Initialize the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
export function initDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            reject(new Error('Failed to open IndexedDB'));
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Create chats object store if it doesn't exist
            if (!db.objectStoreNames.contains(CHATS_STORE)) {
                db.createObjectStore(CHATS_STORE, { keyPath: 'id' });
            }

            // Create settings object store if it doesn't exist
            if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                db.createObjectStore(SETTINGS_STORE);
            }
        };
    });
}

/**
 * Get all chats from the database
 * @returns {Promise<Array>}
 */
export async function getAllChats() {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CHATS_STORE], 'readonly');
        const store = transaction.objectStore(CHATS_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
            resolve(request.result || []);
        };

        request.onerror = () => {
            reject(new Error('Failed to get chats'));
        };
    });
}

/**
 * Save all chats to the database
 * @param {Array} chats - Array of chat objects
 * @returns {Promise<void>}
 */
export async function saveChats(chats) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CHATS_STORE], 'readwrite');
        const store = transaction.objectStore(CHATS_STORE);

        // Clear existing chats
        store.clear();

        // Add all chats
        chats.forEach(chat => {
            store.put(chat);
        });

        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onerror = () => {
            reject(new Error('Failed to save chats'));
        };
    });
}

/**
 * Get a setting from the database
 * @param {string} key - Setting key
 * @returns {Promise<any>}
 */
export async function getSetting(key) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SETTINGS_STORE], 'readonly');
        const store = transaction.objectStore(SETTINGS_STORE);
        const request = store.get(key);

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(new Error(`Failed to get setting: ${key}`));
        };
    });
}

/**
 * Save a setting to the database
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 * @returns {Promise<void>}
 */
export async function saveSetting(key, value) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
        const store = transaction.objectStore(SETTINGS_STORE);
        const request = store.put(value, key);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(new Error(`Failed to save setting: ${key}`));
        };
    });
}

/**
 * Migrate data from localStorage to IndexedDB
 * This is a one-time operation that runs on first load
 * @returns {Promise<boolean>} - Returns true if migration was performed
 */
export async function migrateFromLocalStorage() {
    try {
        // Check if we've already migrated
        const migrated = await getSetting('migrated-from-localstorage');
        if (migrated) {
            return false;
        }

        console.log('Starting migration from localStorage to IndexedDB...');

        // Migrate chats
        const savedChats = localStorage.getItem('llm-chats');
        if (savedChats) {
            const chats = JSON.parse(savedChats);
            await saveChats(chats);
            console.log(`Migrated ${chats.length} chats`);
        }

        // Migrate settings
        const settingsToMigrate = [
            'llm-system-prompt',
            'llm-endpoints',
            'llm-selected-endpoint-id',
            'llm-user-color'
        ];

        for (const key of settingsToMigrate) {
            const value = localStorage.getItem(key);
            if (value !== null) {
                await saveSetting(key, value);
                console.log(`Migrated setting: ${key}`);
            }
        }

        // Mark migration as complete
        await saveSetting('migrated-from-localstorage', true);
        console.log('Migration complete!');

        return true;
    } catch (error) {
        console.error('Migration failed:', error);
        return false;
    }
}
