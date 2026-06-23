import { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Lock, ExternalLink } from 'lucide-react';
import styles from './SettingsModal.module.css';

export default function SettingsModal({
    isOpen,
    onClose,
    serverEndpoints = [], // Read-only endpoints from server (except API key)
    userEndpoints = [],   // Editable user endpoints
    serverEndpointApiKeys = {}, // API keys for server endpoints (stored locally)
    userColor: initialUserColor,
    onSave
}) {
    const [localUserEndpoints, setLocalUserEndpoints] = useState(userEndpoints);
    const [localServerApiKeys, setLocalServerApiKeys] = useState(serverEndpointApiKeys);
    const [userColor, setUserColor] = useState(initialUserColor || '#374151');
    const [showApiKey, setShowApiKey] = useState({});

    useEffect(() => {
        setLocalUserEndpoints(userEndpoints);
        setLocalServerApiKeys(serverEndpointApiKeys);
        setUserColor(initialUserColor || '#374151');
    }, [userEndpoints, serverEndpointApiKeys, initialUserColor, isOpen]);

    if (!isOpen) return null;

    const handleAddEndpoint = () => {
        const newEndpoint = {
            id: Date.now().toString(),
            name: 'New Endpoint',
            baseUrl: 'https://api.openai.com/v1',
            modelName: 'gpt-3.5-turbo',
            apiKey: '',
            extraParams: []
        };
        setLocalUserEndpoints([...localUserEndpoints, newEndpoint]);
    };

    const handleRemoveEndpoint = (id) => {
        setLocalUserEndpoints(localUserEndpoints.filter(ep => ep.id !== id));
    };

    const handleUpdateEndpoint = (id, field, value) => {
        setLocalUserEndpoints(localUserEndpoints.map(ep =>
            ep.id === id ? { ...ep, [field]: value } : ep
        ));
    };

    const handleUpdateServerApiKey = (endpointId, value) => {
        setLocalServerApiKeys(prev => ({
            ...prev,
            [endpointId]: value
        }));
    };

    const handleAddExtraParam = (endpointId) => {
        setLocalUserEndpoints(localUserEndpoints.map(ep => {
            if (ep.id === endpointId) {
                const extraParams = ep.extraParams || [];
                return { ...ep, extraParams: [...extraParams, { key: '', value: '' }] };
            }
            return ep;
        }));
    };

    const handleUpdateExtraParam = (endpointId, paramIndex, field, value) => {
        setLocalUserEndpoints(localUserEndpoints.map(ep => {
            if (ep.id === endpointId) {
                const extraParams = [...(ep.extraParams || [])];
                extraParams[paramIndex] = { ...extraParams[paramIndex], [field]: value };
                return { ...ep, extraParams };
            }
            return ep;
        }));
    };

    const handleRemoveExtraParam = (endpointId, paramIndex) => {
        setLocalUserEndpoints(localUserEndpoints.map(ep => {
            if (ep.id === endpointId) {
                const extraParams = (ep.extraParams || []).filter((_, idx) => idx !== paramIndex);
                return { ...ep, extraParams };
            }
            return ep;
        }));
    };

    // Render a server endpoint card - mostly read-only except API key
    const renderServerEndpointCard = (endpoint) => (
        <div key={endpoint.id} className={`${styles.endpointCard} ${styles.serverCard}`}>
            <div className={styles.endpointHeader}>
                <div className={styles.endpointNameDisplay}>
                    <span>{endpoint.name}</span>
                </div>
            </div>

            <div className={styles.endpointFields}>
                <div className={styles.fieldGroup}>
                    <label>Model</label>
                    <input
                        className={styles.input}
                        value={endpoint.modelName}
                        disabled
                    />
                </div>
                <div className={styles.fieldGroup}>
                    <label>
                        API Key
                        <a
                            href="https://platform.inceptionlabs.ai/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.getKeyLink}
                        >
                            Get Mercury API Key <ExternalLink size={12} />
                        </a>
                    </label>
                    <div className={styles.inputWithButton}>
                        <input
                            className={styles.input}
                            type={showApiKey[endpoint.id] ? "text" : "password"}
                            value={localServerApiKeys[endpoint.id] || ''}
                            onChange={(e) => handleUpdateServerApiKey(endpoint.id, e.target.value)}
                            placeholder="Enter your API key..."
                        />
                        <button
                            type="button"
                            className={styles.toggleBtn}
                            onClick={() => setShowApiKey(prev => ({ ...prev, [endpoint.id]: !prev[endpoint.id] }))}
                            title={showApiKey[endpoint.id] ? "Hide API Key" : "Show API Key"}
                        >
                            {showApiKey[endpoint.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    // Render a user endpoint card - fully editable
    const renderUserEndpointCard = (endpoint) => (
        <div key={endpoint.id} className={styles.endpointCard}>
            <div className={styles.endpointHeader}>
                <input
                    className={styles.endpointNameInput}
                    value={endpoint.name}
                    onChange={(e) => handleUpdateEndpoint(endpoint.id, 'name', e.target.value)}
                    placeholder="Endpoint Name"
                />
                <button
                    onClick={() => handleRemoveEndpoint(endpoint.id)}
                    className={styles.removeBtn}
                    title="Remove Endpoint"
                >
                    <X size={16} />
                </button>
            </div>

            <div className={styles.endpointFields}>
                <div className={styles.fieldGroup}>
                    <label>Base URL</label>
                    <input
                        className={styles.input}
                        value={endpoint.baseUrl}
                        onChange={(e) => handleUpdateEndpoint(endpoint.id, 'baseUrl', e.target.value)}
                        placeholder="https://api.openai.com/v1"
                    />
                </div>
                <div className={styles.fieldGroup}>
                    <label>Model Name</label>
                    <input
                        className={styles.input}
                        value={endpoint.modelName}
                        onChange={(e) => handleUpdateEndpoint(endpoint.id, 'modelName', e.target.value)}
                        placeholder="gpt-4"
                    />
                </div>
                <div className={styles.fieldGroup}>
                    <label>API Key</label>
                    <div className={styles.inputWithButton}>
                        <input
                            className={styles.input}
                            type={showApiKey[endpoint.id] ? "text" : "password"}
                            value={endpoint.apiKey}
                            onChange={(e) => handleUpdateEndpoint(endpoint.id, 'apiKey', e.target.value)}
                            placeholder="sk-..."
                        />
                        <button
                            type="button"
                            className={styles.toggleBtn}
                            onClick={() => setShowApiKey(prev => ({ ...prev, [endpoint.id]: !prev[endpoint.id] }))}
                            title={showApiKey[endpoint.id] ? "Hide API Key" : "Show API Key"}
                        >
                            {showApiKey[endpoint.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </div>

                <div className={styles.fieldGroup}>
                    <div className={styles.extraParamsHeader}>
                        <label>Extra Body Parameters</label>
                        <button
                            onClick={() => handleAddExtraParam(endpoint.id)}
                            className={styles.addParamBtn}
                            type="button"
                        >
                            + Add Parameter
                        </button>
                    </div>
                    {(endpoint.extraParams || []).map((param, idx) => (
                        <div key={idx} className={styles.paramRow}>
                            <input
                                className={styles.paramInput}
                                value={param.key}
                                onChange={(e) => handleUpdateExtraParam(endpoint.id, idx, 'key', e.target.value)}
                                placeholder="Key"
                            />
                            <input
                                className={styles.paramInput}
                                value={param.value}
                                onChange={(e) => handleUpdateExtraParam(endpoint.id, idx, 'value', e.target.value)}
                                placeholder='Value (string, number, or JSON)'
                            />
                            <button
                                onClick={() => handleRemoveExtraParam(endpoint.id, idx)}
                                className={styles.removeParamBtn}
                                title="Remove Parameter"
                                type="button"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h2>Settings</h2>
                    <button onClick={onClose} className={styles.closeBtn}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.content}>
                    {/* Server Endpoints - API key editable */}
                    {serverEndpoints.length > 0 && (
                        <div className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <h3>Mercury Models</h3>
                            </div>
                            <div className={styles.endpointsList}>
                                {serverEndpoints.map(endpoint => renderServerEndpointCard(endpoint))}
                            </div>
                        </div>
                    )}

                    {/* User Endpoints - Fully Editable */}
                    <div className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h3>Custom Endpoints</h3>
                            <button onClick={handleAddEndpoint} className={styles.addBtn}>
                                + Add Endpoint
                            </button>
                        </div>

                        <div className={styles.endpointsList}>
                            {localUserEndpoints.length === 0 ? (
                                <p className={styles.emptyState}>
                                    No custom endpoints. Click "+ Add Endpoint" to add your own.
                                </p>
                            ) : (
                                localUserEndpoints.map(endpoint => renderUserEndpointCard(endpoint))
                            )}
                        </div>
                    </div>

                    <div className={styles.section}>
                        <h3>Appearance</h3>
                        <div className={styles.fieldGroup}>
                            <label>User Message Color</label>
                            <div className={styles.colorGrid}>
                                {[
                                    { color: '#374151', name: 'Dark Gray' },
                                    { color: '#2563eb', name: 'Blue' },
                                    { color: '#9333ea', name: 'Purple' },
                                    { color: '#16a34a', name: 'Green' },
                                    { color: '#dc2626', name: 'Red' },
                                    { color: '#ea580c', name: 'Orange' },
                                    { color: '#0d9488', name: 'Teal' },
                                    { color: '#db2777', name: 'Pink' },
                                    { color: '#4f46e5', name: 'Indigo' }
                                ].map((swatch) => (
                                    <button
                                        key={swatch.color}
                                        className={`${styles.colorSwatch} ${userColor === swatch.color ? styles.selectedSwatch : ''}`}
                                        style={{ backgroundColor: swatch.color }}
                                        onClick={() => setUserColor(swatch.color)}
                                        title={swatch.name}
                                        type="button"
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.footer}>
                    <button onClick={onClose} className={styles.cancelBtn}>
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            onSave({
                                userEndpoints: localUserEndpoints,
                                serverEndpointApiKeys: localServerApiKeys,
                                userColor
                            });
                            onClose();
                        }}
                        className={styles.saveBtn}
                    >
                        Save Changes
                    </button>
                </div>
            </div >
        </div >
    );
}
