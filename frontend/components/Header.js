const onReservationsPage = window.location.pathname.endsWith('/reservas.html')

export const headerTemplate = `
<header class="bg-white border-b border-slate-200">
  <div class="mx-auto max-w-6xl px-4 min-h-16 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
    <div class="flex items-center gap-3">
      <img src="/assets/icon.svg" alt="" class="h-9 w-9">
      <div class="leading-tight"><p class="font-semibold">Red Salud Pública</p><p class="text-xs text-slate-500">Gestión de interconsultas y cupos</p></div>
    </div>
    <nav class="order-last flex basis-full justify-center gap-3 text-xs sm:order-none sm:basis-auto sm:gap-4 sm:text-sm md:gap-6" aria-label="Navegación principal">
      <a href="/" class="text-slate-500 hover:text-brand">Inicio</a>
      <a href="/" class="${onReservationsPage ? 'text-slate-500 hover:text-brand' : 'font-semibold text-brand'}" ${onReservationsPage ? '' : 'aria-current="page"'}>Interconsultas</a>
      <a href="/reservas.html" class="${onReservationsPage ? 'font-semibold text-brand' : 'text-slate-500 hover:text-brand'}" ${onReservationsPage ? 'aria-current="page"' : ''}>Cupos tomados</a>
      <a href="#" class="text-slate-500 hover:text-brand">Ayuda</a>
    </nav>
    <p class="text-sm text-right leading-tight"><span class="font-medium">María F.</span><br><span class="text-xs text-slate-500">Administrativa CESFAM</span></p>
  </div>
</header>`
