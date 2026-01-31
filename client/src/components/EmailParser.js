'use client';
import { useState } from 'react';

export default function EmailParser({ onParsed }) {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleParse = async () => {
        if (!input.trim()) return;
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('http://localhost:5001/api/parse-emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rawEmails: input })
            });

            const data = await res.json();
            if (res.ok) {
                onParsed(data);
            } else {
                setError(data.error || 'Failed to parse');
            }
        } catch (err) {
            setError('Connection error. Is the backend running?');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card animate-fade-in">
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', fontWeight: 700 }}>1. Add Recipients</h2>
            <p className="label">Enter emails separated by commas, spaces, or newlines.</p>

            <textarea
                className="input"
                style={{ minHeight: '150px', marginBottom: '1rem' }}
                placeholder="e.g. akash.yadav@company.com, hr@startup.io"
                value={input}
                onChange={(e) => setInput(e.target.value)}
            />

            {/* Feature Highlight */}
            <div style={{ padding: '0.75rem', background: 'var(--surface-hover)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                ℹ️ <strong>Smart Detection:</strong> We'll automatically find names using Gravatar and email patterns.
            </div>

            {error && <p style={{ color: 'var(--error)', marginBottom: '1rem' }}>{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    className="btn btn-primary"
                    onClick={handleParse}
                    disabled={loading || !input.trim()}
                >
                    {loading ? 'Analyzing List...' : 'Next: Compose Email'}
                </button>
            </div>
        </div>
    );
}
