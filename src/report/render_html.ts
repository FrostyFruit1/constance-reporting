import type { ReportData, NarrativeSections } from './types';
import { renderBushRegenHtml } from './templates/bush_regen.html';

export function renderHtml(data: ReportData, narratives: NarrativeSections): string {
  const variant = data.client.report_template_variant || 'bush_regen_weed_management';
  switch (variant) {
    case 'bush_regen_weed_management':
    default:
      return renderBushRegenHtml(data, narratives);
  }
}
