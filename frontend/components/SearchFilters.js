export const searchFiltersTemplate = `
<form id="filters" class="bg-white border border-slate-200 rounded-xl p-5">
  <h2 class="font-semibold mb-4">Criterios de búsqueda</h2>
  <div class="grid sm:grid-cols-3 gap-4 text-sm">
    <label class="block"><span class="text-xs text-slate-500">Especialidad *</span>
      <select name="esp" class="mt-1 w-full rounded-lg border-slate-300 border px-3 py-2"><option>Traumatología adulto</option></select></label>
    <label class="block"><span class="text-xs text-slate-500">Establecimiento</span>
      <select name="est" id="f-est" class="mt-1 w-full rounded-lg border-slate-300 border px-3 py-2"><option value="">Todos los establecimientos</option></select></label>
    <label class="block"><span class="text-xs text-slate-500">Comuna o red</span>
      <select name="red" class="mt-1 w-full rounded-lg border-slate-300 border px-3 py-2"><option value="sur">Red Sur</option><option value="">Todas las redes</option></select></label>
    <label class="block"><span class="text-xs text-slate-500">Modalidad</span>
      <select name="mod" class="mt-1 w-full rounded-lg border-slate-300 border px-3 py-2"><option value="">Todas</option><option>Presencial</option><option>Teleatención</option></select></label>
    <label class="block"><span class="text-xs text-slate-500">Desde</span>
      <input type="date" name="desde" value="2026-09-29" class="mt-1 w-full rounded-lg border-slate-300 border px-3 py-2"></label>
    <label class="block"><span class="text-xs text-slate-500">Hasta</span>
      <input type="date" name="hasta" value="2026-10-13" class="mt-1 w-full rounded-lg border-slate-300 border px-3 py-2"></label>
  </div>
  <div class="mt-4 flex flex-wrap items-center gap-4">
    <button class="bg-brand hover:bg-brand-dark text-white rounded-lg px-5 py-2 font-medium">Buscar cupos</button>
    <button type="reset" class="text-sm text-brand underline">Limpiar filtros</button>
  </div>
</form>`
