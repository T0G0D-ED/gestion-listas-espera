import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '../assets/style.css'
import { registerSW } from 'virtual:pwa-register'
import { bindRoleSwitcher, renderHeader } from '../components/Header.js'
import { getReturnedReferrals, resubmitReferral } from '../services/api.js'

document.querySelector('#app').innerHTML = `
  ${renderHeader('devueltas')}
  <main class="mx-auto max-w-6xl px-4 py-6">
    <section class="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-brand">Bandeja del CESFAM</p>
          <h1 class="mt-1 text-2xl font-bold text-slate-900">Interconsultas devueltas</h1>
          <p class="mt-1 text-sm text-slate-600">Responde las observaciones y agrega los exámenes solicitados antes de reenviar. El contenido original se conserva.</p>
        </div>
        <button id="returned-refresh" type="button" class="rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand hover:bg-brand-tint">Actualizar</button>
      </div>
      <p id="returned-notice" class="mt-4 text-sm" role="status" aria-live="polite"></p>
      <div id="returned-list" class="mt-4 grid gap-4" aria-live="polite"></div>
    </section>
  </main>`

const $ = selector => document.querySelector(selector)
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]))
let referrals = []
let loading = false
let error = ''

function renderList() {
  const list = $('#returned-list')
  if (loading) {
    list.innerHTML = '<p class="text-sm text-slate-500">Cargando interconsultas devueltas…</p>'
    return
  }
  if (error) {
    list.innerHTML = `<p role="alert" class="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">${escapeHtml(error)}</p>`
    return
  }
  if (!referrals.length) {
    list.innerHTML = '<p class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No hay interconsultas devueltas pendientes de respuesta.</p>'
    return
  }
  list.innerHTML = referrals.map(referral => `
    <article class="rounded-xl border border-amber-200 bg-white p-4">
      <div>
        <h2 class="font-semibold text-slate-900">${escapeHtml(referral.interconsulta_id)}</h2>
        <p class="mt-1 text-sm text-slate-600">${escapeHtml(referral.issuer_establishment)} · ${escapeHtml(referral.issuer_professional)}</p>
      </div>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <section class="rounded-lg bg-amber-50 p-3">
          <h3 class="text-sm font-semibold">Observaciones del auditor</h3>
          <p class="mt-1 whitespace-pre-wrap text-sm text-slate-700">${escapeHtml(referral.observations || 'No se agregaron observaciones.')}</p>
        </section>
        <section class="rounded-lg bg-amber-50 p-3">
          <h3 class="text-sm font-semibold">Exámenes solicitados</h3>
          <p class="mt-1 whitespace-pre-wrap text-sm text-slate-700">${escapeHtml(referral.missing_exams || 'No se solicitaron exámenes específicos.')}</p>
        </section>
      </div>
      ${referral.issuer_response ? `<p class="mt-3 text-sm"><strong>Respuesta anterior:</strong> ${escapeHtml(referral.issuer_response)}</p>` : ''}
      <form data-resubmit-form data-referral-id="${escapeHtml(referral.interconsulta_id)}" class="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4" novalidate>
        <h3 class="font-semibold">Completar y reenviar</h3>
        <label class="mt-3 block text-sm font-medium" for="issuer-response-${escapeHtml(referral.interconsulta_id)}">Respuesta a las observaciones</label>
        <textarea id="issuer-response-${escapeHtml(referral.interconsulta_id)}" name="issuerResponse" rows="3" maxlength="3000" class="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" placeholder="Describe las correcciones realizadas"></textarea>
        <label class="mt-3 block text-sm font-medium" for="added-exams-${escapeHtml(referral.interconsulta_id)}">Exámenes o antecedentes agregados</label>
        <textarea id="added-exams-${escapeHtml(referral.interconsulta_id)}" name="addedExams" rows="2" maxlength="3000" class="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" placeholder="Indica los exámenes que se agregan, si corresponde"></textarea>
        <p data-form-error class="mt-2 text-sm text-rose-700" role="alert"></p>
        <div class="mt-3 flex justify-end">
          <button type="submit" class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Reenviar a auditoría</button>
        </div>
      </form>
    </article>`).join('')
}

async function loadReturned() {
  loading = true
  error = ''
  renderList()
  try {
    referrals = await getReturnedReferrals()
  } catch (requestError) {
    error = requestError.message
  } finally {
    loading = false
    renderList()
  }
}

$('#returned-refresh').addEventListener('click', () => void loadReturned())
$('#returned-list').addEventListener('submit', async event => {
  const form = event.target.closest('[data-resubmit-form]')
  if (!form) return
  event.preventDefault()
  const values = Object.fromEntries(new FormData(form))
  if (!values.issuerResponse.trim() && !values.addedExams.trim()) {
    form.querySelector('[data-form-error]').textContent = 'Escribe una respuesta o indica los exámenes agregados.'
    return
  }
  const submit = form.querySelector('button[type="submit"]')
  submit.disabled = true
  submit.textContent = 'Enviando…'
  form.querySelector('[data-form-error]').textContent = ''
  try {
    const result = await resubmitReferral(form.dataset.referralId, values)
    $('#returned-notice').className = 'mt-4 text-sm text-emerald-800'
    $('#returned-notice').textContent = `${result.data.interconsulta_id} fue reenviada a la bandeja del médico auditor.`
    await loadReturned()
  } catch (requestError) {
    form.querySelector('[data-form-error]').textContent = requestError.message
    submit.disabled = false
    submit.textContent = 'Reenviar a auditoría'
  }
})

bindRoleSwitcher()
registerSW({ immediate: true })
void loadReturned()
