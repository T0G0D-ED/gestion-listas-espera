import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '../assets/style.css'
import { registerSW } from 'virtual:pwa-register'
import { bindRoleSwitcher, renderHeader } from '../components/Header.js'
import { createCounterReferral, getCounterReferrals } from '../services/api.js'

const MAX_LENGTH = 3000
const requiredFields = [
  { name: 'finalDiagnosis', label: 'Diagnóstico final', rows: 3, placeholder: 'Diagnóstico establecido tras la atención de especialidad' },
  { name: 'indications', label: 'Indicaciones', rows: 4, placeholder: 'Indicaciones para el CESFAM y para el paciente (controles, exámenes, cuidados)' },
  { name: 'therapeuticPlan', label: 'Plan terapéutico', rows: 4, placeholder: 'Tratamiento propuesto, fármacos, seguimiento y criterios de nueva derivación' },
]

const textarea = ({ name, label, rows, placeholder }) => `
  <div>
    <label class="block text-sm font-medium" for="cr-${name}">${label} <span class="text-rose-700" aria-hidden="true">*</span></label>
    <textarea id="cr-${name}" name="${name}" rows="${rows}" maxlength="${MAX_LENGTH}" required aria-required="true" aria-describedby="cr-${name}-error cr-${name}-count" class="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" placeholder="${placeholder}"></textarea>
    <div class="mt-1 flex justify-between gap-3 text-xs">
      <p id="cr-${name}-error" class="text-rose-700" role="alert"></p>
      <p id="cr-${name}-count" class="shrink-0 text-slate-500">0 / ${MAX_LENGTH}</p>
    </div>
  </div>`

document.querySelector('#app').innerHTML = `
  ${renderHeader('contrarreferencia')}
  <main class="mx-auto max-w-6xl px-4 py-6">
    <section class="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <p class="text-sm font-semibold text-brand">Atención secundaria</p>
      <h1 class="mt-1 text-2xl font-bold text-slate-900">Formulario de contrarreferencia</h1>
      <p class="mt-1 text-sm text-slate-600">Informa al CESFAM de origen el resultado de la atención de especialidad. Los campos marcados con <span class="text-rose-700">*</span> son obligatorios.</p>
      <p id="cr-role-warning" class="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status" hidden>Este formulario es del perfil médico. Cambia de rol desde el menú de la esquina superior derecha para registrarlo.</p>
      <p id="cr-notice" class="mt-4 text-sm" role="status" aria-live="polite"></p>
      <form id="cr-form" class="mt-5 grid gap-4" novalidate>
        <div>
          <label class="block text-sm font-medium" for="cr-interconsultaId">Interconsulta <span class="text-rose-700" aria-hidden="true">*</span></label>
          <select id="cr-interconsultaId" name="interconsultaId" required aria-required="true" aria-describedby="cr-interconsultaId-error" class="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm sm:max-w-md"></select>
          <p id="cr-interconsultaId-error" class="mt-1 text-xs text-rose-700" role="alert"></p>
          <p id="cr-referral-info" class="mt-1 text-xs text-slate-600"></p>
        </div>
        ${requiredFields.map(textarea).join('')}
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="block text-sm font-medium" for="cr-attentionDate">Fecha de atención <span class="font-normal text-slate-500">(opcional)</span></label>
            <input id="cr-attentionDate" name="attentionDate" type="date" aria-describedby="cr-attentionDate-error" class="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm">
            <p id="cr-attentionDate-error" class="mt-1 text-xs text-rose-700" role="alert"></p>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium" for="cr-observations">Observaciones para el CESFAM <span class="font-normal text-slate-500">(opcional)</span></label>
          <textarea id="cr-observations" name="observations" rows="3" maxlength="${MAX_LENGTH}" aria-describedby="cr-observations-count" class="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" placeholder="Información adicional útil para el equipo de atención primaria"></textarea>
          <p id="cr-observations-count" class="mt-1 text-right text-xs text-slate-500">0 / ${MAX_LENGTH}</p>
        </div>
        <p id="cr-form-error" class="text-sm text-rose-700" role="alert"></p>
        <div class="flex flex-wrap justify-end gap-2">
          <button type="reset" class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Limpiar</button>
          <button type="submit" id="cr-submit" class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Registrar contrarreferencia</button>
        </div>
      </form>
    </section>
    <section class="mt-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <h2 class="text-lg font-semibold text-slate-900">Contrarreferencias registradas</h2>
        <button id="cr-refresh" type="button" class="rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand hover:bg-brand-tint">Actualizar</button>
      </div>
      <div id="cr-list" class="mt-4 grid gap-3" aria-live="polite"></div>
    </section>
  </main>`

const $ = selector => document.querySelector(selector)
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]))
const state = { referrals: [], loading: false, error: '' }
const form = $('#cr-form')

function isDoctor() {
  try {
    return localStorage.getItem('appRole') === 'medico'
  } catch {
    return false
  }
}

function pending() {
  return state.referrals.filter(item => !item.final_diagnosis && item.status === 'pending')
}

function done() {
  return state.referrals.filter(item => item.final_diagnosis)
}

