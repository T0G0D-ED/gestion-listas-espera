import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '../assets/style.css'
import { registerSW } from 'virtual:pwa-register'
import { appTemplate } from '../components/App.js'
import { renderPendingSyncDetails } from '../components/PendingSyncPanel.js'
import { renderReceiptModal } from '../components/ReceiptModal.js'
import { renderSelectionPanel } from '../components/SelectionPanel.js'
import { dismissSyncToast, showSyncToast } from '../components/SyncToast.js'
import {
  getCupos,
  getReservas,
  reservarCupo,
} from '../services/api.js'
import {
  enqueueReservation,
  getPendingSyncOperations,
  getPendingSyncCount,
  removePendingSyncOperation,
  subscribeToSyncQueueCount,
} from '../services/syncQueue.js'
import { downloadReceiptPdf } from '../services/receipt.js'

document.querySelector('#app').innerHTML = appTemplate

const $ = s => document.querySelector(s);
const store = {
  get: (k, d = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const state = {
  slots: [],
  filtered: [],
  page: 1,
  per: 4,
  selectedId: store.get('selectedId'),
  confirmed: store.get('confirmed'),
  loadError: null,
  reservationError: null,
  reservations: [],
  reservationsError: null,
  pendingOperations: [],
  pendingCount: 0,
  queueError: null,
  syncError: null,
  syncingQueue: false,
}
const exampleReferralIds = Array.from({ length: 16 }, (_, index) =>
  `IC-2026-${String(184 + index).padStart(6, '0')}`,
)
const initialReferralId = store.get('interconsultaId', exampleReferralIds[0])
let interconsultaId = exampleReferralIds.includes(initialReferralId)
  ? initialReferralId
  : exampleReferralIds[0]

const dtf = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });
const tf  = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
const long = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Datos y conectividad ----------
async function load() {
  try {
    state.slots = await getCupos();
    state.loadError = null;
    if (online()) store.set('lastSync', new Date().toISOString());
  } catch (error) {
    state.slots = [];
    state.loadError = error.message;
  }
  try {
    state.reservations = await getReservas()
    state.reservationsError = null
  } catch (error) {
    state.reservations = []
    state.reservationsError = error.message
  }
  await refreshPendingOperations()
  renderSync(); renderReferralContext(); populateEstablecimientos(); applyFilters();
}
const online = () => navigator.onLine;
async function refreshPendingOperations(count) {
  try {
    state.pendingOperations = await getPendingSyncOperations()
    state.pendingCount = Number.isInteger(count)
      ? count
      : await getPendingSyncCount()
    state.queueError = null
  } catch (error) {
    state.pendingOperations = []
    state.pendingCount = null
    state.queueError = error.message
  }
  renderPendingCount()
}
subscribeToSyncQueueCount(count => {
  void refreshPendingOperations(count).then(() => {
    renderReferralContext()
    renderPanel()
  })
})
async function syncPendingReservations() {
  if (!online() || state.syncingQueue) return
  state.syncingQueue = true
  let synchronizedCount = 0
  let failedCount = 0
  const errors = []
  try {
    const operations = await getPendingSyncOperations()
    state.syncError = null
    if (operations.length === 0) return

    for (const operation of operations) {
      if (operation.type !== 'reservation') {
        failedCount += 1
        errors.push(`${operation.payload?.interconsultaId || operation.id}: tipo de operación no compatible`)
        continue
      }
      try {
        await reservarCupo(operation.payload)
        await removePendingSyncOperation(operation.id)
        synchronizedCount += 1
      } catch (error) {
        failedCount += 1
        errors.push(`${operation.payload.interconsultaId}: ${error.message}`)
      }
    }
    await refreshPendingOperations()
    if (synchronizedCount > 0) await load()

    if (failedCount === 0) {
      showSyncToast({
        type: 'success',
        title: 'Sincronización completada',
        message: `Se sincronizaron ${synchronizedCount} ${synchronizedCount === 1 ? 'interconsulta' : 'interconsultas'} correctamente.`,
      })
      return
    }

    state.syncError = errors[0]
    showSyncToast({
      type: 'warning',
      title: 'Sincronización incompleta',
      message: `${synchronizedCount} sincronizadas; ${failedCount} ${failedCount === 1 ? 'sigue' : 'siguen'} pendiente${failedCount === 1 ? '' : 's'}. ${errors[0]}`,
    })
  } catch (error) {
    state.syncError = error.message
    await refreshPendingOperations()
    showSyncToast({
      type: 'warning',
      title: 'No se pudo completar la sincronización',
      message: `Las interconsultas continúan en la cola local. ${error.message}`,
    })
  } finally {
    state.syncingQueue = false
    renderPendingCount()
  }
}
function renderPendingCount() {
  const counter = $('#pending-sync-count')
  counter.textContent = state.pendingCount === null ? '—' : String(state.pendingCount)
  counter.title = state.queueError || ''
  const message = $('#sync-queue-message')
  message.textContent = state.queueError
    ? `No se pudo leer la cola local: ${state.queueError}`
    : state.syncError
      ? `Hay operaciones pendientes: ${state.syncError}`
      : ''
  message.hidden = !message.textContent
  renderPendingSyncPanel()
}
function renderPendingSyncPanel() {
  const details = $('#pending-sync-details')
  details.innerHTML = renderPendingSyncDetails(
    state.pendingOperations,
    state.slots,
    state.queueError,
  )
}
function renderReferralContext(message = '') {
  const reservedIds = new Set([
    ...state.reservations.map(reservation => reservation.interconsultaId),
    ...state.pendingOperations.map(operation => operation.payload.interconsultaId),
  ])
  const nextId = findNextReferralId(reservedIds)
  $('#current-referral-id').textContent = interconsultaId
  $('#next-referral').disabled = !nextId || Boolean(state.reservationsError)
  $('#referral-message').textContent = message || (
    state.reservationsError
      ? 'No se pudo comprobar qué interconsultas ya tienen cita.'
      : nextId
        ? reservedIds.has(interconsultaId)
          ? 'Esta interconsulta ya tiene una cita. Selecciona la siguiente para reservar otro ejemplo.'
          : 'Puedes avanzar para asignar otra interconsulta de ejemplo.'
        : 'No quedan interconsultas de ejemplo disponibles.'
  )
}
function findNextReferralId(reservedIds) {
  const currentIndex = exampleReferralIds.indexOf(interconsultaId)
  for (let offset = 1; offset < exampleReferralIds.length; offset += 1) {
    const candidate = exampleReferralIds[(currentIndex + offset) % exampleReferralIds.length]
    if (!reservedIds.has(candidate)) return candidate
  }
  return null
}
function renderSync() {
  const t = store.get('lastSync');
  $('#sync').textContent = t ? `${cap(dtf.format(new Date(t)))} · ${tf.format(new Date(t))}` : 'Sin datos sincronizados';
  $('#offline-banner').hidden = online();
  renderPanel();
}
addEventListener('online', () => {
  renderSync()
  void load().then(syncPendingReservations)
})
addEventListener('offline', renderSync);
$('#refresh').addEventListener('click', load);
$('#pending-sync-toggle').addEventListener('click', event => {
  const panel = $('#pending-sync-panel')
  panel.hidden = !panel.hidden
  event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden))
})
$('#sync-toast-close').addEventListener('click', dismissSyncToast)
$('#next-referral').addEventListener('click', () => {
  const reservedIds = new Set(state.reservations.map(reservation => reservation.interconsultaId))
  const nextId = findNextReferralId(reservedIds)
  if (!nextId) {
    renderReferralContext('No quedan interconsultas de ejemplo disponibles.')
    return
  }
  interconsultaId = nextId
  store.set('interconsultaId', interconsultaId)
  state.confirmed = null
  state.reservationError = null
  store.set('confirmed', null)
  renderReferralContext()
  renderPanel()
})

