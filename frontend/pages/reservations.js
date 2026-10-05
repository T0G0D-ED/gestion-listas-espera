import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '../assets/style.css'
import { registerSW } from 'virtual:pwa-register'
import { renderHeader } from '../components/Header.js'
import {
  renderReservationActionDialog,
  renderReservationsList,
  renderReservationsPage,
  reservationsDialogTemplate,
} from '../components/ReservationsModal.js'
import {
  cancelarReserva,
  getCupos,
  getReservas,
  reprogramarReserva,
} from '../services/api.js'

document.querySelector('#app').innerHTML = `
  ${renderHeader('reservas')}
  <main class="mx-auto max-w-6xl px-4 py-6">
    <section id="reservations-page" class="rounded-xl border border-slate-200 bg-white" aria-labelledby="reservations-title"></section>
  </main>
  <div id="modal-root">${reservationsDialogTemplate()}</div>`

const $ = selector => document.querySelector(selector)
function getLastSync() {
  try {
    return JSON.parse(localStorage.getItem('lastSync')) ?? null
  } catch {
    return null
  }
}

const state = {
  reservations: [],
  slots: [],
  selection: null,
  loading: true,
  busy: false,
  error: null,
  lastSync: null,
  notice: null,
  filters: {
    interconsultaId: '',
    doctor: '',
    establishment: '',
    date: '',
  },
}

function renderPage() {
  $('#reservations-page').innerHTML = renderReservationsPage({
    filters: state.filters,
    error: state.error,
    notice: state.notice,
    lastSync: state.lastSync || getLastSync(),
  })
  renderReservationsListView()
}

function renderReservationsListView() {
  $('#reservations-results').innerHTML = renderReservationsList({
    reservations: state.reservations,
    filters: state.filters,
    loading: state.loading,
  })
}

function renderActionDialog() {
  $('#reservations-modal-content').innerHTML = renderReservationActionDialog({
    reservation: state.selection?.reservation,
    action: state.selection?.action,
    slots: state.slots,
    error: state.error,
    busy: state.busy,
  })

  const reason = $('#reservation-reason')
  const otherLabel = $('#other-reason-label')
  const otherInput = $('#other-reason')
  if (reason && otherLabel && otherInput) {
    const isOther = reason.value === 'Otro'
    otherLabel.hidden = !isOther
    otherInput.hidden = !isOther
    otherInput.required = isOther
  }
}

async function loadReservations() {
  state.loading = true
  state.error = null
  renderPage()
  try {
    const [reservations, slots] = await Promise.all([getReservas(), getCupos()])
    state.reservations = reservations.filter(reservation => reservation.status === 'active')
    state.slots = slots
    state.lastSync = new Date().toISOString()
    localStorage.setItem('lastSync', JSON.stringify(state.lastSync))
  } catch (error) {
    state.error = error.message
  } finally {
    state.loading = false
    renderPage()
  }
}

$('#reservations-page').addEventListener('click', async event => {
  if (event.target.closest('#refresh-reservations')) {
    await loadReservations()
    return
  }

  const button = event.target.closest('[data-reservations-action]')
  if (!button) return
  const reservation = state.reservations.find(item =>
    String(item.reservationId) === button.dataset.reservationId,
  )
  if (!reservation) return

  state.selection = { action: button.dataset.reservationsAction, reservation }
  state.error = null
  renderActionDialog()
  $('#reservations-modal').showModal()
})

$('#reservations-page').addEventListener('input', event => {
  const field = event.target.name
  if (!Object.hasOwn(state.filters, field)) return
  state.filters[field] = event.target.value
  renderReservationsListView()
})

$('#reservations-page').addEventListener('change', event => {
  if (event.target.name !== 'date') return
  state.filters.date = event.target.value
  renderReservationsListView()
})

$('#reservations-page').addEventListener('reset', event => {
  if (event.target.id !== 'reservation-filters') return
  state.filters = { interconsultaId: '', doctor: '', establishment: '', date: '' }
  requestAnimationFrame(renderReservationsListView)
})

$('#modal-root').addEventListener('click', event => {
  if (event.target.closest('[data-reservations-action="close"]')) {
    $('#reservations-modal').close()
  }
})

$('#modal-root').addEventListener('change', event => {
  if (event.target.id !== 'reservation-reason') return
  const isOther = event.target.value === 'Otro'
  const otherLabel = $('#other-reason-label')
  const otherInput = $('#other-reason')
  otherLabel.hidden = !isOther
  otherInput.hidden = !isOther
  otherInput.required = isOther
})

$('#modal-root').addEventListener('submit', async event => {
  if (event.target.id !== 'reservation-action-form') return
  event.preventDefault()
  if (!event.target.reportValidity() || state.busy || !state.selection) return

  const values = Object.fromEntries(new FormData(event.target))
  state.busy = true
  state.error = null
  renderActionDialog()
  try {
    let result
    if (state.selection.action === 'reschedule') {
      result = await reprogramarReserva(state.selection.reservation.reservationId, values)
    } else {
      result = await cancelarReserva(state.selection.reservation.reservationId, values)
    }
    const notification = result.data.notification
    state.notice = notification?.sent
      ? { type: 'success', message: `Cita actualizada. Correo de prueba enviado a ${notification.recipient}.` }
      : { type: 'error', message: notification?.error || 'La cita se actualizó, pero no se confirmó el envío del correo de prueba.' }
    $('#reservations-modal').close()
    state.selection = null
    await loadReservations()
  } catch (error) {
    state.error = error.message
  } finally {
    state.busy = false
    if ($('#reservations-modal').open) renderActionDialog()
  }
})

$('#reservations-modal').addEventListener('click', event => {
  if (event.target === $('#reservations-modal')) $('#reservations-modal').close()
})

registerSW({ immediate: true })
renderPage()
loadReservations()