function updateCount(field) {
  const counter = $(`#cr-${field.name}-count`)
  if (counter) counter.textContent = `${field.value.length} / ${MAX_LENGTH}`
}

function setFieldError(name, message) {
  const error = $(`#cr-${name}-error`)
  const field = form.elements[name]
  if (error) error.textContent = message
  if (field) field.toggleAttribute('aria-invalid', Boolean(message))
}

function clearErrors() {
  for (const name of ['interconsultaId', 'finalDiagnosis', 'indications', 'therapeuticPlan', 'attentionDate']) {
    setFieldError(name, '')
  }
  $('#cr-form-error').textContent = ''
}

function renderSelect() {
  const select = $('#cr-interconsultaId')
  const options = pending()
  select.innerHTML = options.length
    ? `<option value="">Selecciona una interconsulta</option>${options.map(item => `<option value="${escapeHtml(item.interconsulta_id)}">${escapeHtml(item.interconsulta_id)} · ${escapeHtml(item.issuer_establishment)}</option>`).join('')}`
    : '<option value="">No hay interconsultas disponibles</option>'
  $('#cr-referral-info').textContent = ''
}

function renderList() {
  const list = $('#cr-list')
  if (state.loading) {
    list.innerHTML = '<p class="text-sm text-slate-500">Cargando contrarreferencias…</p>'
    return
  }
  if (state.error) {
    list.innerHTML = `<p class="rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">${escapeHtml(state.error)}</p>`
    return
  }
  const items = done()
  if (!items.length) {
    list.innerHTML = '<p class="text-sm text-slate-500">Aún no se registran contrarreferencias.</p>'
    return
  }
  const block = (title, text) => `<section class="rounded-lg bg-slate-50 p-3"><h3 class="text-sm font-semibold">${title}</h3><p class="mt-1 whitespace-pre-wrap text-sm text-slate-700">${escapeHtml(text)}</p></section>`
  list.innerHTML = items.map(item => {
    const date = item.attention_date ? ` · Atención: ${escapeHtml(item.attention_date.split('-').reverse().join('-'))}` : ''
    return `<article class="rounded-xl border border-emerald-200 p-4">
      <h3 class="font-semibold text-slate-900">${escapeHtml(item.interconsulta_id)}</h3>
      <p class="mt-1 text-xs text-slate-600">Destino: ${escapeHtml(item.issuer_establishment)} · Registrada por ${escapeHtml(item.specialist_name)}${date}</p>
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
    state.referrals = await getCounterReferrals()
  } catch (error) {
    state.error = error.message
  } finally {
    state.loading = false
    renderSelect()
    renderList()
  }
}

function validate(values) {
  let valid = true
  if (!values.interconsultaId) {
    setFieldError('interconsultaId', 'Selecciona la interconsulta.')
    valid = false
  }
  for (const field of requiredFields) {
    if (!values[field.name].trim()) {
      setFieldError(field.name, `Completa el campo ${field.label.toLowerCase()}.`)
      valid = false
    }
  }
  if (values.attentionDate && values.attentionDate > new Date().toLocaleDateString('en-CA')) {
    setFieldError('attentionDate', 'La fecha de atención no puede ser futura.')
    valid = false
  }
  return valid
}

form.addEventListener('input', event => {
  const field = event.target
  if (field.name && $(`#cr-${field.name}-count`)) updateCount(field)
  if (field.name && $(`#cr-${field.name}-error`)) setFieldError(field.name, '')
})
form.addEventListener('reset', () => {
  setTimeout(() => {
    clearErrors()
    for (const field of form.elements) if (field.name) updateCount(field)
    $('#cr-referral-info').textContent = ''
  })
})
$('#cr-interconsultaId').addEventListener('change', event => {
  const referral = pending().find(item => item.interconsulta_id === event.target.value)
  $('#cr-referral-info').textContent = referral
    ? `Emisor: ${referral.issuer_professional} · ${referral.issuer_establishment}`
    : ''
})
form.addEventListener('submit', async event => {
  event.preventDefault()
  clearErrors()
  if (!isDoctor()) {
    $('#cr-form-error').textContent = 'Solo el perfil médico puede registrar la contrarreferencia.'
    return
  }
  const values = Object.fromEntries(new FormData(form))
  if (!validate(values)) {
    form.querySelector('[aria-invalid]')?.focus()
    return
  }
  const submit = $('#cr-submit')
  submit.disabled = true
  submit.textContent = 'Guardando…'
  try {
    const { interconsultaId, ...details } = values
    await createCounterReferral(interconsultaId, details)
    form.reset()
    $('#cr-notice').className = 'mt-4 text-sm text-emerald-800'
    $('#cr-notice').textContent = `Contrarreferencia de ${interconsultaId} registrada. Quedó anotada en la línea de tiempo.`
    await load()
  } catch (error) {
    $('#cr-form-error').textContent = error.message
  } finally {
    submit.disabled = false
    submit.textContent = 'Registrar contrarreferencia'
  }
})
$('#cr-refresh').addEventListener('click', () => void load())

$('#cr-attentionDate').max = new Date().toLocaleDateString('en-CA')
if (!isDoctor()) $('#cr-role-warning').hidden = false
bindRoleSwitcher()
registerSW({ immediate: true })
void load()