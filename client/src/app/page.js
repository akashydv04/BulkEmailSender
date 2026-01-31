'use client';
import { useState } from 'react';
import SmtpConfig from '../components/SmtpConfig';
import EmailParser from '../components/EmailParser';
import EmailComposer from '../components/EmailComposer';
import StatusDashboard from '../components/StatusDashboard';

export default function Home() {
  const [step, setStep] = useState(0);
  const [parsedData, setParsedData] = useState(null);
  const [campaignId, setCampaignId] = useState(null);
  const [configuredEmail, setConfiguredEmail] = useState('');

  const handleConfigured = (email) => {
    setConfiguredEmail(email);
    setStep(1);
  };

  const handleParsed = (data) => {
    setParsedData(data);
    setStep(2);
  };

  const handleSend = async (campaignPayload) => {
    // Convert to FormData for multipart upload
    const formData = new FormData();
    formData.append('recipients', JSON.stringify(campaignPayload.recipients));
    formData.append('subject', campaignPayload.subject);
    formData.append('body', campaignPayload.body);
    formData.append('senderDetails', JSON.stringify(campaignPayload.senderDetails));
    formData.append('footer', JSON.stringify(campaignPayload.footer));

    if (campaignPayload.files) {
      campaignPayload.files.forEach(file => {
        formData.append('attachments', file);
      });
    }

    const res = await fetch('http://localhost:5001/api/send-campaign', {
      method: 'POST',
      body: formData // No Content-Type header; fetch sets it with boundary
    });

    if (res.ok) {
      const data = await res.json();
      setCampaignId(data.campaignId);
      setStep(3);
    } else {
      const err = await res.json();
      throw new Error(err.error || 'Failed to start campaign');
    }
  };

  const handleReset = () => {
    setStep(1);
    setParsedData(null);
    setCampaignId(null);
  };

  const handleLogout = () => {
    setStep(0);
    setConfiguredEmail('');
  };

  return (
    <main style={{ minHeight: '100vh', paddingBottom: '4rem' }}>
      {/* Navbar */}
      <nav style={{
        borderBottom: '1px solid var(--border)',
        background: 'rgba(255,255,255,0)',
        backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 10,
        padding: '1rem 0'
      }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: 32, height: 32, background: 'var(--primary)', borderRadius: '8px' }}></div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>SenderPortal</h1>
          </div>

          {step > 0 && (
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '2rem' }}>
                <span style={{ fontWeight: step === 1 ? 700 : 400, opacity: step === 1 ? 1 : 0.5 }}>1. Recipients</span>
                <span style={{ fontWeight: step === 2 ? 700 : 400, opacity: step === 2 ? 1 : 0.5 }}>2. Compose</span>
                <span style={{ fontWeight: step === 3 ? 700 : 400, opacity: step === 3 ? 1 : 0.5 }}>3. Status</span>
              </div>
              <div style={{ width: '1px', height: '20px', background: 'var(--border)' }}></div>
              <button onClick={handleLogout} className="btn" style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}>
                {configuredEmail === 'mock@mode' ? 'Mock Mode' : configuredEmail} (Change)
              </button>
            </div>
          )}
        </div>
      </nav>

      <div className="container" style={{ marginTop: '3rem' }}>
        {step === 0 && <SmtpConfig onConfigured={handleConfigured} />}
        {step === 1 && <EmailParser onParsed={handleParsed} />}
        {step === 2 && <EmailComposer parsedData={parsedData} onSend={handleSend} />}
        {step === 3 && <StatusDashboard campaignId={campaignId} onReset={handleReset} />}
      </div>
    </main>
  );
}
