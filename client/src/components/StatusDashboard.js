"use client";
import { useState, useEffect } from "react";

export default function StatusDashboard({ campaignId, onReset }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!campaignId) return;

    const fetchStatus = async () => {
      try {
        const apiBaseUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";
        const res = await fetch(`${apiBaseUrl}/campaign-status/${campaignId}`);
        const data = await res.json();
        setStats(data);
      } catch (e) {
        console.error("Failed to poll status");
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);

    return () => clearInterval(interval);
  }, [campaignId]);

  if (!stats) return <div className="card">Loading status...</div>;

  const progress = Math.round(((stats.sent + stats.failed) / stats.total) * 100);

  const downloadFailureLog = () => {
    if (!stats || !stats.recipients) return;
    const failedRecipients = stats.recipients.filter((r) => r.status === "failed");
    if (failedRecipients.length === 0) return alert("No failures to log!");

    let csvContent = "data:text/csv;charset=utf-8,Email,Status\n";
    failedRecipients.forEach((r) => {
      csvContent += `${r.email},Failed\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `failed_emails_${campaignId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="card animate-fade-in"
      style={{ textAlign: "center", padding: "4rem 2rem" }}
    >
      <h2 style={{ fontSize: "2rem", marginBottom: "1rem" }}>
        Campaign Sent! 🚀
      </h2>
      <p style={{ color: "var(--text-muted)", marginBottom: "3rem" }}>
        Your emails are being dispatched by our queue engine.
      </p>

      <div
        style={{
          background: "var(--surface-hover)",
          height: "20px",
          borderRadius: "99px",
          overflow: "hidden",
          marginBottom: "2rem",
          maxWidth: "600px",
          margin: "0 auto 2rem auto",
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            background: "var(--success)",
            height: "100%",
            transition: "width 0.5s ease",
          }}
        ></div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "2rem",
          maxWidth: "800px",
          margin: "0 auto",
        }}
      >
        <div className="card" style={{ padding: "1.5rem" }}>
          <div
            style={{
              fontSize: "2.5rem",
              fontWeight: 800,
              color: "var(--primary)",
            }}
          >
            {stats.total}
          </div>
          <div className="label">Total Recipients</div>
        </div>
        <div className="card" style={{ padding: "1.5rem" }}>
          <div
            style={{
              fontSize: "2.5rem",
              fontWeight: 800,
              color: "var(--success)",
            }}
          >
            {stats.sent}
          </div>
          <div className="label">Successfully Sent</div>
        </div>
        <div className="card" style={{ padding: "1.5rem" }}>
          <div
            style={{
              fontSize: "2.5rem",
              fontWeight: 800,
              color: "var(--error)",
            }}
          >
            {stats.failed}
          </div>
          <div className="label">Failed / Bounced</div>
        </div>
      </div>

      <div style={{ marginTop: "4rem" }}>
        {stats.status === "completed" ? (
          <div
            style={{ display: "flex", gap: "1rem", justifyContent: "center" }}
          >
            <button className="btn btn-secondary" onClick={onReset}>
              Start New Campaign
            </button>
            {stats.failed > 0 && (
              <button
                className="btn"
                style={{ background: "var(--error)", color: "white" }}
                onClick={downloadFailureLog}
              >
                📥 Download Failure Log
              </button>
            )}
          </div>
        ) : (
          <p className="label animate-pulse">Sending in progress...</p>
        )}
      </div>
    </div>
  );
}
