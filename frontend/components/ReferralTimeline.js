const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]))

const profileNames = {
  medico: 'Dra. Camila Rojas',
  administrativo: 'María Fernández',
}

export function renderReferralTimeline({ events = [], loading = false, error = '' }) {
  const status = document.querySelector('#timeline-status')
  const list = document.querySelector('#timeline-events')
  if (!status || !list) return

  status.textContent = loading
    ? 'Cargando eventos…'
    : error
      ? `No se pudo cargar la línea de tiempo: ${error}`
      : events.length
        ? `${events.length} hitos registrados.`
        : 'Todavía no hay eventos registrados.'
  list.innerHTML = events.map(event => {
    const date = new Date(event.event_at)
    const formattedDate = Number.isNaN(date.getTime())
      ? 'Fecha no disponible'
      : new Intl.DateTimeFormat('es-CL', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(date)
    const profileName = profileNames[event.actor_role]
    const actorName = String(event.actor_name ?? '')
    const actor = profileName && actorName.includes('(perfil de desarrollo)')
      ? profileName
      : actorName
    const responsible = event.professional_name
      ? `<p class="mt-1 text-xs text-slate-600">Profesional: ${escapeHtml(event.professional_name)}</p>`
      : ''
    const demoBadge = event.is_demo
      ? '<span class="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900">Datos simulados · demo</span>'
      : ''
    return `<li class="relative border-l-2 border-slate-200 pb-5 pl-4 last:border-l-transparent last:pb-0">
      <span class="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-brand"></span>
      <div class="flex flex-wrap items-center gap-2">
        <time class="text-xs font-medium text-slate-500">${escapeHtml(formattedDate)}</time>
        ${demoBadge}
      </div>
      <h4 class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(event.title)}</h4>
      ${event.details ? `<p class="mt-1 text-xs text-slate-700">${escapeHtml(event.details)}</p>` : ''}
      <p class="mt-1 text-xs text-slate-600">Establecimiento: ${escapeHtml(event.establishment)}</p>
      ${responsible}
      <p class="mt-1 text-xs text-slate-600">Responsable del registro: ${escapeHtml(actor)} · ${escapeHtml(event.actor_role)}</p>
    </li>`
  }).join('')
}
