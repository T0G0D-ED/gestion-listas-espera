import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '../assets/style.css'
import { registerSW } from 'virtual:pwa-register'
import { bindRoleSwitcher, renderHeader } from '../components/Header.js'
import { renderReferralTimeline } from '../components/ReferralTimeline.js'
import { getInterconsultaTimeline } from '../services/api.js'

document.querySelector('#app').innerHTML = `
  ${renderHeader('timeline')}
  <main class="mx-auto max-w-4xl px-4 py-6">
    <section class="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">Línea de tiempo</h1>
          <p class="mt-1 text-sm text-slate-600">Consulta los hitos registrados para una interconsulta.</p>
        </div>
        <a href="/" class="rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand hover:bg-brand-tint">Volver a Interconsultas</a>
      </div>
      <form id="timeline-search" class="mt-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label for="timeline-referral-id" class="block text-sm font-medium text-slate-700">Identificador de interconsulta</label>
          <input id="timeline-referral-id" name="interconsultaId" required maxlength="64" pattern="[A-Za-z0-9]+(-[A-Za-z0-9]+)*" autocomplete="off"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Ej.: IC-2026-000184">
        </div>
        <button type="submit" class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Consultar historial</button>
      </form>
      <div class="mt-5">
        <label for="timeline-profile" class="block text-sm font-semibold text-slate-800">Perfil de demostración</label>
        <select id="timeline-profile" class="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:max-w-sm">
          <option value="administrativo">Administrativo · María Fernández</option>
          <option value="medico">Médico · Dra. Camila Rojas</option>
        </select>
      </div>
      <section class="mt-6 border-t border-slate-200 pt-5" aria-labelledby="timeline-results-title">
        <div class="flex items-center justify-between gap-3">
          <h2 id="timeline-results-title" class="text-lg font-semibold">Historial de <span id="timeline-current-id"></span></h2>
          <button id="timeline-refresh" type="button" class="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Actualizar</button>
        </div>
        <p id="timeline-status" class="mt-3 text-sm text-slate-500" aria-live="polite"></p>
        <ol id="timeline-events" class="mt-4"></ol>
      </section>
    </section>
  </main>`
bindRoleSwitcher()

const $ = selector => document.querySelector(selector)
const exampleReferralIds = Array.from({ length: 16 }, (_, index) =>
  `IC-2026-${String(184 + index).padStart(6, '0')}`,
)
function getStoredValue(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

let interconsultaId = getStoredValue('interconsultaId', exampleReferralIds[0])
let demoProfile = (() => {
  try {
    return localStorage.getItem('demoProfile') === 'medico' ? 'medico' : 'administrativo'
  } catch {
    return 'administrativo'
  }
})()
let requestId = 0

$('#timeline-referral-id').value = interconsultaId
$('#timeline-profile').value = demoProfile
$('#timeline-current-id').textContent = interconsultaId

async function loadTimeline() {
  const currentRequest = ++requestId
  interconsultaId = $('#timeline-referral-id').value.trim()
  $('#timeline-current-id').textContent = interconsultaId
  try {
    localStorage.setItem('interconsultaId', JSON.stringify(interconsultaId))
  } catch {}
  renderReferralTimeline({ loading: true })
  try {
    const events = await getInterconsultaTimeline(interconsultaId)
    if (currentRequest !== requestId) return
    renderReferralTimeline({ events })
  } catch (error) {
    if (currentRequest !== requestId) return
    renderReferralTimeline({ error: error.message })
  }
}

$('#timeline-search').addEventListener('submit', event => {
  event.preventDefault()
  if (!event.currentTarget.reportValidity()) return
  void loadTimeline()
})
$('#timeline-refresh').addEventListener('click', () => void loadTimeline())
$('#timeline-profile').addEventListener('change', event => {
  demoProfile = event.currentTarget.value === 'medico' ? 'medico' : 'administrativo'
  try {
    localStorage.setItem('demoProfile', demoProfile)
  } catch {}
})

registerSW({ immediate: true })
void loadTimeline()
