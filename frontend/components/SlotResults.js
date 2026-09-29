export const slotResultsTemplate = `
<section class="bg-white border border-slate-200 rounded-xl p-5" aria-labelledby="res-title">
  <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
    <div><h2 id="res-title" class="text-lg font-semibold"></h2><p class="text-xs text-slate-500">Ordenados por fecha más próxima</p></div>
  </div>
  <ul id="list" class="space-y-3" role="radiogroup" aria-labelledby="res-title"></ul>
  <div class="mt-4 flex items-center justify-between text-sm text-slate-500">
    <p id="range"></p><nav id="pager" class="flex gap-1" aria-label="Paginación"></nav>
  </div>
</section>`
