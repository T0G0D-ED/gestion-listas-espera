import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '../assets/style.css'
import { registerSW } from 'virtual:pwa-register'
import { bindRoleSwitcher, renderHeader } from '../components/Header.js'
import { renderReferralTimeline } from '../components/ReferralTimeline.js'
import { getDemoPatients, getPatientTimelineByRut } from '../services/api.js'

document.querySelector('#app').innerHTML = `
  ${renderHeader('inicio')}
  <main class="mx-auto max-w-4xl px-4 py-6 sm:py-10">
    <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div class="max-w-2xl">
        <p class="text-sm font-semibold text-brand">Portal del paciente</p>
        <h1 class="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">Consulta la línea de tiempo de tu interconsulta</h1>
        <p class="mt-3 text-sm leading-6 text-slate-600">Ingresa tu RUT para consultar el historial asociado a tu interconsulta.</p>
      </div>
      <form id="patient-timeline-search" class="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" novalidate>
        <div>
          <label for="patient-rut" class="block text-sm font-medium text-slate-800">RUT</label>
          <input id="patient-rut" name="rut" type="text" inputmode="text" autocomplete="off" autocapitalize="characters"
            maxlength="12" required aria-describedby="patient-rut-hint"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            placeholder="Ej.: 90.000.184-0">
          <p id="patient-rut-hint" class="mt-1 text-xs text-slate-500">En esta simulación no se solicita ClaveÚnica ni código de verificación.</p>
        </div>
        <button type="submit" class="min-h-11 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">Consultar</button>
      </form>
      <p id="patient-search-status" class="mt-3 text-sm text-slate-700" role="status" aria-live="polite"></p>
      <details class="mt-5 rounded-lg border border-slate-200 p-3">
        <summary class="cursor-pointer text-sm font-medium text-slate-700">RUTs ficticios para probar la demostración</summary>
        <p class="mt-2 text-xs text-slate-500">Cada RUT ficticio está asociado a una interconsulta de ejemplo.</p>
        <ul id="demo-rut-list" class="mt-3 grid gap-2 sm:grid-cols-2" aria-label="RUTs ficticios y sus interconsultas"></ul>
      </details>
      <section class="mt-7 border-t border-slate-200 pt-6" aria-labelledby="patient-timeline-heading">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 id="patient-timeline-heading" class="text-lg font-semibold text-slate-900">Historial de interconsulta <span id="patient-interconsulta-id"></span></h2>
          <button id="patient-timeline-refresh" type="button" class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">Actualizar</button>
        </div>
        <p id="timeline-status" class="mt-3 text-sm text-slate-500" aria-live="polite"></p>
        <ol id="timeline-events" class="mt-4"></ol>
      </section>
    </section>
  </main>`

const $ = selector => document.querySelector(selector)
bindRoleSwitcher()

let currentRequest = 0
let currentRut = ''

async function loadDemoPatients() {
  const list = $('#demo-rut-list')
  try {
    const patients = await getDemoPatients()
    list.innerHTML = patients.map(patient => `
      <li>
        <button type="button" data-demo-rut="${patient.rut}"
          class="w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-sm hover:bg-brand-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <span class="font-medium">${patient.rut}</span>
          <span class="block text-xs text-slate-500">${patient.interconsultaId}</span>
        </button>
      </li>`).join('')
  } catch (error) {
    list.innerHTML = ''
    $('#patient-search-status').textContent = `No se pudieron cargar los RUTs de demostración: ${error.message}`
  }
}

async function searchTimeline(rut) {
  const requestId = ++currentRequest
  currentRut = rut.trim()
  $('#patient-rut').value = currentRut
  $('#patient-interconsulta-id').textContent = ''
  $('#patient-search-status').textContent = ''
  renderReferralTimeline({ loading: true })
  try {
    const result = await getPatientTimelineByRut(currentRut)
    if (requestId !== currentRequest) return
    $('#patient-interconsulta-id').textContent = result.interconsultaId
    $('#patient-search-status').textContent = `RUT asociado a la interconsulta ${result.interconsultaId}.`
    renderReferralTimeline({ events: result.data })
  } catch (error) {
    if (requestId !== currentRequest) return
    renderReferralTimeline({ events: [], error: error.message })
  }
}

$('#patient-timeline-search').addEventListener('submit', event => {
  event.preventDefault()
  const form = event.currentTarget
  if (!form.reportValidity()) return
  void searchTimeline($('#patient-rut').value)
})
$('#demo-rut-list').addEventListener('click', event => {
  const button = event.target.closest('[data-demo-rut]')
  if (!button) return
  void searchTimeline(button.dataset.demoRut)
})
$('#patient-timeline-refresh').addEventListener('click', () => {
  if (currentRut) void searchTimeline(currentRut)
})

registerSW({ immediate: true })
renderReferralTimeline({ events: [] })
$('#timeline-status').textContent = 'Ingresa un RUT para consultar el historial asociado.'
void loadDemoPatients()
