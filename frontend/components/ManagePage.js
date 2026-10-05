import { renderHeader } from './Header.js'

export const managePageTemplate = `
${renderHeader('gestionar')}
<main class="mx-auto max-w-6xl px-4 py-6">
  <div class="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
    <div>
      <h1 class="text-2xl font-semibold">Gestionar citas</h1>
      <p class="mt-1 text-sm text-slate-500">Historial de citas reservadas en la red asistencial.</p>
    </div>
    <div class="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm">
      <div><p class="text-xs text-slate-500">Última sincronización</p><p id="reservation-sync" class="font-semibold">—</p></div>
      <button id="refresh-reservations" type="button" class="border border-brand text-brand rounded-lg px-3 py-1.5 font-medium hover:bg-brand-tint">Actualizar</button>
    </div>
  </div>
  <div class="flex flex-wrap items-center gap-3 border-b border-slate-200 py-4">
    <label class="sr-only" for="reservation-search">Buscar cita</label>
    <input id="reservation-search" type="search" placeholder="Buscar por interconsulta, hospital o centro" class="min-w-64 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
    <label class="sr-only" for="reservation-status">Estado</label>
    <select id="reservation-status" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
      <option value="all">Todos los estados</option>
      <option value="active">Activas</option>
      <option value="cancelled">Canceladas</option>
    </select>
  </div>
  <p id="reservations-message" role="status" class="py-4 text-sm text-slate-500">Cargando historial…</p>
  <ul id="reservations-list" class="space-y-3"></ul>
    <section class="mt-8 border-t border-slate-200 pt-5" aria-labelledby="waitlist-title">
      <div class="flex items-baseline justify-between gap-3">
        <h2 id="waitlist-title" class="text-lg font-semibold">Lista de espera</h2>
        <p id="waitlist-message" role="status" class="text-sm text-slate-500">Cargando…</p>
      </div>
      <ol id="waitlist-list" class="mt-3 divide-y divide-slate-200"></ol>
    </section>
</main>
<div id="manage-modal-root"></div>`

const reasons = [
  'Solicitud del paciente',
  'Indicación clínica',
  'Conflicto de agenda',
  'Error en la reserva',
  'Otro',
]

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

export function renderReservationActionModal({ reservation, action, slots = [] }) {
  const rescheduling = action === 'reschedule'
  const title = rescheduling ? 'Reprogramar cita' : 'Cancelar cita'
  const reasonOptions = reasons.map(reason => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join('')
  const slotOptions = slots.map(slot => {
    const date = new Date(slot.at)
    const dateLabel = new Intl.DateTimeFormat('es-CL', {
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date)
    return `<option value="${escapeHtml(slot.id)}">${escapeHtml(dateLabel)} · ${escapeHtml(slot.est)} · ${escapeHtml(slot.box)} (${slot.cupos} cupos)</option>`
  }).join('')

  return `<dialog id="reservation-action-modal" aria-labelledby="reservation-action-title" class="fixed left-1/2 top-1/2 m-0 max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border-0 p-0 backdrop:bg-slate-900/50">
    <form id="reservation-action-form" class="space-y-4 p-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase text-brand">${rescheduling ? 'Cambio de horario' : 'Anulación'}</p>
          <h2 id="reservation-action-title" class="mt-1 text-xl font-semibold">${title}</h2>
          <p class="mt-1 text-sm text-slate-500">Interconsulta ${escapeHtml(reservation.interconsulta_id)}</p>
        </div>
        <button type="button" id="close-reservation-modal" aria-label="Cerrar" class="rounded-lg border px-3 py-1 text-sm hover:bg-slate-50">Cerrar</button>
      </div>
      ${rescheduling ? `<label class="block text-sm font-medium">Nuevo horario <span class="text-red-700">*</span>
        <select name="cupoId" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">Selecciona un horario disponible</option>${slotOptions}
        </select>
      </label>` : ''}
      <label class="block text-sm font-medium">Motivo <span class="text-red-700">*</span>
        <select name="motivo" required class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">Selecciona un motivo</option>${reasonOptions}
        </select>
      </label>
      ${rescheduling && slots.length === 0 ? '<p class="text-sm text-amber-800" role="status">No hay otros horarios disponibles para reprogramar.</p>' : ''}
      <p id="reservation-action-error" hidden role="alert" class="rounded-lg bg-warn-bg p-3 text-sm text-warn-ink"></p>
      <div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <button type="button" id="cancel-reservation-modal" class="rounded-lg border px-4 py-2 text-sm">Volver</button>
        <button type="submit" id="submit-reservation-action" ${rescheduling && slots.length === 0 ? 'disabled' : ''} class="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-400">${rescheduling ? 'Guardar nuevo horario' : 'Confirmar cancelación'}</button>
      </div>
    </form>
  </dialog>`
}
