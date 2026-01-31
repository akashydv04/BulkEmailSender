'use client';
import { useState } from 'react';

export default function SmtpConfig({ onConfigured }) {
    // Pre-filling as per user request for easy restart, but editable
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        if (!email || !password) {
            setError('Both fields are required');
            return;
        }

        setError(null);
        setLoading(true);

        try {
            const res = await fetch('http://localhost:5001/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (res.ok) {
                onConfigured(email);
            } else {
                setError(data.error || 'Failed to save configuration');
            }
        } catch (e) {
            console.error(e);
            setError('Failed to connect to server. Is backend running?');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '500px', margin: '4rem auto' }} className="card animate-fade-in">
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>Welcome to SenderPortal</h1>
                <p style={{ color: 'var(--text-muted)' }}>Configure your email provider to start sending.</p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
                <label className="label">Gmail Address</label>
                <input
                    className="input"
                    placeholder="e.g. yourname@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
                <label className="label">App Password</label>
                <input
                    type="password"
                    className="input"
                    placeholder="e.g. ajgg ukcu uioa gufr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    Use an App Password, not your login password.
                    <a href="https://myaccount.google.com/apppasswords" target="_blank" style={{ color: 'var(--primary)', marginLeft: '4px' }}>Get one here</a>.
                </p>
            </div>

            {error && (
                <div style={{ padding: '0.75rem', background: '#fef2f2', color: 'var(--error)', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                    {error}
                </div>
            )}

            <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={handleSave}
                disabled={loading}
            >
                {loading ? 'Verifying...' : 'Connect & Start'}
            </button>

            <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                <button className="btn" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }} onClick={() => onConfigured('mock@mode')}>
                    Skip (Use Mock Sender)
                </button>
            </div>
        </div>
    );
}
