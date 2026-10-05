import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '../assets/style.css'
import { getCupos, getReservas, getListaEspera, cancelarReserva, reprogramarReserva } from '../services/api.js'
import { managePageTemplate, renderReservationActionModal } from '../components/ManagePage.js'

const $ = selector => document.querySelector(selector)
const store = {
  get: (key, fallback = null) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
  },
}
const state = { reservations: [], waitlist: [], loadError: null, lastSync: store.get('lastSync') }
const syncDateFormat = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: '2-digit', month: 'short' })
const syncTimeFormat = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
const capitalize = value => value.charAt(0).toUpperCase() + value.slice(1)

document.querySelector('#manage-app').innerHTML = managePageTemplate

function renderSync() {
  const label = state.lastSync
    ? `${capitalize(syncDateFormat.format(new Date(state.lastSync)))} · ${syncTimeFormat.format(new Date(state.lastSync))}`
    : 'Sin datos sincronizados'
  $('#reservation-sync').textContent = label
}

function formatDate(value) {
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value))
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function renderReservations() {
  const search = $('#reservation-search').value.trim().toLocaleLowerCase('es-CL')
  const status = $('#reservation-status').value
  const filtered = state.reservations.filter(reservation => {
    const matchesStatus = status === 'all' || reservation.status === status
    const searchText = [reservation.interconsulta_id, reservation.est, reservation.centro_solicitante]
      .join(' ').toLocaleLowerCase('es-CL')
    return matchesStatus && searchText.includes(search)
  })

  const list = $('#reservations-list')
  list.innerHTML = filtered.map(reservation => {
    const active = reservation.status === 'active'
    const waiting = reservation.waitlist_status === 'waiting'
    const history = (reservation.history || []).map(event => {
      const details = event.action === 'rescheduled'
        ? `${event.fromEst || 'Centro'} ${event.fromAt ? `(${formatDate(event.fromAt)})` : ''} → ${event.toEst || 'Centro'} ${event.toAt ? `(${formatDate(event.toAt)})` : ''}`
        : event.action === 'cancelled' ? 'Cita cancelada' : 'Cita reservada'
      return `<li class="py-2"><p class="font-medium">${escapeHtml(details)}</p><p class="text-slate-500">Motivo: ${escapeHtml(event.reason)} · ${escapeHtml(formatDate(event.createdAt))}</p></li>`
    }).join('')

    return `<li>
      <article class="rounded-lg border border-slate-200 bg-white p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-semibold">Interconsulta ${escapeHtml(reservation.interconsulta_id)}</h2>
              <span class="rounded px-2 py-0.5 text-xs ${active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}">${active ? 'Activa' : 'Cancelada'}</span>
              ${waiting ? `<span class="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-900">En espera · puesto ${reservation.waitlist_position}</span>` : ''}
            </div>
            <p class="mt-1 text-sm text-slate-500">${escapeHtml(reservation.centro_solicitante)}</p>
          </div>
          ${active ? `<div class="flex gap-2">
            <button type="button" data-action="reschedule" data-id="${escapeHtml(reservation.reservation_id)}" class="rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand-tint">Reprogramar</button>
            <button type="button" data-action="cancel" data-id="${escapeHtml(reservation.reservation_id)}" class="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50">Cancelar</button>
          </div>` : ''}
        </div>
        <dl class="mt-4 grid gap-3 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt class="text-xs text-slate-500">Fecha y hora</dt><dd class="font-medium">${escapeHtml(formatDate(reservation.at))}</dd></div>
          <div><dt class="text-xs text-slate-500">Hospital</dt><dd class="font-medium">${escapeHtml(reservation.est)}</dd></div>
          <div><dt class="text-xs text-slate-500">Box</dt><dd class="font-medium">${escapeHtml(reservation.box)}</dd></div>
          <div><dt class="text-xs text-slate-500">Profesional</dt><dd class="font-medium">${escapeHtml(reservation.doctor)}</dd></div>
        </dl>
        ${reservation.cancellation_reason ? `<p class="mt-3 text-sm text-slate-600">Motivo de cancelación: ${escapeHtml(reservation.cancellation_reason)}</p>` : ''}
        ${history ? `<details class="mt-3 border-t border-slate-100 pt-3 text-sm"><summary class="cursor-pointer font-medium">Historial de cambios (${reservation.history.length})</summary><ol class="mt-2 divide-y divide-slate-100">${history}</ol></details>` : ''}
      </article>
    </li>`
  }).join('')

  $('#reservations-message').textContent = state.loadError
    || (filtered.length ? `${filtered.length} cita${filtered.length === 1 ? '' : 's'}` : 'No hay citas que coincidan con la búsqueda.')
}

