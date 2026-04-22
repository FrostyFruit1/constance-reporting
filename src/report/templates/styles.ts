export const REPORT_CSS = `
  body { font-family: 'Calibri', 'Helvetica', 'Arial', sans-serif; color: #1f2a24; margin: 0; padding: 0; background: #f7f6f2; }
  .page { background: #fff; max-width: 820px; margin: 24px auto; padding: 48px 64px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
  h1 { font-size: 28px; color: #3b5f48; margin: 0 0 8px 0; letter-spacing: 0.2px; }
  h2 { font-size: 20px; color: #3b5f48; margin: 32px 0 12px; border-bottom: 1px solid #dcd7c7; padding-bottom: 4px; }
  h3 { font-size: 16px; color: #2c4638; margin: 20px 0 8px; }
  h4 { font-size: 14px; color: #2c4638; margin: 14px 0 6px; }
  p { line-height: 1.55; margin: 0 0 10px; font-size: 13.5px; }
  ul { padding-left: 20px; }
  ul.outline li { margin-bottom: 12px; font-size: 13.5px; line-height: 1.55; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0 20px; font-size: 12.5px; }
  table th, table td { border: 1px solid #c9c2ac; padding: 6px 8px; text-align: left; vertical-align: top; }
  table th { background: #eef1ea; color: #2c4638; font-weight: 600; }
  .cover { text-align: center; padding: 60px 0 40px; border-bottom: 2px solid #3b5f48; margin-bottom: 28px; }
  .cover-meta { display: inline-block; text-align: left; margin-top: 24px; font-size: 13px; color: #2c4638; }
  .cover-meta dt { font-weight: 600; }
  .cover-meta dl { margin: 0; }
  .toc { margin: 20px 0 28px; font-size: 13px; }
  .toc ol { padding-left: 20px; }
  .placeholder { background: #fbf3d8; border: 1px dashed #c4ab44; padding: 24px; text-align: center; font-size: 12.5px; color: #6a5a22; margin: 12px 0; border-radius: 4px; }
  .placeholder-box { font-weight: 600; }
  figcaption { font-size: 11.5px; color: #5c5141; font-style: italic; margin-top: 4px; }
  /* Inline placeholder tag (e.g. "TBD" in table cells). Keep bare for inline flow. */
  .review-required { display: inline; background: #fdecea; color: #7a2d2d; padding: 1px 7px; border-radius: 3px; font-size: 11.5px; font-weight: 500; letter-spacing: 0.02em; vertical-align: baseline; white-space: nowrap; }
  /* Block-level review banner — use .review-banner for full-width alerts (e.g. missing CAR). */
  .review-banner { background: #fdecea; border-left: 3px solid #b85c5c; padding: 8px 12px; margin: 8px 0; font-size: 12px; color: #7a2d2d; display: block; }
  .bullet-label { font-weight: 700; color: #1f2a24; }
  .herbicide-section { margin: 12px 0; }
  .herbicide-section ul { margin: 6px 0 0 0; }
  .footer { margin-top: 40px; font-size: 11px; color: #6b6658; border-top: 1px solid #dcd7c7; padding-top: 8px; }
`.trim();
