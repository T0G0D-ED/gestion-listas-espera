import { getUnreadCounterReferralCount } from '../services/api.js'

function getCurrentRole() {
  try {
    const role = localStorage.getItem('appRole')
    return ['paciente', 'medico'].includes(role) ? role : 'administrativo'
  } catch {
    return 'administrativo'
  }
}

export function renderHeader(activePage = 'interconsultas') {
  const currentRole = getCurrentRole()
  const patientMode = currentRole === 'paciente'
  const interconsultasClass = activePage === 'interconsultas' ? 'font-semibold text-brand' : 'text-slate-500 hover:text-slate-800'
  const timelineClass = activePage === 'timeline' ? 'font-semibold text-brand' : 'text-slate-500 hover:text-slate-800'
  const reservationsClass = activePage === 'reservas' ? 'font-semibold text-brand' : 'text-slate-500 hover:text-slate-800'
  const interconsultasCurrent = activePage === 'interconsultas' ? 'aria-current="page"' : ''
  const timelineCurrent = activePage === 'timeline' ? 'aria-current="page"' : ''
  const reservationsCurrent = activePage === 'reservas' ? 'aria-current="page"' : ''
  const profileName = patientMode ? 'Paciente' : 'María F.'
  const doctorMode = currentRole === 'medico'
  const profileDescription = patientMode
    ? 'Consulta pública'
    : doctorMode
      ? 'Médico auditor'
      : 'Administrativa CESFAM'
  const roleAction = patientMode
    ? '<button type="button" data-switch-role="administrativo" class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100">Cambiar a Administrativo CESFAM</button><button type="button" data-switch-role="medico" class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100">Cambiar a Médico · Dr. Kosme Fulanito</button>'
    : doctorMode
      ? '<button type="button" data-switch-role="administrativo" class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100">Cambiar a Administrativo CESFAM</button>'
      : '<button type="button" data-switch-role="medico" class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100">Cambiar a Médico · Dr. Kosme Fulanito</button><button type="button" data-switch-role="paciente" class="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100">Cambiar a Paciente</button>'
  const navigation = patientMode
    ? `<a href="/" class="font-semibold text-brand" aria-current="page">Inicio</a>`
    : `<a href="/" class="${interconsultasClass}" ${interconsultasCurrent}>Interconsultas</a><a href="/timeline.html" class="${timelineClass}" ${timelineCurrent}>Línea de tiempo</a><a href="/reservas.html" class="${reservationsClass}" ${reservationsCurrent}>Cupos tomados</a>${doctorMode ? `<a href="/contrarreferencia.html" class="${activePage === 'contrarreferencia' ? 'font-semibold text-brand' : 'text-slate-500 hover:text-slate-800'}" ${activePage === 'contrarreferencia' ? 'aria-current="page"' : ''}>Contrarreferencia</a>` : ''}${!doctorMode ? `<a href="/devueltas.html" class="${activePage === 'devueltas' ? 'font-semibold text-brand' : 'text-slate-500 hover:text-slate-800'}" ${activePage === 'devueltas' ? 'aria-current="page"' : ''}>Devueltas al CESFAM</a><a href="/contrarreferidas.html" class="${activePage === 'contrarreferidas' ? 'font-semibold text-brand' : 'text-slate-500 hover:text-slate-800'}" ${activePage === 'contrarreferidas' ? 'aria-current="page"' : ''}>Contrarreferidas<span data-counterreferral-badge hidden class="ml-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white"></span></a>` : ''}`

  return `
<header class="relative z-40 bg-white border-b border-slate-200">
  <div class="mx-auto max-w-6xl px-4 min-h-16 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 lg:flex lg:justify-between">
    <div class="flex items-center gap-3">
      <img src="/assets/icon.svg" alt="" class="h-9 w-9">
      <div class="leading-tight"><p class="font-semibold">Red Salud Pública</p><p class="text-xs text-slate-500">Gestión de interconsultas y cupos</p></div>
    </div>
    <nav aria-label="Navegación principal" class="col-span-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">${navigation}</nav>
    <details id="role-switcher" class="relative z-50 col-start-2 row-start-1 lg:ml-auto">
      <summary class="list-none cursor-pointer rounded-lg px-2 py-1 text-right leading-tight outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand">
        <span class="font-medium">${doctorMode ? 'Dr. Kosme Fulanito' : profileName}</span><br>
        <span class="text-xs text-slate-500">${profileDescription} <span aria-hidden="true">▾</span></span>
      </summary>
      <div class="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
        <p class="px-3 py-2 text-xs text-slate-500">Cambiar de rol</p>
        ${roleAction}
        <p id="role-switch-error" class="px-3 py-1 text-xs text-red-700" role="status" aria-live="polite"></p>
      </div>
    </details>
  </div>
</header>`
}

export async function refreshCounterReferralBadge() {
  const badges = document.querySelectorAll('[data-counterreferral-badge]')
  if (!badges.length) return
  try {
    const unread = await getUnreadCounterReferralCount()
    for (const badge of badges) {
      badge.textContent = unread > 99 ? '99+' : String(unread)
      badge.setAttribute('aria-label', `${unread} contrarreferencias sin leer`)
      badge.hidden = unread === 0
    }
  } catch {
    for (const badge of badges) badge.hidden = true
  }
}

export function bindRoleSwitcher() {
  void refreshCounterReferralBadge()
  const switcher = document.querySelector('#role-switcher')
  if (!switcher) return
  switcher.addEventListener('click', event => {
    const button = event.target.closest('[data-switch-role]')
    if (!button) return
    try {
      const role = button.dataset.switchRole
      localStorage.setItem('appRole', role)
      if (role !== 'paciente') localStorage.setItem('demoProfile', role)
      window.location.assign('/')
    } catch (error) {
      const status = switcher.querySelector('#role-switch-error')
      status.textContent = `No fue posible cambiar el perfil: ${error.message}`
    }
  })
}