function renderWaitlist() {
  $('#waitlist-message').textContent = state.loadError
    || (state.waitlist.length ? `${state.waitlist.length} interconsulta${state.waitlist.length === 1 ? '' : 's'}` : 'Sin personas en espera')
  $('#waitlist-list').innerHTML = state.waitlist.map(entry => `
    <li class="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p class="font-medium">${escapeHtml(entry.interconsulta_id)} · ${escapeHtml(entry.especialidad)}</p>
        <p class="text-sm text-slate-500">${escapeHtml(entry.centro_solicitante)} · Motivo: ${escapeHtml(entry.motivo)}</p>
      </div>
      <span class="text-sm font-semibold text-brand">Prioridad ${entry.prioridad_clinica} · Puesto ${entry.position}</span>
    </li>`).join('')
}

async function loadReservations() {
  $('#reservations-message').textContent = 'Cargando historial…'
  try {
    const [reservations, waitlist] = await Promise.all([getReservas(), getListaEspera()])
    state.reservations = reservations
    state.waitlist = waitlist
    state.loadError = null
    state.lastSync = new Date().toISOString()
    store.set('lastSync', state.lastSync)
  } catch (error) {
    state.reservations = []
    state.waitlist = []
    state.loadError = error.message
  }
  renderSync()
  renderReservations()
  renderWaitlist()
}

async function openActionModal(reservation, action, triggerButton) {
  let slots = []
  if (action === 'reschedule') {
    slots = (await getCupos()).filter(slot => slot.cupos > 0 && slot.id !== reservation.slot_id)
  }

  $('#manage-modal-root').innerHTML = renderReservationActionModal({ reservation, action, slots })
  const dialog = $('#reservation-action-modal')
  const form = $('#reservation-action-form')
  const close = () => dialog.close()
  dialog.addEventListener('close', () => {
    triggerButton.disabled = false
  }, { once: true })
  $('#close-reservation-modal').addEventListener('click', close)
  $('#cancel-reservation-modal').addEventListener('click', close)
  dialog.addEventListener('click', event => {
    if (event.target === dialog) close()
  })
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const values = new FormData(form)
    const submit = $('#submit-reservation-action')
    const error = $('#reservation-action-error')
    submit.disabled = true
    error.hidden = true

    try {
      if (action === 'cancel') {
        await cancelarReserva(reservation.reservation_id, values.get('motivo'))
      } else {
        await reprogramarReserva(reservation.reservation_id, values.get('cupoId'), values.get('motivo'))
      }
      close()
      await loadReservations()
    } catch (requestError) {
      error.textContent = requestError.message
      error.hidden = false
    } finally {
      submit.disabled = false
    }
  })
  dialog.showModal()
}

$('#reservations-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-action]')
  if (!button) return
  const reservation = state.reservations.find(item => item.reservation_id === button.dataset.id)
  if (!reservation) return
  button.disabled = true
  try {
    await openActionModal(reservation, button.dataset.action, button)
  } catch (error) {
    state.loadError = error.message
    renderReservations()
  }
})
$('#reservation-search').addEventListener('input', renderReservations)
$('#reservation-status').addEventListener('change', renderReservations)
$('#refresh-reservations').addEventListener('click', loadReservations)

renderSync()
loadReservations()
