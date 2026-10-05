import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '../assets/style.css'
import { registerSW } from 'virtual:pwa-register'
import { bindRoleSwitcher, renderHeader } from '../components/Header.js'
import { getAuditableReferrals, reviewReferral } from '../services/api.js'

document.querySelector('#app').innerHTML = `
  ${renderHeader('interconsultas')}
  <main class="mx-auto max-w-6xl px-4 py-6">
    <section class="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-brand">Bandeja del médico auditor</p>
          <h1 class="mt-1 text-2xl font-bold text-slate-900">Interconsultas</h1>
          <p class="mt-1 text-sm text-slate-600">Revisa la pertinencia y devuelve con observaciones o rechaza definitivamente con justificación.</p>
        </div>
        <button id="audit-refresh" type="button" class="rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand hover:bg-brand-tint">Actualizar</button>
      </div>
      <p id="audit-notice" class="mt-4 text-sm" role="status" aria-live="polite"></p>
      <div id="audit-list" class="mt-4 grid gap-3" aria-live="polite"></div>
    </section>
  </main>
  <dialog id="audit-dialog" aria-labelledby="audit-dialog-title" class="fixed left-1/2 top-1/2 m-0 w-[calc(100%-2rem)] max-w-xl max-h-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border-0 p-0 backdrop:bg-slate-900/50">
    <form id="audit-form" class="p-5 sm:p-6" novalidate>
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase text-brand">Revisión de pertinencia</p>
          <h2 id="audit-dialog-title" class="mt-1 text-xl font-semibold"></h2>
        </div>
        <button type="button" id="audit-close" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Cerrar</button>
      </div>
      <p id="audit-dialog-error" class="mt-4 text-sm text-rose-700" role="alert"></p>
      <section id="return-fields" class="mt-4 space-y-4">
        <p class="text-sm text-slate-600">Registra al menos una observación o un examen faltante. El CESFAM podrá responder y reenviar la interconsulta.</p>
        <label class="block text-sm font-medium" for="audit-observations">Observaciones al profesional emisor</label>
        <textarea id="audit-observations" name="observations" rows="4" maxlength="3000" class="w-full rounded-lg border border-slate-300 p-3 text-sm" placeholder="Explica qué antecedente o corrección se necesita"></textarea>
        <label class="block text-sm font-medium" for="audit-missing-exams">Exámenes o antecedentes faltantes</label>
        <textarea id="audit-missing-exams" name="missingExams" rows="3" maxlength="3000" class="w-full rounded-lg border border-slate-300 p-3 text-sm" placeholder="Indica los exámenes requeridos, si corresponde"></textarea>
      </section>
      <section id="reject-fields" class="mt-4" hidden>
        <p class="text-sm text-rose-800">El rechazo es definitivo: el CESFAM no podrá editar ni reenviar esta interconsulta.</p>
        <label class="mt-3 block text-sm font-medium" for="audit-reason">Justificación obligatoria</label>
        <textarea id="audit-reason" name="reason" rows="4" maxlength="3000" class="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm" placeholder="Justifica por qué la interconsulta no es pertinente"></textarea>
      </section>
      <div class="mt-5 flex justify-end gap-2">
        <button type="submit" id="audit-submit" class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"></button>
      </div>
    </form>
  </dialog>`

const $ = selector => document.querySelector(selector)
bindRoleSwitcher()
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]))
const state = { referrals: [], loading: false, error: '', decision: '', interconsultaId: '' }

