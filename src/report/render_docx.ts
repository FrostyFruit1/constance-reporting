import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle,
} from 'docx';
import type { ReportData, NarrativeSections, WeedWorkRow, HerbicideRow, StaffHoursRow } from './types';
import { formatZonesPhrase } from './period';

export async function renderDocx(data: ReportData, n: NarrativeSections): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [];

  // Cover
  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: data.titleLine, bold: true, size: 36 })],
  }));
  children.push(spacer());
  children.push(kvLine('Written By', data.authorLine));
  children.push(kvLine('Date', data.publicationDate));
  children.push(kvLine('Addressed to', data.addressedTo));
  children.push(kvLine('From', data.organization.name));
  if (data.organization.address) children.push(kvLine('Address', data.organization.address));
  if (data.organization.phone) children.push(kvLine('Phone', data.organization.phone));
  if (data.organization.email) children.push(kvLine('Email', data.organization.email));
  children.push(spacer());

  // Table of contents (static)
  children.push(heading('Table of Contents', HeadingLevel.HEADING_1));
  for (const t of [
    '1.0 Project Location', '2.0 Outline of Works', '3.0 Staff on Site',
    '4.0 Map of Areas Worked', '5.0 Bird Sightings', '6.0 Herbicide Information',
    '7.0 Incidents on Site', '8.0 Wombats and Other Fauna Sightings',
  ]) {
    children.push(new Paragraph({ children: [new TextRun(t)] }));
  }
  children.push(spacer());

  // §1
  children.push(heading('1.0 Project Location', HeadingLevel.HEADING_1));
  children.push(placeholderPara('Location Map 1.0 — upload via review UI'));
  children.push(placeholderPara('Location Map 1.1 — upload via review UI'));

  // §2
  children.push(heading('2.0 Outline of Works', HeadingLevel.HEADING_1));
  if (data.zonesIncluded.length === 0) {
    children.push(italicPara('No inspections in this period.'));
  } else {
    data.zonesIncluded.forEach((zone, i) => {
      children.push(heading(`2.${i + 1} ${zone}`, HeadingLevel.HEADING_2));
      children.push(heading(`2.${i + 1}.1 Works Carried Out`, HeadingLevel.HEADING_3));
      const bullets = n.outlineOfWorks[zone] || [];
      if (bullets.length === 0) {
        children.push(italicPara('No narrative bullets generated for this zone (LLM skipped or no data).'));
      } else {
        for (const b of bullets) {
          children.push(new Paragraph({
            children: [new TextRun({ text: b.label, bold: true })],
            spacing: { before: 120 },
          }));
          children.push(new Paragraph({ children: [new TextRun(b.body)] }));
        }
      }
    });
  }

  // §3
  children.push(heading('3.0 Staff on Site', HeadingLevel.HEADING_1));
  if (data.zonesIncluded.length === 0) {
    children.push(italicPara('No staff data for this period.'));
  } else {
    data.zonesIncluded.forEach((zone, i) => {
      children.push(heading(`3.${i + 1} ${zone}`, HeadingLevel.HEADING_2));
      const rows = data.staffHoursByZone.filter(r => r.zone === zone);
      children.push(staffTable(rows));
    });
    const totalHours = data.staffHoursByZone.reduce((s, r) => s + r.hours, 0);
    const zonesPhrase = formatZonesPhrase(data.zonesIncluded).display || 'this site';
    const periodWord = data.cadence === 'monthly' ? 'month' : 'week';
    children.push(new Paragraph({
      children: [new TextRun({ text: `A total of ${totalHours} hours were completed this ${periodWord} for ${zonesPhrase}.`, bold: true })],
      spacing: { before: 200 },
    }));
  }

  // §4
  children.push(heading('4.0 Map of Areas Worked', HeadingLevel.HEADING_1));
  children.push(placeholderPara('Map 2.0 — upload polygon overlay via review UI'));
  children.push(heading('4.1 Weed Works Table', HeadingLevel.HEADING_2));
  children.push(weedWorksTable(data.weedWorks));

  // §5
  children.push(heading('5.0 Bird Sightings', HeadingLevel.HEADING_1));
  children.push(new Paragraph({ children: [new TextRun(n.birdSightings)] }));

  // §6
  children.push(heading('6.0 Herbicide Information', HeadingLevel.HEADING_1));
  if (data.herbicideTotals.length === 0) {
    children.push(italicPara('No chemical applications recorded for this period.'));
  } else {
    data.herbicideTotals.forEach((h, i) => {
      const headingText = formatHerbicideHeading(h);
      children.push(heading(`6.${i + 1} ${headingText}`, HeadingLevel.HEADING_2));
      if (h.needs_review) {
        children.push(italicPara('No Chemical Application Record found for this period — review required before sending.'));
      }
      children.push(new Paragraph({
        children: [new TextRun(`Total amount Sprayed: ${h.total_sprayed_litres != null ? h.total_sprayed_litres + 'L' : 'TBD'}.`)],
      }));
      children.push(new Paragraph({
        children: [new TextRun(`Total concentrate sprayed: ${h.total_concentrate_ml != null ? h.total_concentrate_ml + 'ml' : 'TBD'}.`)],
      }));
    });
  }

  // §7
  children.push(heading('7.0 Incidents on Site', HeadingLevel.HEADING_1));
  children.push(new Paragraph({ children: [new TextRun(n.incidents)] }));

  // §8
  children.push(heading('8.0 Wombats and Other Fauna Sightings', HeadingLevel.HEADING_1));
  children.push(new Paragraph({ children: [new TextRun(n.faunaSightings)] }));

  const doc = new Document({
    creator: data.organization.name,
    title: data.titleLine,
    sections: [{ children }],
  });

  return await Packer.toBuffer(doc);
}

