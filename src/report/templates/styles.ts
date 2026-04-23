/**
 * Report output CSS — ported from cc-dashboard/app/globals.css design system.
 *
 * Constraints:
 *   - Email-safe: no OKLCH (poor Gmail/Outlook support), hex + rgba only.
 *   - DOCX-stable: no custom properties; values inlined where possible so docx-lib
 *     can faithfully render them.
 *   - Print-friendly: avoid position:fixed/sticky, use explicit sizes, no scripts.
 *
 * Brand tokens sourced from cc-dashboard (ink-on-cream base, muted-green accent,
 * Inter + JetBrains Mono typography).
 */
export const REPORT_CSS = `
  body {
    font-family: 'Inter', 'Calibri', 'Helvetica', 'Arial', sans-serif;
    color: #1b2220;
    margin: 0;
    padding: 0;
    background: #f4f1eb;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    letter-spacing: -0.005em;
  }
  .page {
    background: #ffffff;
    max-width: 820px;
    margin: 24px auto;
    padding: 56px 64px;
    box-shadow: 0 1px 4px rgba(27, 34, 32, 0.06);
    border: 1px solid rgba(27, 34, 32, 0.06);
  }

  /* ── Typography ──────────────────────────────────────────── */
  h1 {
    font-size: 32px;
    font-weight: 400;
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: #1b2220;
    margin: 0 0 10px 0;
  }
  h2 {
    font-size: 20px;
    font-weight: 500;
    color: #1b2220;
    margin: 32px 0 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(27, 34, 32, 0.1);
    letter-spacing: -0.01em;
  }
  h3 {
    font-size: 15px;
    font-weight: 500;
    color: #1b2220;
    margin: 22px 0 8px;
    letter-spacing: -0.005em;
  }
  h4 {
    font-size: 13px;
    font-weight: 500;
    color: #525e58;
    margin: 14px 0 6px;
    letter-spacing: -0.005em;
  }
  p { line-height: 1.55; margin: 0 0 10px; font-size: 13.5px; color: #1b2220; }
  ul { padding-left: 20px; }
  ul.outline li { margin-bottom: 14px; font-size: 13.5px; line-height: 1.55; color: #1b2220; }
  em { font-style: italic; color: #45685b; }

  /* ── Cover block ─────────────────────────────────────────── */
  .cover {
    text-align: center;
    padding: 60px 0 44px;
    border-bottom: 2px solid #45685b;
    margin-bottom: 32px;
  }
  .cover h1 { letter-spacing: -0.025em; }
  .cover-meta {
    display: inline-block;
    text-align: left;
    margin-top: 28px;
    font-size: 13px;
    color: #1b2220;
  }
  .cover-meta dt {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-weight: 500;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #808a86;
    margin-top: 10px;
  }
  .cover-meta dd { margin: 2px 0 0 0; font-size: 13px; color: #1b2220; }
  .cover-meta dl { margin: 0; }

  /* ── TOC ─────────────────────────────────────────────────── */
  .toc { margin: 20px 0 32px; font-size: 13px; color: #525e58; }
  .toc ol { padding-left: 22px; }
  .toc li { margin-bottom: 4px; }

  /* ── Tables ──────────────────────────────────────────────── */
  table {
    border-collapse: separate;
    border-spacing: 0;
    width: 100%;
    margin: 12px 0 22px;
    font-size: 12.5px;
    border: 1px solid rgba(27, 34, 32, 0.1);
    border-radius: 10px;
    overflow: hidden;
  }
  table th {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #808a86;
    text-align: left;
    padding: 12px 14px;
    background: #f4f1eb;
    border-bottom: 1px solid rgba(27, 34, 32, 0.1);
    vertical-align: top;
  }
  table td {
    padding: 12px 14px;
    border-bottom: 1px solid rgba(27, 34, 32, 0.06);
    text-align: left;
    vertical-align: top;
    color: #1b2220;
  }
  table tr:last-child td { border-bottom: none; }

  /* ── Figures ─────────────────────────────────────────────── */
  figcaption {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    color: #808a86;
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 6px;
  }

  /* ── Placeholder (manual-upload / review-UI hints) ───────── */
  .placeholder {
    background: #f4f1eb;
    border: 1px dashed rgba(27, 34, 32, 0.18);
    padding: 28px;
    text-align: center;
    font-size: 12.5px;
    color: #525e58;
    margin: 14px 0;
    border-radius: 10px;
  }
  .placeholder-box {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-weight: 500;
    font-size: 11px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #45685b;
  }

  /* ── Review-required: inline pill in table cells + bullets ───
     Block-level "review-banner" reserved for full-width alerts
     (not currently emitted by generator — kept for future use).
     ──────────────────────────────────────────────────────── */
  .review-required {
    display: inline;
    background: rgba(196, 81, 61, 0.1);
    color: #8e382a;
    padding: 1px 7px;
    border-radius: 3px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    vertical-align: baseline;
    white-space: nowrap;
  }
  .review-banner {
    background: rgba(196, 81, 61, 0.08);
    border-left: 3px solid #c4513d;
    padding: 10px 14px;
    margin: 10px 0;
    font-size: 12px;
    color: #8e382a;
    display: block;
    border-radius: 6px;
  }

  /* ── Bullet labels (strong leading label for §2 narrative items) ── */
  .bullet-label {
    font-weight: 600;
    color: #1b2220;
    letter-spacing: -0.005em;
  }

  /* ── Herbicide section ───────────────────────────────────── */
  .herbicide-section { margin: 16px 0; }
  .herbicide-section ul { margin: 8px 0 0 0; }

  /* ── Hours-note + footer ─────────────────────────────────── */
  .hours-note {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10.5px;
    color: #808a86;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 8px;
  }
  .footer {
    margin-top: 48px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 10px;
    color: #808a86;
    border-top: 1px solid rgba(27, 34, 32, 0.1);
    padding-top: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
`.trim();