function renderList() {
  const list = $('#audit-list')
  if (state.loading) {
    list.innerHTML = '<p class="text-sm text-slate-500">Cargando interconsultas…</p>'
    return
  }
  if (state.error) {
    list.innerHTML = `<p class="rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">${escapeHtml(state.error)}</p>`
    return
  }
  if (!state.referrals.length) {
    list.innerHTML = '<p class="text-sm text-slate-500">No hay interconsultas de demostración asignadas.</p>'
    return
  }
  const statusLabels = { pending: 'Pendiente de auditoría', returned: 'Devuelta al CESFAM', rejected: 'Rechazada definitivamente' }
  list.innerHTML = state.referrals.map(referral => {
    const reviewable = referral.status === 'pending'
    const previousDecision = referral.observations || referral.missing_exams || referral.rejection_reason
    return `<article class="rounded-xl border border-slate-200 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="font-semibold text-slate-900">${escapeHtml(referral.interconsulta_id)}</h2>
          <p class="mt-1 text-sm text-slate-600">${escapeHtml(referral.issuer_establishment)} · ${escapeHtml(referral.issuer_professional)}</p>
          <p class="mt-2 text-xs font-medium ${referral.status === 'rejected' ? 'text-rose-700' : referral.status === 'returned' ? 'text-amber-800' : 'text-slate-600'}">${statusLabels[referral.status] || escapeHtml(referral.status)}</p>
          ${previousDecision ? `<p class="mt-2 text-sm text-slate-700">${escapeHtml(referral.observations || referral.rejection_reason || referral.missing_exams)}</p>` : ''}
        </div>
        ${reviewable ? `<div class="flex flex-wrap gap-2"><button type="button" data-audit-action="return" data-referral-id="${escapeHtml(referral.interconsulta_id)}" class="rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand hover:bg-brand-tint">Devolver</button><button type="button" data-audit-action="reject" data-referral-id="${escapeHtml(referral.interconsulta_id)}" class="rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">Rechazar definitivamente</button></div>` : ''}
      </div>
    </article>`
  }).join('')
}

async function loadReferrals() {
  state.loading = true
  state.error = ''
  renderList()
  try {
    state.referrals = await getAuditableReferrals()
  } catch (error) {
    state.error = error.message
  } finally {
    state.loading = false
    renderList()
  }
}

$('#audit-list').addEventListener('click', event => {
  const button = event.target.closest('[data-audit-action]')
  if (!button) return
  state.decision = button.dataset.auditAction
  state.interconsultaId = button.dataset.referralId
  $('#audit-dialog-title').textContent = `${state.decision === 'return' ? 'Devolver' : 'Rechazar definitivamente'} · ${state.interconsultaId}`
  $('#return-fields').hidden = state.decision !== 'return'
  $('#reject-fields').hidden = state.decision !== 'reject'
  $('#audit-submit').textContent = state.decision === 'return' ? 'Devolver al CESFAM' : 'Confirmar rechazo definitivo'
  $('#audit-dialog-error').textContent = ''
  $('#audit-form').reset()
  $('#audit-dialog').showModal()
})
$('#audit-refresh').addEventListener('click', () => void loadReferrals())
$('#audit-close').addEventListener('click', () => $('#audit-dialog').close())
$('#audit-form').addEventListener('submit', async event => {
  event.preventDefault()
  const values = Object.fromEntries(new FormData(event.currentTarget))
  const returnHasContent = values.observations.trim() || values.missingExams.trim()
  if (state.decision === 'return' && !returnHasContent) {
    $('#audit-dialog-error').textContent = 'Escribe observaciones o indica los exámenes faltantes.'
    return
  }
  if (state.decision === 'reject' && !values.reason.trim()) {
    $('#audit-dialog-error').textContent = 'La justificación del rechazo es obligatoria.'
    $('#audit-reason').focus()
    return
  }
  const submit = $('#audit-submit')
  submit.disabled = true
  submit.textContent = 'Guardando…'
  try {
    const { data } = await reviewReferral(state.interconsultaId, state.decision, values)
    $('#audit-dialog').close()
    $('#audit-notice').className = `mt-4 text-sm ${data.notification?.sent === false ? 'text-amber-800' : 'text-emerald-800'}`
    $('#audit-notice').textContent = state.decision === 'return'
      ? data.notification?.sent
        ? `Interconsulta devuelta. Aviso enviado al correo de prueba ${data.notification.recipient}.`
        : `Interconsulta devuelta. ${data.notification?.error || 'No se confirmó el envío del correo de prueba.'}`
      : 'Interconsulta rechazada definitivamente y cerrada. La justificación quedó registrada.'
    await loadReferrals()
  } catch (error) {
    $('#audit-dialog-error').textContent = error.message
  } finally {
    submit.disabled = false
    submit.textContent = state.decision === 'return' ? 'Devolver al CESFAM' : 'Confirmar rechazo definitivo'
  }
})
$('#audit-dialog').addEventListener('click', event => {
  if (event.target === $('#audit-dialog')) $('#audit-dialog').close()
})

registerSW({ immediate: true })
void loadReferrals()
