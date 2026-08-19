'use client';
import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import 'react-quill-new/dist/quill.snow.css';

// Dynamic import for React Quill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

function replacePlaceholders(text, rowData) {
    if (!text) return text;
    return text.replace(/\{([^}]+)\}/g, (match, key) => {
        const lowerKey = key.trim().toLowerCase();
        // Find matching key in rowData ignoring case
        const actualKey = Object.keys(rowData).find(k => k.toLowerCase() === lowerKey);
        if (actualKey && rowData[actualKey]) return rowData[actualKey];
        // Fallbacks
        if (lowerKey === 'name') return 'Hiring Team';
        if (lowerKey === 'company') return 'your company';
        if (lowerKey === 'role') return 'the open role';
        return '';
    });
}

function formatBody(rawBody) {
    if (!rawBody) return '';
    let clean = rawBody.trim();
    // Reduce multiple blank lines
    clean = clean.replace(/\n\s*\n\s*\n/g, '\n\n');
    const hasGreeting = /^(dear|hi|hello)\s/i.test(clean);
    
    let finalBody = clean;
    if (!hasGreeting) {
        finalBody = `Dear Hiring Team,\n\n${clean}`;
    }
    // Convert newlines to breaks
    return finalBody.replace(/\n/g, '<br/>');
}