function formatHerbicideHeading(h: HerbicideRow): string {
  const parts = [h.chemical_canonical];
  if (h.rate_text) parts.push(h.rate_text);
  if (h.target_weed) parts.push(`for ${h.target_weed}`);
  if (h.zone) parts.push(`(${h.zone})`);
  return parts.join(' ');
}

function heading(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    heading: level,
    children: [new TextRun(text)],
    spacing: { before: 240, after: 120 },
  });
}

function kvLine(k: string, v: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `${k}: `, bold: true }), new TextRun(v)],
  });
}

function spacer(): Paragraph {
  return new Paragraph({ children: [new TextRun('')] });
}

function italicPara(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, italics: true })] });
}

function placeholderPara(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `[${text}]`, italics: true, color: '7a5a00' })],
    spacing: { before: 120, after: 120 },
  });
}

function cell(text: string, opts: { header?: boolean; width?: number } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({
      children: [new TextRun({ text, bold: !!opts.header })],
    })],
  });
}

function staffTable(rows: StaffHoursRow[]): Table {
  const header = new TableRow({
    children: [cell('Staff Member', { header: true, width: 70 }), cell('Hours', { header: true, width: 30 })],
    tableHeader: true,
  });
  const bodyRows = rows.length > 0
    ? rows.map(r => new TableRow({
        children: [cell(r.staff_name), cell(String(r.hours))],
      }))
    : [new TableRow({ children: [cell('No hours recorded for this zone.'), cell('')] })];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...bodyRows],
  });
}

function weedWorksTable(rows: WeedWorkRow[]): Table {
  const header = new TableRow({
    children: [
      cell('Weed Type', { header: true }),
      cell('Density (m²)', { header: true }),
      cell('Method Used', { header: true }),
      cell('GIS Location', { header: true }),
      cell('Area Worked', { header: true }),
      cell('Hours Worked', { header: true }),
      cell('Map Polygon Colour', { header: true }),
    ],
    tableHeader: true,
  });
  const bodyRows = rows.length > 0
    ? rows.map(r => new TableRow({
        children: [
          cell(r.weed_type),
          cell(r.area_m2 != null ? String(r.area_m2) : 'TBD'),
          cell(r.method),
          cell(r.gis_lat != null && r.gis_lng != null ? `${r.gis_lat},\n${r.gis_lng}` : 'TBD'),
          cell(r.zone),
          cell(String(r.hours)),
          cell(r.colour || 'TBD'),
        ],
      }))
    : [new TableRow({ children: Array.from({ length: 7 }, () => cell('No data')) })];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...bodyRows],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
      left: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
      right: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'AAAAAA' },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'AAAAAA' },
    },
  });
}
