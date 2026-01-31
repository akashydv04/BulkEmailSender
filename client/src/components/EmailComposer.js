'use client';
import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import 'react-quill-new/dist/quill.snow.css';

// Dynamic import for React Quill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

export default function EmailComposer({ parsedData, onSend }) {
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('<p>I wanted to reach out regarding...</p>');
    const [isSending, setIsSending] = useState(false);

    // Footer State - Defaults cleared to avoid leaking
    const [footer, setFooter] = useState({
        name: 'Akash Yadav',
        company: '',
        designation: '',
        contact: '',
        disclaimer: true
    });

    const [files, setFiles] = useState([]);
    const fileInputRef = useRef(null);

    const previewRecipient = parsedData.validEmails[0] || { name: 'John Doe', email: 'john@example.com', source: 'Example' };
    const previewGreeting = previewRecipient.name ? `Dear ${previewRecipient.name},` : 'Hello,';

    const handleFileChange = (e) => {
        if (e.target.files) {
            setFiles(prev => [...prev, ...Array.from(e.target.files)]);
        }
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSend = async () => {
        if (!subject || !body) return alert('Please fill in all fields');
        setIsSending(true);
        try {
            await onSend({
                recipients: parsedData.validEmails,
                subject,
                body, // Now passing HTML string
                senderDetails: {
                    name: footer.name,
                    company: footer.company,
                    designation: footer.designation,
                    contact: footer.contact,
                    email: 'auth_user_email'
                },
                footer,
                files
            });
        } catch (e) {
            alert('Error sending: ' + e.message);
            setIsSending(false);
        }
    };

    // --- Smart Footer Logic (Frontend Mirror) ---
    const renderFooterPreview = () => {
        // Sanitization: Trim and check boolean
        const sanitize = (val) => val && val.trim().length > 0 ? val.trim() : null;

        const name = sanitize(footer.name);
        const lines = [
            name ? `<strong>${name}</strong>` : null,
            sanitize(footer.designation),
            sanitize(footer.company),
            sanitize(footer.contact)
        ].filter(Boolean);

        if (lines.length === 0 && !footer.disclaimer) return null;

        return (
            <footer style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #eee', fontSize: '0.85rem', color: '#666', lineHeight: '1.4' }}>
                {lines.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                        <p style={{ marginBottom: '4px' }}>Best regards,</p>
                        {lines.map((line, i) => (
                            <div key={i} dangerouslySetInnerHTML={{ __html: line }}></div>
                        ))}
                    </div>
                )}

                {footer.disclaimer && (
                    <p style={{ fontStyle: 'italic', fontSize: '0.75rem', marginTop: '0.5rem', color: '#999' }}>
                        This email is confidential and intended solely for the recipient.
                    </p>
                )}
            </footer>
        );
    };

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 0.9fr)', gap: '2rem' }}>

                {/* Left Column: Editor */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                    <div className="card">
                        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', fontWeight: 700 }}>2. Compose Content</h2>

                        <div style={{ marginBottom: '1rem' }}>
                            <label className="label">Subject Line</label>
                            <input
                                className="input"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                placeholder="Required"
                            />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label className="label">Message Body (Rich Text)</label>
                            <div style={{ background: 'white', color: 'black', borderRadius: '8px', overflow: 'hidden' }}>
                                <ReactQuill
                                    theme="snow"
                                    value={body}
                                    onChange={setBody}
                                    style={{ height: '300px', marginBottom: '50px' }} // mb for toolbar spacing
                                />
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem' }}>
                            <label className="label">Attachments</label>
                            <div style={{ border: '2px dashed var(--border)', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', cursor: 'pointer' }}
                                onClick={() => fileInputRef.current.click()}
                            >
                                <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Click to Upload</span>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>PDF, DOCX, PNG, ZIP (Max 25MB)</p>
                                <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
                            </div>

                            {files.length > 0 && (
                                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {files.map((f, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-hover)', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.9rem' }}>
                                            <span>📎 {f.name}</span>
                                            <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer' }}>✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="card">
                        <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', fontWeight: 600 }}>Footer Configuration</h3>
                        <p className="label" style={{ marginBottom: '1rem' }}>
                            Leave fields blank to automatically exclude them from the email.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label className="label">Full Name</label>
                                <input className="input" value={footer.name} onChange={e => setFooter({ ...footer, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="label">Role / Designation</label>
                                <input className="input" value={footer.designation} onChange={e => setFooter({ ...footer, designation: e.target.value })} />
                            </div>
                            <div>
                                <label className="label">Company</label>
                                <input className="input" value={footer.company} onChange={e => setFooter({ ...footer, company: e.target.value })} />
                            </div>
                            <div>
                                <label className="label">Contact Info</label>
                                <input className="input" value={footer.contact} onChange={e => setFooter({ ...footer, contact: e.target.value })} />
                            </div>
                        </div>
                        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                                type="checkbox"
                                id="disclaimer"
                                checked={footer.disclaimer}
                                onChange={e => setFooter({ ...footer, disclaimer: e.target.checked })}
                            />
                            <label htmlFor="disclaimer" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>Include Confidentiality Disclaimer</label>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="label" style={{ marginBottom: 0 }}>
                            Ready to send to {parsedData.validEmails.length} recipients
                        </span>
                        <button
                            className="btn btn-primary"
                            onClick={handleSend}
                            disabled={isSending}
                        >
                            {isSending ? 'Sending...' : '🚀 Launch Campaign'}
                        </button>
                    </div>
                </div>

                {/* Right Column: Live Preview */}
                <div>
                    <div className="card" style={{ position: 'sticky', top: '5rem', border: '1px solid var(--primary)', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--primary)' }}>
                                Live Preview
                            </h3>
                        </div>

                        <div style={{ background: '#fff', color: '#171717', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', fontFamily: 'Arial, sans-serif' }}>
                            {/* Header Info */}
                            <div style={{ borderBottom: '1px solid #eee', paddingBottom: '1rem', marginBottom: '1rem' }}>
                                <p style={{ fontSize: '0.9rem', color: '#666' }}><strong>To:</strong> {previewRecipient.email}</p>
                                <p style={{ fontSize: '0.9rem', color: '#666' }}><strong>From:</strong> {footer.name} &lt;auth@email.com&gt;</p>
                                <p style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '0.5rem' }}>{subject || '(No Subject)'}</p>
                            </div>

                            {/* Body Content */}
                            <div style={{ lineHeight: '1.6', fontSize: '14px' }}>
                                <p>{previewGreeting}</p>

                                {/* Render HTML Body safely */}
                                <div className="email-body-content" style={{ margin: '1rem 0' }} dangerouslySetInnerHTML={{ __html: body }}></div>

                                {files.length > 0 && (
                                    <div style={{ borderTop: '1px dashed #eee', marginTop: '1rem', paddingTop: '0.5rem' }}>
                                        <p style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#666', marginBottom: '0.5rem' }}>Attached:</p>
                                        {files.map((f, i) => (
                                            <span key={i} style={{ display: 'inline-block', background: '#f1f5f9', fontSize: '0.8rem', padding: '2px 6px', borderRadius: '4px', marginRight: '5px' }}>
                                                📎 {f.name}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Footer */}
                                {renderFooterPreview()}

                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
