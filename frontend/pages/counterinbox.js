import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '../assets/style.css'
import { registerSW } from 'virtual:pwa-register'
import { bindRoleSwitcher, refreshCounterReferralBadge, renderHeader } from '../components/Header.js'
import { getCesfamCounterReferrals, markCounterReferralRead } from '../services/api.js'
import { downloadCounterReferralPdf } from '../services/counterReferralPdf.js'

document.querySelector('#app').innerHTML = `
  ${renderHeader('contrarreferidas')}
  <main class="mx-auto max-w-6xl px-4 py-6">
    <section class="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-brand">Bandeja del CESFAM</p>
          <h1 class="mt-1 text-2xl font-bold text-slate-900">Interconsultas contrarreferidas</h1>
          <p class="mt-1 text-sm text-slate-600">Resultados de la atención de especialidad. Las no leídas aparecen primero y suman al contador del menú.</p>
        </div>
        <button id="inbox-refresh" type="button" class="rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand hover:bg-brand-tint">Actualizar</button>
      </div>
      <p id="inbox-notice" class="mt-4 text-sm" role="status" aria-live="polite"></p>
      <div id="inbox-list" class="mt-4 grid gap-4" aria-live="polite"></div>
    </section>
  </main>`

const $ = selector => document.querySelector(selector)
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]))
const formatDateTime = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Fecha no disponible'
    : new Intl.DateTimeFormat('es-CL', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date)
}
const state = { items: [], loading: false, error: '' }

function block(title, text) {
  return `<section class="rounded-lg bg-slate-50 p-3"><h3 class="text-sm font-semibold">${title}</h3><p class="mt-1 whitespace-pre-wrap text-sm text-slate-700">${escapeHtml(text)}</p></section>`
}

function renderList() {
  const list = $('#inbox-list')
  if (state.loading) {
    list.innerHTML = '<p class="text-sm text-slate-500">Cargando contrarreferencias…</p>'
    return
  }
  if (state.error) {
    list.innerHTML = `<p role="alert" class="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">${escapeHtml(state.error)}</p>`
    return
  }
  if (!state.items.length) {
    list.innerHTML = '<p class="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Aún no llegan contrarreferencias al CESFAM.</p>'
    return
  }
  list.innerHTML = state.items.map(item => {
    const unread = !item.read_at
    const id = escapeHtml(item.interconsulta_id)
    return `<article class="rounded-xl border ${unread ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200 bg-white'} p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="font-semibold text-slate-900">${id}</h2>
            ${unread
    ? '<span class="rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">Sin leer</span>'
    : '<span class="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-900">Leída</span>'}
            <span class="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-800">Finalizada · Contra-derivada</span>
          </div>
          <p class="mt-1 text-xs text-slate-600">${escapeHtml(item.issuer_establishment)} · Especialista: ${escapeHtml(item.specialist_name)} · Recibida: ${escapeHtml(formatDateTime(item.created_at))}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          ${unread ? `<button type="button" data-action="read" data-id="${id}" class="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white">Marcar como leída</button>` : ''}
          <button type="button" data-action="pdf" data-id="${id}" class="rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand hover:bg-brand-tint">Descargar PDF</button>
        </div>
      </div>
      <div class="mt-3 grid gap-3 sm:grid-cols-3">
        ${block('Diagnóstico final', item.final_diagnosis)}
        ${block('Indicaciones', item.indications)}
        ${block('Plan terapéutico', item.therapeutic_plan)}
      </div>
      ${item.observations ? `<p class="mt-3 text-sm"><strong>Observaciones:</strong> ${escapeHtml(item.observations)}</p>` : ''}
    </article>`
  }).join('')
}

async function load() {
  state.loading = true
  state.error = ''
  renderList()
  try {
    state.items = await getCesfamCounterReferrals()
  } catch (error) {
    state.error = error.message
  } finally {
    state.loading = false
    renderList()
    void refreshCounterReferralBadge()
  }
}

function notify(message, tone = 'ok') {
  const notice = $('#inbox-notice')
  notice.className = `mt-4 text-sm ${tone === 'ok' ? 'text-emerald-800' : 'text-rose-700'}`
  notice.textContent = message
}

$('#inbox-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-action]')
  if (!button) return
  const id = button.dataset.id
  button.disabled = true
  try {
    if (button.dataset.action === 'read') {
      await markCounterReferralRead(id)
      notify(`${id} marcada como leída.`)
      await load()
      return
    }
    const item = state.items.find(candidate => candidate.interconsulta_id === id)
    if (item) await downloadCounterReferralPdf(item)
  } catch (error) {
    notify(error.message, 'error')
  } finally {
    button.disabled = false
  }
})
$('#inbox-refresh').addEventListener('click', () => void load())

bindRoleSwitcher()
registerSW({ immediate: true })
void load()