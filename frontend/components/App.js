import { renderHeader } from './Header.js'
import { offlineBannerTemplate } from './OfflineBanner.js'
import { pageHeadingTemplate } from './PageHeading.js'
import { searchFiltersTemplate } from './SearchFilters.js'
import { slotResultsTemplate } from './SlotResults.js'
import { referralContextTemplate } from './ReferralContext.js'

export const appTemplate = `
${renderHeader('interconsultas')}
${offlineBannerTemplate}
<main class="mx-auto max-w-6xl px-4 py-6">
  ${pageHeadingTemplate}
  <div class="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
    <div class="space-y-6">
      ${searchFiltersTemplate}
      ${slotResultsTemplate}
    </div>
    <aside class="space-y-4">
      ${referralContextTemplate}
      <section id="panel" class="bg-white border-2 border-brand rounded-xl p-5 text-sm" aria-live="polite"></section>
    </aside>
  </div>
</main>
<div id="modal-root"></div>`