// ---------- Filtros ----------
function populateEstablecimientos() {
  const sel = $('#f-est'), cur = sel.value;
  sel.innerHTML = '<option value="">Todos los establecimientos</option>' +
    [...new Set(state.slots.map(s => s.est))].map(e => `<option ${e === cur ? 'selected' : ''}>${e}</option>`).join('');
}
function applyFilters() {
  const f = Object.fromEntries(new FormData($('#filters')));
  state.filtered = state.slots
    .filter(s => s.cupos > 0 && (!f.est || s.est === f.est) && (!f.mod || s.mod === f.mod)
      && (!f.desde || s.at.slice(0, 10) >= f.desde) && (!f.hasta || s.at.slice(0, 10) <= f.hasta))
    .sort((a, b) => a.at.localeCompare(b.at));
  state.page = 1; renderList();
}
$('#filters').addEventListener('submit', e => { e.preventDefault(); applyFilters(); });
$('#filters').addEventListener('reset', () => setTimeout(applyFilters));

// ---------- Render ----------
function renderList() {
  const { filtered: L, page, per } = state, pages = Math.max(1, Math.ceil(L.length / per));
  $('#res-title').textContent = `${L.length} cupos disponibles`;
  const slice = L.slice((page - 1) * per, page * per);
  if (slice.length) {
    $('#list').innerHTML = slice.map(row).join('');
  } else {
    const empty = document.createElement('li');
    empty.className = 'text-sm text-slate-500 p-6 text-center';
    empty.textContent = state.loadError || 'No hay cupos con estos criterios. Amplía el rango de fechas o quita filtros.';
    $('#list').replaceChildren(empty);
  }
  $('#range').textContent = L.length ? `Mostrando ${(page - 1) * per + 1}-${(page - 1) * per + slice.length} de ${L.length} cupos` : '';
  $('#pager').innerHTML = Array.from({ length: pages }, (_, i) => i + 1).map(n =>
    `<button data-page="${n}" ${n === page ? 'aria-current="page"' : ''} class="h-8 w-8 rounded-lg border ${n === page ? 'bg-brand text-white border-brand' : 'border-slate-300 hover:bg-slate-50'}">${n}</button>`).join('');
  renderPanel();
}
function row(s) {
  const d = new Date(s.at), sel = s.id === state.selectedId;
  return `<li><button role="radio" aria-checked="${sel}" data-id="${s.id}"
    class="w-full text-left grid grid-cols-[auto_72px_1fr_auto] md:grid-cols-[auto_72px_1.2fr_1.4fr_auto_auto_auto] items-center gap-3 rounded-xl border p-3 ${sel ? 'border-brand bg-brand-tint ring-1 ring-brand' : 'border-slate-200 hover:border-slate-300'}">
    <span class="h-5 w-5 rounded-full border-2 grid place-items-center ${sel ? 'border-brand' : 'border-slate-300'}">${sel ? '<span class="h-2.5 w-2.5 rounded-full bg-brand"></span>' : ''}</span>
    <span class="leading-tight"><span class="block text-[11px] font-semibold text-brand">${d.toLocaleDateString('es-CL', { weekday: 'short' })}</span><span class="block font-bold">${d.getDate()} ${d.toLocaleDateString('es-CL', { month: 'short' })}</span><span class="block font-bold">${tf.format(d)}</span></span>
    <span class="text-sm"><b class="block">${s.doctor}</b><span class="text-xs text-slate-500">Traumatología adulto</span></span>
    <span class="hidden md:block text-sm"><b class="block">${s.est}</b><span class="text-xs text-slate-500">${s.comuna} · Red Sur</span></span>
    <span class="hidden md:inline text-xs border rounded-full px-2 py-0.5 ${s.mod === 'Teleatención' ? 'bg-sky-50 border-sky-200 text-sky-800' : 'bg-slate-50 border-slate-200'}">${s.mod}</span>
    <span class="hidden md:block text-xs"><b class="text-emerald-700 block">${s.cupos} ${s.cupos > 1 ? 'cupos' : 'cupo'}</b><span class="text-slate-500">${s.min} min</span></span>
    <span class="text-sm font-medium rounded-lg px-3 py-1.5 border ${sel ? 'bg-brand text-white border-brand' : 'border-brand text-brand'}">${sel ? 'Elegido' : 'Elegir'}</span>
  </button></li>`;
}
function renderPanel() {
  const slot = state.slots.find(item => item.id === state.selectedId)
  const existingReservation = state.reservations.find(item =>
    item.interconsultaId === interconsultaId,
  )
  const pendingReservation = state.pendingOperations.find(operation =>
    operation.type === 'reservation'
    && operation.payload.interconsultaId === interconsultaId,
  )
  $('#panel').innerHTML = renderSelectionPanel({
    slot,
    online: online(),
    confirmed: state.confirmed,
    existingReservation,
    pendingReservation,
    reservationCheckError: state.reservationsError,
    timeFormat: tf,
    longDate: long,
    capitalize: cap,
  })
  const error = $('#reservation-error')
  error.textContent = state.reservationError || ''
  error.hidden = !state.reservationError
}
function openReceiptModal(slot, notification) {
  const receiptId = `CES-${Date.now()}`
  const date = cap(new Intl.DateTimeFormat('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(slot.at)))
  const time = tf.format(new Date(slot.at))
  $('#modal-root').innerHTML = renderReceiptModal({ slot, receiptId, date, time, notification })

  const dialog = $('#receipt-modal')
  const previewToggle = $('#receipt-preview-toggle')
  const preview = $('#receipt-preview')
  previewToggle.addEventListener('click', () => {
    preview.hidden = !preview.hidden
    previewToggle.setAttribute('aria-expanded', String(!preview.hidden))
    previewToggle.textContent = preview.hidden ? 'Previsualizar comprobante' : 'Ocultar vista previa'
  })
  $('#receipt-download').addEventListener('click', () => downloadReceiptPdf(slot, receiptId))
  $('#receipt-close').addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close()
  })
  dialog.showModal()
}

