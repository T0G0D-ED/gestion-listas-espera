export const pageHeadingTemplate = `
<div class="flex flex-wrap items-end justify-between gap-4 mb-6">
  <div>
    <h1 class="text-3xl font-semibold">Buscar y seleccionar un cupo disponible</h1>
    <p class="text-slate-500 mt-1">Revisa alternativas de la red asistencial, elige el cupo más adecuado y confirma la selección.</p>
  </div>
  <div class="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm">
    <div><p class="text-xs text-slate-500">Última sincronización</p><p id="sync" class="font-semibold">—</p><p class="mt-1 text-xs text-slate-600">Pendientes de sincronización: <strong id="pending-sync-count" aria-live="polite">0</strong></p><p id="sync-queue-message" hidden role="status" class="mt-1 max-w-56 text-xs text-amber-800"></p></div>
    <button id="refresh" class="border border-brand text-brand rounded-lg px-3 py-1.5 font-medium hover:bg-brand-tint">Actualizar</button>
  </div>
</div>`
