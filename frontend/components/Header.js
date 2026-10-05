export function renderHeader(activePage = 'interconsultas') {
  const interconsultasClass = activePage === 'interconsultas' ? 'font-semibold text-brand' : 'text-slate-500 hover:text-slate-800'
  const gestionarClass = activePage === 'gestionar' ? 'font-semibold text-brand' : 'text-slate-500 hover:text-slate-800'
  const interconsultasCurrent = activePage === 'interconsultas' ? 'aria-current="page"' : ''
  const gestionarCurrent = activePage === 'gestionar' ? 'aria-current="page"' : ''

  return `
<header class="bg-white border-b border-slate-200">
  <div class="mx-auto max-w-6xl px-4 min-h-16 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
    <div class="flex items-center gap-3">
      <img src="/assets/icon.svg" alt="" class="h-9 w-9">
      <div class="leading-tight"><p class="font-semibold">Red Salud Pública</p><p class="text-xs text-slate-500">Gestión de interconsultas y cupos</p></div>
    </div>
    <nav class="hidden md:flex gap-6 text-sm"><a href="#" class="text-slate-500">Inicio</a><a href="/" class="${interconsultasClass}" ${interconsultasCurrent}>Interconsultas</a><a href="/gestionar.html" class="${gestionarClass}" ${gestionarCurrent}>Gestionar</a><a href="#" class="text-slate-500">Ayuda</a></nav>
    <p class="text-sm text-right leading-tight"><span class="font-medium">María F.</span><br><span class="text-xs text-slate-500">Administrativa CESFAM</span></p>
  </div>
</header>`
}
