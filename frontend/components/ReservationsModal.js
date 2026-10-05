const reasons = [
  'Solicitud del paciente',
  'Indisponibilidad del profesional',
  'Reorganización del establecimiento',
  'Otro',
]

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]))

const dateTime = value => new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value))

const syncDate = new Intl.DateTimeFormat('es-CL', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
})
const syncTime = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const capitalize = value => value.charAt(0).toUpperCase() + value.slice(1)

export function reservationsDialogTemplate() {
  return `<dialog id="reservations-modal" aria-labelledby="reservations-title" class="fixed left-1/2 top-1/2 m-0 w-[calc(100%-2rem)] max-w-3xl max-h-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border-0 p-0 backdrop:bg-slate-900/50">
    <div id="reservations-modal-content"></div>
  </dialog>`
}

export function renderReservationActionDialog({ reservation, action, slots, error, busy }) {
  const availableSlots = slots.filter(slot => slot.cupos > 0 && slot.id !== reservation?.cupoId)
  const form = reservation ? `
    <form id="reservation-action-form" class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4" novalidate>
      <h3 class="font-semibold">${action === 'reschedule' ? 'Reprogramar cita' : 'Cancelar cita'}</h3>
      <p class="mt-1 text-sm text-slate-600">${escapeHtml(reservation.interconsultaId)} · ${dateTime(reservation.at)} · ${escapeHtml(reservation.est)}</p>
      ${action === 'reschedule' ? `
        <label class="mt-4 block text-sm font-medium" for="replacement-slot">Nuevo cupo <span aria-hidden="true">*</span></label>
        <select id="replacement-slot" name="cupoId" required class="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm">
          <option value="">Selecciona una fecha y hora</option>
          ${availableSlots.map(slot => `<option value="${escapeHtml(slot.id)}">${dateTime(slot.at)} · ${escapeHtml(slot.est)} · ${escapeHtml(slot.doctor)} · ${slot.cupos} disponibles</option>`).join('')}
        </select>
        ${availableSlots.length ? '' : '<p class="mt-1 text-xs text-amber-800">No hay otros cupos disponibles para reprogramar.</p>'}
      ` : ''}
      <label class="mt-4 block text-sm font-medium" for="reservation-reason">Motivo <span aria-hidden="true">*</span></label>
      <select id="reservation-reason" name="motivo" required class="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm">
        <option value="">Selecciona un motivo</option>
        ${reasons.map(reason => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join('')}
      </select>
      <label id="other-reason-label" for="other-reason" class="mt-3 block text-sm font-medium" hidden>Especifica el motivo <span aria-hidden="true">*</span></label>
      <textarea id="other-reason" name="otroMotivo" rows="2" maxlength="500" class="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" placeholder="Escribe el motivo" hidden></textarea>
      <div class="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" data-reservations-action="close" class="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-white">Volver</button>
        <button type="submit" ${busy || (action === 'reschedule' && !availableSlots.length) ? 'disabled' : ''} class="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50">${busy ? 'Guardando…' : action === 'reschedule' ? 'Confirmar reprogramación' : 'Confirmar cancelación'}</button>
      </div>
    </form>
  ` : ''

  return `<div class="p-5 sm:p-6">
    <div class="flex items-start justify-between gap-4">
      <div><p class="text-xs font-semibold uppercase text-brand">Administración de citas</p><h2 id="reservations-title" class="mt-1 text-xl font-semibold">${action === 'reschedule' ? 'Reprogramar cita' : 'Cancelar cita'}</h2></div>
      <button type="button" data-reservations-action="close" aria-label="Cerrar" class="rounded-lg border px-3 py-1 text-sm hover:bg-slate-50">Cerrar</button>
    </div>
    ${error ? `<p role="alert" class="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">${escapeHtml(error)}</p>` : ''}
    ${form}
  </div>`
}

