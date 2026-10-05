import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '../assets/style.css'
import { getAttendanceRequest, respondToAttendance } from '../services/api.js'

const params = new URLSearchParams(window.location.search)
const token = params.get('token') || ''
let decision = params.get('decision') === 'cancelled' ? 'cancelled' : 'confirmed'
let appointment = null
let submitting = false

document.querySelector('#app').innerHTML = `
  <header class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
      <img src="/assets/icon.svg" alt="" class="h-9 w-9">
      <div class="leading-tight"><p class="font-semibold">Red Salud Pública</p><p class="text-xs text-slate-500">Respuesta de asistencia</p></div>
    </div>
  </header>
  <main class="mx-auto max-w-3xl px-4 py-8">
    <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="attendance-title">
      <p class="text-sm font-semibold text-brand">Confirmación de cita</p>
      <h1 id="attendance-title" class="mt-1 text-2xl font-bold text-slate-900">Revisa tu cita</h1>
      <p id="attendance-status" class="mt-3 text-sm text-slate-600" role="status" aria-live="polite">Cargando los datos de la cita…</p>
      <div id="attendance-details" class="mt-5"></div>
      <div id="attendance-actions" class="mt-5" hidden>
        <label for="attendance-decision" class="block text-sm font-medium">Respuesta</label>
        <select id="attendance-decision" class="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm">
          <option value="confirmed">Confirmaré mi asistencia</option>
          <option value="cancelled">Cancelaré mi asistencia</option>
        </select>
        <p class="mt-2 text-sm text-slate-600">La cita solo cambiará cuando pulses el botón de confirmación.</p>
        <button id="attendance-submit" type="button" class="mt-4 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">Confirmar mi respuesta</button>
      </div>
    </section>
  </main>`

const $ = selector => document.querySelector(selector)
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]))

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date)
}

function updateSubmitLabel() {
  $('#attendance-submit').textContent = decision === 'confirmed'
    ? 'Confirmar mi asistencia'
    : 'Confirmar cancelación de la cita'
}

function renderAppointment() {
  const slot = appointment.slot
  $('#attendance-details').innerHTML = `
    <dl class="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
      <div><dt class="text-xs text-slate-500">Interconsulta</dt><dd class="font-medium">${escapeHtml(appointment.interconsultaId)}</dd></div>
      <div><dt class="text-xs text-slate-500">Fecha y hora</dt><dd class="font-medium">${escapeHtml(formatDate(slot.at))}</dd></div>
      <div><dt class="text-xs text-slate-500">Establecimiento</dt><dd class="font-medium">${escapeHtml(slot.est)}</dd></div>
      <div><dt class="text-xs text-slate-500">Profesional</dt><dd class="font-medium">${escapeHtml(slot.doctor)}</dd></div>
      <div><dt class="text-xs text-slate-500">Modalidad</dt><dd class="font-medium">${escapeHtml(slot.mod)}</dd></div>
      <div><dt class="text-xs text-slate-500">Box</dt><dd class="font-medium">${escapeHtml(slot.box)}</dd></div>
    </dl>`
}

async function loadAppointment() {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    $('#attendance-status').textContent = 'El enlace no es válido. Solicita que te reenvíen la información de la cita.'
    $('#attendance-status').className = 'mt-3 text-sm text-rose-700'
    return
  }
  try {
    const result = await getAttendanceRequest(token)
    appointment = result.data
    renderAppointment()
    if (appointment.response !== 'pending' || appointment.reservationStatus !== 'active') {
      $('#attendance-status').textContent = appointment.response === 'confirmed'
        ? 'Ya confirmaste tu asistencia a esta cita.'
        : appointment.response === 'cancelled'
          ? 'Esta cita ya fue cancelada.'
          : 'Esta cita ya no está activa.'
      return
    }
    $('#attendance-decision').value = decision
    updateSubmitLabel()
    $('#attendance-actions').hidden = false
    $('#attendance-status').textContent = 'Elige una respuesta. No se realizará ningún cambio hasta que confirmes en esta página.'
  } catch (error) {
    $('#attendance-status').textContent = error.message
    $('#attendance-status').className = 'mt-3 text-sm text-rose-700'
  }
}

$('#attendance-decision').addEventListener('change', event => {
  decision = event.currentTarget.value
  updateSubmitLabel()
})
$('#attendance-submit').addEventListener('click', async () => {
  if (submitting) return
  submitting = true
  const button = $('#attendance-submit')
  button.disabled = true
  button.textContent = 'Guardando respuesta…'
  try {
    const result = await respondToAttendance(token, decision)
    appointment = result.data
    renderAppointment()
    $('#attendance-actions').hidden = true
    $('#attendance-status').textContent = decision === 'confirmed'
      ? 'Tu asistencia quedó confirmada. ¡Te esperamos!'
      : 'La cita fue cancelada y el cupo quedó disponible para otra persona.'
    $('#attendance-status').className = 'mt-3 text-sm font-medium text-emerald-800'
  } catch (error) {
    $('#attendance-status').textContent = error.message
    $('#attendance-status').className = 'mt-3 text-sm text-rose-700'
    button.disabled = false
    updateSubmitLabel()
    submitting = false
  }
})

loadAppointment()
