import type { ReportData, NarrativeSections, StaffHoursRow, WeedWorkRow, HerbicideRow, OutlineBullet } from '../types';
import { REPORT_CSS } from './styles';
import { formatZonesPhrase } from '../period';

export function renderBushRegenHtml(data: ReportData, n: NarrativeSections): string {
  const {
    titleLine, authorLine, publicationDate, addressedTo,
    organization, client, zonesIncluded, periodLabel, cadence, sites,
  } = data;

  const zonesPhrase = formatZonesPhrase(zonesIncluded).display || '—';

  const locationMapHtml = renderLocationMaps(data);
  const outlineHtml = renderOutlineOfWorks(data, n);
  const staffHtml = renderStaffSection(data);
  const mapAreasHtml = renderMapAreas(data);
  const weedWorksHtml = renderWeedWorksTable(data.weedWorks);
  const birdHtml = renderParagraphSection('5.0', 'Bird Sightings', n.birdSightings);
  const herbicideHtml = renderHerbicideSection(data.herbicideTotals);
  const incidentsHtml = renderParagraphSection('7.0', 'Incidents on Site', n.incidents);
  const faunaHtml = renderParagraphSection('8.0', 'Wombats and Other Fauna Sightings', n.faunaSightings);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(titleLine)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<div class="page">
  <section class="cover">
    <h1>${escapeHtml(titleLine)}</h1>
    <dl class="cover-meta">
      <dt>Written By</dt><dd>${escapeHtml(authorLine)}</dd>
      <dt>Date</dt><dd>${escapeHtml(publicationDate)}</dd>
      <dt>Addressed to</dt><dd>${escapeHtml(addressedTo)}</dd>
      <dt>From</dt><dd>${escapeHtml(organization.name)}</dd>
      ${organization.address ? `<dt>Address</dt><dd>${escapeHtml(organization.address)}</dd>` : ''}
      ${organization.phone ? `<dt>Phone</dt><dd>${escapeHtml(organization.phone)}</dd>` : ''}
      ${organization.email ? `<dt>Email</dt><dd>${escapeHtml(organization.email)}</dd>` : ''}
    </dl>
  </section>

  <nav class="toc">
    <h2>Table of Contents</h2>
    <ol>
      <li>Project Location</li>
      <li>Outline of Works</li>
      <li>Staff on Site</li>
      <li>Map of Areas Worked</li>
      <li>Bird Sightings</li>
      <li>Herbicide Information</li>
      <li>Incidents on Site</li>
      <li>Wombats and Other Fauna Sightings</li>
    </ol>
  </nav>

  <section>
    <h2>1.0 Project Location</h2>
    ${locationMapHtml}
  </section>

  <section>
    <h2>2.0 Outline of Works</h2>
    ${outlineHtml}
  </section>

  <section>
    <h2>3.0 Staff on Site</h2>
    ${staffHtml}
  </section>

  <section>
    <h2>4.0 Map of Areas Worked</h2>
    ${mapAreasHtml}
    <h3>4.1 Weed Works Table</h3>
    <figcaption>Table 1.0: Weed species treated, treatment method, map polygon colour and staff hours worked for the period.</figcaption>
    ${weedWorksHtml}
  </section>

  ${birdHtml}

  <section>
    <h2>6.0 Herbicide Information</h2>
    ${herbicideHtml}
  </section>

  ${incidentsHtml}

  ${faunaHtml}

  <div class="footer">
    Generated ${escapeHtml(publicationDate)} for ${escapeHtml(client.name)} — zones ${escapeHtml(zonesPhrase)}, ${escapeHtml(periodLabel)} (${escapeHtml(cadence)}).
    Site references: ${escapeHtml(sites.map(s => s.name).join(', '))}.
  </div>
</div>
</body>
</html>`;
}

function renderLocationMaps(data: ReportData): string {
  const maps = data.client.location_maps || [];
  const site0 = data.sites[0];
  const addr = `${site0?.street ?? ''}${site0?.suburb ? ', ' + site0.suburb : ''}` || '[site address — upload via review UI]';
  const siteName = site0?.long_name || site0?.name || data.client.name;
  if (maps.length === 0) {
    return `
      <figure class="placeholder" data-placeholder="location_map_0" data-editable="true">
        <div class="placeholder-box">Location Map 1.0 — upload via review UI</div>
        <figcaption>Map 1.0: Area of work site: ${escapeHtml(siteName)} found at ${escapeHtml(addr)}.</figcaption>
      </figure>
      <figure class="placeholder" data-placeholder="location_map_1" data-editable="true">
        <div class="placeholder-box">Location Map 1.1 — upload via review UI</div>
        <figcaption>Map 1.1: Area of work site: ${escapeHtml(siteName)} found at ${escapeHtml(addr)}.</figcaption>
      </figure>`;
  }
  return maps.map((url, i) => `
    <figure>
      <img src="${escapeHtml(url)}" alt="Location Map 1.${i}" style="max-width:100%;" />
      <figcaption>Map 1.${i}: Area of work site: ${escapeHtml(siteName)} found at ${escapeHtml(addr)}.</figcaption>
    </figure>`).join('\n');
}

function renderOutlineOfWorks(data: ReportData, n: NarrativeSections): string {
  if (data.zonesIncluded.length === 0) {
    return `<p><em>No inspections in this period.</em></p>`;
  }
  return data.zonesIncluded.map((zone, i) => {
    const bullets = n.outlineOfWorks[zone] || [];
    const bulletHtml = bullets.length > 0
      ? `<ul class="outline">${bullets.map((b: OutlineBullet) => `<li><span class="bullet-label">${escapeHtml(b.label)}</span><br />${escapeHtml(b.body)}</li>`).join('')}</ul>`
      : `<p class="review-required">No narrative bullets generated for this zone (LLM skipped or no data). Manual authoring required.</p>`;
    return `
      <h3>2.${i + 1} ${escapeHtml(zone)}</h3>
      <h4>2.${i + 1}.1 Works Carried Out</h4>
      ${bulletHtml}`;
  }).join('\n');
}

function renderStaffSection(data: ReportData): string {
  if (data.zonesIncluded.length === 0) return '<p><em>No staff data for this period.</em></p>';
  const totalHoursAll = data.staffHoursByZone.reduce((s, r) => s + r.hours, 0);
  const zonesPhrase = formatZonesPhrase(data.zonesIncluded).display || 'this site';
  const zoneBlocks = data.zonesIncluded.map((zone, i) => {
    const rows = data.staffHoursByZone.filter(r => r.zone === zone);
    const tableRows = rows.length > 0
      ? rows.map((r: StaffHoursRow) => `<tr><td>${escapeHtml(r.staff_name)}</td><td>${r.hours}</td></tr>`).join('')
      : `<tr><td colspan="2"><em>No hours recorded for this zone.</em></td></tr>`;
    return `
      <h3>3.${i + 1} ${escapeHtml(zone)}</h3>
      <table>
        <thead><tr><th>Staff Member</th><th>Hours</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>`;
  }).join('\n');
  return `${zoneBlocks}
    <p><strong>A total of ${totalHoursAll} hours were completed this ${data.cadence === 'monthly' ? 'month' : 'week'} for ${escapeHtml(zonesPhrase)}.</strong></p>`;
}

function renderMapAreas(data: ReportData): string {
  return `
    <figure class="placeholder" data-placeholder="period_map_0" data-editable="true">
      <div class="placeholder-box">Map 2.0 — upload polygon overlay via review UI</div>
      <figcaption>Map 2.0: Map of all areas worked in correlation to Table 1.0.</figcaption>
    </figure>`;
}

function renderWeedWorksTable(rows: WeedWorkRow[]): string {
  if (rows.length === 0) return '<p><em>No weed works recorded for this period.</em></p>';
  const body = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.weed_type)}</td>
      <td>${r.area_m2 ?? '<span class="review-required">TBD</span>'}</td>
      <td>${escapeHtml(r.method)}</td>
      <td>${r.gis_lat != null && r.gis_lng != null ? `${r.gis_lat},<br />${r.gis_lng}` : '<span class="review-required">TBD</span>'}</td>
      <td>${escapeHtml(r.zone)}</td>
      <td>${r.hours}</td>
      <td>${r.colour ? escapeHtml(r.colour) : '<span class="review-required">TBD</span>'}</td>
    </tr>`).join('');
  return `
    <table>
      <thead>
        <tr>
          <th>Weed Type</th>
          <th>Density (m²)</th>
          <th>Method Used</th>
          <th>GIS Location</th>
          <th>Area Worked</th>
          <th>Hours Worked</th>
          <th>Map Polygon Colour</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

function renderHerbicideSection(rows: HerbicideRow[]): string {
  if (rows.length === 0) return '<p><em>No chemical applications recorded for this period.</em></p>';
  return rows.map((r, i) => {
    const target = r.target_weed ? ` for ${escapeHtml(r.target_weed)}` : '';
    const rate = r.rate_text ? ` ${escapeHtml(r.rate_text)}` : '';
    const zone = r.zone ? ` (${escapeHtml(r.zone)})` : '';
    const sprayed = r.total_sprayed_litres != null ? `${r.total_sprayed_litres}L` : '<span class="review-required">TBD</span>';
    const concentrate = r.total_concentrate_ml != null ? `${r.total_concentrate_ml}ml` : '<span class="review-required">TBD</span>';
    const reviewFlag = r.needs_review ? '<div class="review-required">No Chemical Application Record found for this period — review required before sending.</div>' : '';
    return `
      <div class="herbicide-section">
        <h3>6.${i + 1} ${escapeHtml(r.chemical_canonical)}${rate}${target}${zone}</h3>
        ${reviewFlag}
        <ul>
          <li>Total amount Sprayed: ${sprayed}.</li>
          <li>Total concentrate sprayed: ${concentrate}.</li>
        </ul>
      </div>`;
  }).join('\n');
}

function renderParagraphSection(num: string, title: string, body: string): string {
  return `<section><h2>${escapeHtml(num)} ${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></section>`;
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
