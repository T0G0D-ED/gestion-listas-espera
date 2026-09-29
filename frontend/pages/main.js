import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '../assets/style.css'
import { registerSW } from 'virtual:pwa-register'
import { appTemplate } from '../components/App.js'
import { renderSelectionPanel } from '../components/SelectionPanel.js'

document.querySelector('#app').innerHTML = appTemplate

const $ = s => document.querySelector(s);
const store = {
  get: (k, d = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const state = { slots: [], filtered: [], page: 1, per: 4, selectedId: store.get('selectedId'), confirmed: store.get('confirmed') };

const dtf = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });
const tf  = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
const long = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Datos y conectividad ----------
async function load() {
  try {
    const res = await fetch('/cupos.json', { cache: 'no-store' });
    state.slots = await res.json();
    // Solo se actualiza la marca de sincronización si los datos vinieron de la red
    if (!res.headers.get('x-from-cache') && res.ok) store.set('lastSync', new Date().toISOString());
  } catch { state.slots = []; }
  renderSync(); populateEstablecimientos(); applyFilters();
}
const online = () => navigator.onLine;
function renderSync() {
  const t = store.get('lastSync');
  $('#sync').textContent = t ? `${cap(dtf.format(new Date(t)))} · ${tf.format(new Date(t))}` : 'Sin datos sincronizados';
  $('#offline-banner').hidden = online();
  renderPanel();
}
addEventListener('online', () => { renderSync(); load(); });
addEventListener('offline', renderSync);
$('#refresh').addEventListener('click', load);

// ---------- Filtros ----------
function populateEstablecimientos() {
  const sel = $('#f-est'), cur = sel.value;
  sel.innerHTML = '<option value="">Todos los establecimientos</option>' +
    [...new Set(state.slots.map(s => s.est))].map(e => `<option ${e === cur ? 'selected' : ''}>${e}</option>`).join('');
}
function applyFilters() {
  const f = Object.fromEntries(new FormData($('#filters')));
  state.filtered = state.slots
    .filter(s => (!f.est || s.est === f.est) && (!f.mod || s.mod === f.mod)
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
  $('#list').innerHTML = slice.length ? slice.map(row).join('') : '<li class="text-sm text-slate-500 p-6 text-center">No hay cupos con estos criterios. Amplía el rango de fechas o quita filtros.</li>';
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
  $('#panel').innerHTML = renderSelectionPanel({
    slot,
    online: online(),
    confirmed: state.confirmed,
    timeFormat: tf,
    longDate: long,
    capitalize: cap,
  })
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
  if (e.target.id === 'confirm' && online()) {
    e.target.disabled = true; e.target.textContent = 'Confirmando…';
    // TODO: reemplazar por POST real a la API de agendamiento
    await new Promise(r => setTimeout(r, 600));
    state.confirmed = state.selectedId; store.set('confirmed', state.confirmed); renderPanel();
  }
});

registerSW({ immediate: true })
load();
