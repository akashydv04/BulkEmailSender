'use client';
import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

export default function EmailParser({ onParsed }) {
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    const normalize = (str) =>
        str
            ?.toString()
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '')
            .replace(/[^a-z]/g, '');

    // Auto-detects the real header row by scanning for a cell containing "email"
    const findHeaderRowIndex = (ws) => {
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r; R <= Math.min(range.e.r, 10); R++) {
            for (let C = range.s.c; C <= range.e.c; C++) {
                const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
                if (cell && normalize(cell.v).includes('email')) {
                    return R;
                }
            }
        }
        return 0;
    };

    // Safe wrapper — prevents "onParsed is not a function" crash
    const handleParsed = (result) => {
        if (typeof onParsed === 'function') {
            onParsed(result);
        } else {
            console.error(
                '[EmailParser] onParsed prop is missing or not a function. ' +
                'Make sure you pass onParsed={handleParsed} to <EmailParser />. ' +
                'Parsed result:', result
            );
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        setError(null);

        const reader = new FileReader();

        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const ws = wb.Sheets[wb.SheetNames[0]];

                // Auto-detect real header row (skips title rows)
                const headerRowIndex = findHeaderRowIndex(ws);

                const data = XLSX.utils.sheet_to_json(ws, {
                    defval: '',
                    raw: false,
                    range: headerRowIndex
                });

                if (data.length === 0) {
                    throw new Error("The uploaded file is empty.");
                }

                const headers = Object.keys(data[0]);
                console.log("Detected headers:", headers);

                const normalizeHeader = (str) =>
                    str?.toString().toLowerCase().trim().replace(/[^a-z]/g, '');

                const emailHeader = headers.find(h => normalizeHeader(h) === 'email');
                const subjectHeader = headers.find(h => normalizeHeader(h) === 'subjectline');
                const bodyHeader = headers.find(h => normalizeHeader(h) === 'fullemailbody');
                const companyHeader = headers.find(h => normalizeHeader(h) === 'company');

                if (!emailHeader || !subjectHeader || !bodyHeader) {
                    throw new Error(`Missing required columns! The file must exactly have: "Email", "Subject Line", and "Full Email Body". (Found: ${headers.join(', ')})`);
                }

                const validEmails = [];
                const invalidEmails = [];
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

                data.forEach((row) => {
                    const rawEmail = row[emailHeader];
                    const subjectLine = row[subjectHeader];
                    const fullEmailBody = row[bodyHeader];
                    const company = companyHeader ? row[companyHeader] : '';

                    if (!rawEmail || typeof rawEmail !== 'string') return;
                    
                    // Skip if Subject or Body is empty
                    if (!subjectLine || !fullEmailBody || !subjectLine.toString().trim() || !fullEmailBody.toString().trim()) {
                        invalidEmails.push({ ...row, _reason: 'Missing subject or body' });
                        return;
                    }

                    // Split cells that contain multiple emails (newline, comma, or semicolon)
                    const emailCandidates = rawEmail
                        .split(/[\n,;]+/)
                        .map(e => e.trim())
                        .filter(Boolean);

                    emailCandidates.forEach((candidate) => {
                        if (emailRegex.test(candidate)) {
                            validEmails.push({
                                ...row,
                                email: candidate,
                                subject: subjectLine.toString(),
                                body: fullEmailBody.toString(),
                                company: company ? company.toString() : null,
                                source: 'Excel File'
                            });
                        } else {
                            invalidEmails.push({ ...row, _invalidEmail: candidate });
                        }
                    });
                });

                if (validEmails.length === 0) {
                    throw new Error("No valid emails found in the uploaded file.");
                }

                const preview = validEmails.slice(0, 5).map(r => ({
                    email: r.email,
                    name: r.name,
                    source: r.source,
                    greeting: r.name ? `Dear ${r.name},` : 'Hello,'
                }));

                handleParsed({
                    totalParsed: validEmails.length + invalidEmails.length,
                    validCount: validEmails.length,
                    invalidCount: invalidEmails.length,
                    validEmails,
                    invalidEmails,
                    previewSample: preview
                });

            } catch (err) {
                console.error(err);
                setError(
                    err.message ||
                    "Failed to parse the file. Please ensure it is a valid Excel or CSV."
                );
            } finally {
                setLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };

        reader.onerror = () => {
            setError("Failed to read the file.");
            setLoading(false);
        };

        reader.readAsBinaryString(file);
    };

    const handleParseText = async () => {
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
                handleParsed(data);
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
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', fontWeight: 700 }}>
                1. Add Recipients
            </h2>

            <div style={{ marginBottom: '2rem' }}>
                <p className="label">Option 1: Upload Excel or CSV</p>
                <div
                    style={{
                        border: '2px dashed var(--border)',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        textAlign: 'center',
                        cursor: 'pointer'
                    }}
                    onClick={() => fileInputRef.current.click()}
                >
                    <span style={{ color: 'var(--primary)', fontWeight: 600 }}>
                        Click to Upload File (.xlsx, .csv)
                    </span>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Must include an Email column (e.g. Email, Email Address)
                    </p>

                    <input
                        type="file"
                        accept=".xlsx, .xls, .csv"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                    />
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', margin: '1rem 0' }}>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
                <span style={{ padding: '0 1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    OR
                </span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }}></div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
                <p className="label">Option 2: Paste Raw Emails</p>
                <textarea
                    className="input"
                    style={{ minHeight: '150px', marginBottom: '1rem' }}
                    placeholder="e.g. akash.yadav@company.com, hr@startup.io"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                />
            </div>

            {error && (
                <p style={{ color: 'var(--error)', marginBottom: '1rem' }}>
                    {error}
                </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    className="btn btn-primary"
                    onClick={handleParseText}
                    disabled={loading || !input.trim()}
                >
                    {loading ? 'Processing...' : 'Next: Compose Email'}
                </button>
            </div>
        </div>
    );
}