export default function EmailComposer({ parsedData, onSend }) {
    const [subject, setSubject] = useState('Application for {Role} at {Company}');
    const [body, setBody] = useState('<p>Dear {Name},</p><p>I am reaching out regarding opportunities at {Company} for the {Role} position.</p><p>{CustomMessage}</p><p>Please find my resume attached.</p>');
    const [isSending, setIsSending] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const resumeInputRef = useRef(null);

    const handleResumeUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            return alert('Please upload a PDF file.');
        }

        setIsGenerating(true);
        const formData = new FormData();
        formData.append('resume', file);

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
            const res = await fetch(`${apiUrl}/generate-email`, {
                method: 'POST',
                body: formData
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to generate email');

            if (data.subject) setSubject(data.subject);
            if (data.body) setBody(data.body);
            
            if (data.designation) {
                setFooter(prev => ({ ...prev, designation: data.designation }));
            }
        } catch (error) {
            alert('Error generating email: ' + error.message);
        } finally {
            setIsGenerating(false);
            e.target.value = ''; // Reset input
        }
    };
    // If the data already has native body/subject
    const isExcelConfigured = parsedData.validEmails.length > 0 && parsedData.validEmails[0].subject !== undefined;
    const maxPreviews = Math.min(parsedData.validEmails.length, 3);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [includeFooter, setIncludeFooter] = useState(true);

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

    const previewRecipient = parsedData.validEmails[previewIndex] || { 
        name: 'John Doe', 
        email: 'john@example.com', 
        source: 'Example',
        role: 'Software Engineer',
        company: 'Tech Corp',
        custommessage: 'I love your product!' 
    };
    
    // Apply dynamic placeholder replacement for Live Preview
    const previewSubject = isExcelConfigured 
        ? replacePlaceholders(previewRecipient.subject, previewRecipient) 
        : replacePlaceholders(subject, previewRecipient);
        
    const previewBody = isExcelConfigured 
        ? formatBody(replacePlaceholders(previewRecipient.body, previewRecipient)) 
        : replacePlaceholders(body, previewRecipient);

    const handleFileChange = (e) => {
        if (e.target.files) {
            setFiles(prev => [...prev, ...Array.from(e.target.files)]);
        }
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSend = async () => {
        if (!isExcelConfigured && (!subject || !body)) return alert('Please fill in all fields');
        setIsSending(true);
        try {
            await onSend({
                recipients: parsedData.validEmails,
                subject: isExcelConfigured ? 'Excel Configured' : subject,
                body: isExcelConfigured ? 'Excel Configured' : body, // Now passing HTML string
                senderDetails: {
                    name: footer.name,
                    company: footer.company,
                    designation: footer.designation,
                    contact: footer.contact,
                    email: 'auth_user_email'
                },
                footer: (!includeFooter) ? {} : footer,
                files
            });
        } catch (e) {
            alert('Error sending: ' + e.message);
            setIsSending(false);
        }
    };

    // --- Smart Footer Logic (Frontend Mirror) ---
    const renderFooterPreview = () => {
        if (!includeFooter) return null;

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

                        {isExcelConfigured ? (
                            <div style={{ padding: '2rem', background: 'var(--surface-hover)', borderRadius: '8px', textAlign: 'center' }}>
                                <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '1rem' }}>📄</span>
                                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>Templates Loaded from Excel</h3>
                                <p className="label">Each recipient will receive their dynamically mapped Subject Line and Full Email Body.</p>
                            </div>
                        ) : (
                            <>
                                <div style={{ marginBottom: '1.5rem', padding: '1.5rem', background: 'var(--surface-hover)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--primary)' }}>✨ Auto-Generate with AI</h3>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Upload your resume (PDF) to dynamically generate a highly professional and tailored email draft based on your profile.</p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <button 
                                            className="btn btn-secondary"
                                            onClick={() => resumeInputRef.current?.click()}
                                            disabled={isGenerating}
                                        >
                                            {isGenerating ? 'Scanning Resume...' : '📄 Upload Resume'}
                                        </button>
                                        {isGenerating && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', background: 'rgba(0, 112, 243, 0.05)', borderRadius: '8px', border: '1px solid rgba(0, 112, 243, 0.2)' }}>
                                                <style>{`
                                                    @keyframes generateSpin { 100% { transform: rotate(360deg); } }
                                                    @keyframes generatePulse { 50% { opacity: 0.5; } }
                                                `}</style>
                                                <svg style={{ animation: 'generateSpin 1s linear infinite', width: '20px', height: '20px', color: 'var(--primary, #0070f3)' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25"></circle>
                                                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                <span style={{ fontSize: '0.9rem', color: 'var(--primary, #0070f3)', fontWeight: 600, animation: 'generatePulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
                                                    Scanning & tailoring email with AI...
                                                </span>
                                            </div>
                                        )}
                                        <input type="file" accept="application/pdf" ref={resumeInputRef} style={{ display: 'none' }} onChange={handleResumeUpload} />
                                    </div>
                                </div>

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
                            </>
                        )}

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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>Footer Configuration</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input
                                    type="checkbox"
                                    id="includeFooter"
                                    checked={includeFooter}
                                    onChange={e => setIncludeFooter(e.target.checked)}
                                />
                                <label htmlFor="includeFooter" style={{ fontSize: '0.9rem', cursor: 'pointer', margin: 0 }}>
                                    Append Auto-Footer
                                </label>
                            </div>
                        </div>
                        
                        {includeFooter ? (
                            <>
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
                            </>
                        ) : (
                            <p className="label" style={{ margin: 0 }}>
                                Footer is disabled. Toggle the switch above to enable it.
                            </p>
                        )}
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
                                Live Preview {isExcelConfigured && `(${previewIndex + 1}/${maxPreviews})`}
                            </h3>
                            {isExcelConfigured && (
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button 
                                        className="btn btn-secondary" 
                                        style={{ padding: '0.2rem 0.5rem', fontSize: '12px' }} 
                                        disabled={previewIndex === 0} 
                                        onClick={() => setPreviewIndex((prev) => Math.max(prev - 1, 0))}
                                    >◀ Prev</button>
                                    <button 
                                        className="btn btn-secondary" 
                                        style={{ padding: '0.2rem 0.5rem', fontSize: '12px' }} 
                                        disabled={previewIndex >= maxPreviews - 1} 
                                        onClick={() => setPreviewIndex((prev) => Math.min(prev + 1, maxPreviews - 1))}
                                    >Next ▶</button>
                                </div>
                            )}
                        </div>

                        <div style={{ background: '#fff', color: '#171717', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', fontFamily: 'Arial, sans-serif' }}>
                            {/* Header Info */}
                            <div style={{ borderBottom: '1px solid #eee', paddingBottom: '1rem', marginBottom: '1rem' }}>
                                <p style={{ fontSize: '0.9rem', color: '#666' }}><strong>To:</strong> {previewRecipient.email}</p>
                                <p style={{ fontSize: '0.9rem', color: '#666' }}><strong>From:</strong> {footer.name} &lt;auth@email.com&gt;</p>
                                <p style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '0.5rem' }}>{previewSubject || '(No Subject)'}</p>
                            </div>

                            {/* Body Content */}
                            <div style={{ lineHeight: '1.6', fontSize: '14px' }}>

                                {/* Render HTML Body safely */}
                                <div className="email-body-content" style={{ margin: '1rem 0' }} dangerouslySetInnerHTML={{ __html: previewBody }}></div>

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