export function renderReservationsPage({ filters, error, notice, lastSync }) {
  return `<div class="p-5 sm:p-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div><p class="text-xs font-semibold uppercase text-brand">Administración de citas</p><h1 id="reservations-title" class="mt-1 text-2xl font-semibold">Cupos tomados</h1><p class="mt-1 text-sm text-slate-500">Consulta, reprograma o cancela las citas reservadas.</p></div>
      <div class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
        <div><p class="text-xs text-slate-500">Última sincronización</p><p id="reservations-sync" class="font-semibold">${lastSync ? `${capitalize(syncDate.format(new Date(lastSync)))} · ${syncTime.format(new Date(lastSync))}` : 'Sin datos sincronizados'}</p></div>
        <button type="button" id="refresh-reservations" class="rounded-lg border border-brand px-3 py-1.5 font-medium text-brand hover:bg-brand-tint">Actualizar</button>
      </div>
    </div>
    ${error ? `<p role="alert" class="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">${escapeHtml(error)}</p>` : ''}
    ${notice ? `<p role="${notice.type === 'error' ? 'alert' : 'status'}" class="mt-4 rounded-lg ${notice.type === 'error' ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'} p-3 text-sm">${escapeHtml(notice.message)}</p>` : ''}
    <form id="reservation-filters" class="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4" role="search">
      <label class="text-xs font-medium text-slate-700">IC
        <input type="search" name="interconsultaId" value="${escapeHtml(filters.interconsultaId)}" placeholder="Buscar por IC" class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
      </label>
      <label class="text-xs font-medium text-slate-700">Doctor
        <input type="search" name="doctor" value="${escapeHtml(filters.doctor)}" placeholder="Buscar doctor" class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
      </label>
      <label class="text-xs font-medium text-slate-700">Hospital
        <input type="search" name="establishment" value="${escapeHtml(filters.establishment)}" placeholder="Buscar hospital" class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
      </label>
      <label class="text-xs font-medium text-slate-700">Fecha de la cita
        <input type="date" name="date" value="${escapeHtml(filters.date)}" class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
      </label>
      <div class="flex items-end sm:col-span-2 lg:col-span-4">
        <button type="reset" class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white">Limpiar filtros</button>
      </div>
    </form>
    <div id="reservations-results" aria-live="polite"></div>
  </div>`
}

export function renderReservationsList({ reservations, filters, loading }) {
  const normalized = value => value.trim().toLocaleLowerCase('es-CL')
  const query = {
    interconsultaId: normalized(filters.interconsultaId),
    doctor: normalized(filters.doctor),
    establishment: normalized(filters.establishment),
    date: filters.date,
  }
  const filteredReservations = reservations.filter(reservation =>
    reservation.interconsultaId.toLocaleLowerCase('es-CL').includes(query.interconsultaId)
    && reservation.doctor.toLocaleLowerCase('es-CL').includes(query.doctor)
    && reservation.est.toLocaleLowerCase('es-CL').includes(query.establishment)
    && (!query.date || reservation.at.slice(0, 10) === query.date),
  )
  const list = loading
    ? '<li class="p-6 text-center text-sm text-slate-500">Cargando citas…</li>'
    : filteredReservations.length
      ? filteredReservations.map(reservation => `<li class="rounded-xl border border-slate-200 bg-white p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="font-semibold">${escapeHtml(reservation.interconsultaId)}</p>
              <p class="mt-1 text-sm">${dateTime(reservation.at)} · ${escapeHtml(reservation.est)}</p>
              <p class="text-xs text-slate-500">${escapeHtml(reservation.doctor)} · ${escapeHtml(reservation.box)} · ${escapeHtml(reservation.centroSolicitante)}</p>
            </div>
            <div class="flex gap-2">
              <button type="button" data-reservations-action="reschedule" data-reservation-id="${escapeHtml(reservation.reservationId)}" class="rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand hover:bg-brand-tint">Reprogramar</button>
              <button type="button" data-reservations-action="cancel" data-reservation-id="${escapeHtml(reservation.reservationId)}" class="rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">Cancelar</button>
            </div>
          </div>
        </li>`).join('')
      : reservations.length
        ? '<li class="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">No hay citas que coincidan con esos filtros.</li>'
        : '<li class="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">No hay citas tomadas.</li>'

  return `<p class="mt-4 text-sm text-slate-500">${loading ? ' ' : `Mostrando ${filteredReservations.length} de ${reservations.length} citas`}</p>
    <ul class="mt-3 space-y-3">${list}</ul>`
}