// ---------- Eventos ----------
$('#list').addEventListener('click', e => {
  const b = e.target.closest('[data-id]'); if (!b) return;
  state.selectedId = b.dataset.id; state.confirmed = null;
  store.set('selectedId', state.selectedId); store.set('confirmed', null); renderList();
});
$('#pager').addEventListener('click', e => { const n = e.target.dataset.page; if (n) { state.page = +n; renderList(); } });
$('#panel').addEventListener('click', async e => {
  if (e.target.id === 'change') { state.selectedId = null; store.set('selectedId', null); renderList(); }
  if (e.target.id === 'confirm') {
    const slot = state.slots.find(item => item.id === state.selectedId)
    if (!slot) return
    e.target.disabled = true; e.target.textContent = 'Confirmando…';
    state.reservationError = null
    const reservation = {
      cupoId: slot.id,
      interconsultaId,
      centroSolicitante: 'CESFAM Nuevo Horizonte',
    }
    try {
      if (!online()) {
        await enqueueReservation(reservation)
        await refreshPendingOperations()
        renderReferralContext()
        renderList()
        return
      }
      const result = await reservarCupo(reservation)
      const updatedSlot = { ...slot, ...result.data.slot }
      state.slots = state.slots.map(item => item.id === slot.id ? updatedSlot : item)
      try {
        state.reservations = await getReservas()
        state.reservationsError = null
      } catch (error) {
        state.reservationsError = error.message
      }
      state.confirmed = slot.id
      store.set('confirmed', state.confirmed)
      renderReferralContext()
      renderList()
      openReceiptModal(updatedSlot, result.data.notification)
    } catch (error) {
      state.reservationError = error.message
      if (error.status === 409) await load()
      renderPanel()
    }
  }
});

registerSW({ immediate: true })
void load().then(syncPendingReservations)
