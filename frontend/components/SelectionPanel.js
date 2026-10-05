const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]))

export function renderSelectionPanel({
  slot,
  online,
  confirmed,
  existingReservation,
  reservationCheckError,
  timeFormat,
  longDate,
  capitalize,
}) {
  if (!slot) {
    return '<h2 class="font-semibold text-base">Cupo seleccionado</h2><p id="reservation-error" hidden role="alert" class="mt-3 rounded-lg bg-warn-bg text-warn-ink p-2 text-xs"></p><p class="text-slate-500 mt-2">Elige un cupo de la lista para revisarlo antes de confirmar.</p>'
  }

  const date = new Date(slot.at)
  const isConfirmed = confirmed === slot.id

  const available = slot.cupos > 0
  const hasExistingReservation = Boolean(existingReservation)

  return `<h2 class="font-semibold text-base">Cupo seleccionado</h2><p class="text-xs text-slate-500">Revisa antes de confirmar</p>
    <p id="reservation-error" hidden role="alert" class="mt-3 rounded-lg bg-warn-bg text-warn-ink p-2 text-xs"></p>
    <div class="mt-3 rounded-lg bg-brand-tint p-3"><p class="text-xs">${capitalize(longDate.format(date))}</p><p class="text-2xl font-bold">${timeFormat.format(date)}</p></div>
    <ul class="mt-3 space-y-1"><li><span class="text-xs text-slate-500 block">Especialista</span><b>${slot.doctor}</b></li><li><span class="text-xs text-slate-500 block">Establecimiento</span><b>${slot.est}</b></li><li><span class="text-xs text-slate-500 block">Box</span><b>${slot.box}</b></li><li>${slot.mod} · Traslado estimado ${slot.min} min</li></ul>
    ${hasExistingReservation ? `<p class="mt-3 rounded-lg bg-amber-50 text-amber-900 p-3 text-xs">Esta interconsulta ya tiene una cita activa: <strong>${escapeHtml(existingReservation.est)}</strong>, ${capitalize(longDate.format(new Date(existingReservation.at)))} a las ${timeFormat.format(new Date(existingReservation.at))}. Para cambiarla o cancelarla, <a class="font-semibold underline" href="/reservas.html">gestiona la cita en Cupos tomados</a>.</p>`
      : reservationCheckError ? `<p role="alert" class="mt-3 rounded-lg bg-warn-bg text-warn-ink p-2 text-xs">${reservationCheckError} Actualiza la página antes de reservar.</p>`
      : isConfirmed ? '<p class="mt-3 rounded-lg bg-emerald-50 text-emerald-800 p-2 text-xs font-medium">Hora confirmada. Ya puedes informar al paciente.</p>'
      : !online ? '<p class="mt-3 rounded-lg bg-warn-bg text-warn-ink p-2 text-xs">Conéctate a la red asistencial para confirmar este cupo.</p>'
        : !available ? '<p class="mt-3 rounded-lg bg-warn-bg text-warn-ink p-2 text-xs">Este cupo ya fue reservado en otro centro.</p>' : ''}
    ${hasExistingReservation
      ? '<a href="/reservas.html" class="mt-3 block w-full rounded-lg bg-brand px-4 py-2 text-center font-medium text-white hover:bg-brand-dark">Gestionar cita existente</a>'
      : `<button id="confirm" ${online && available && !isConfirmed && !reservationCheckError ? '' : 'disabled'} class="mt-3 w-full rounded-lg py-2 font-medium ${online && available && !isConfirmed && !reservationCheckError ? 'bg-brand text-white hover:bg-brand-dark' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}">${isConfirmed ? 'Selección confirmada' : 'Confirmar selección'}</button>`}
    <button id="change" class="mt-2 w-full rounded-lg py-2 font-medium border border-brand text-brand">Cambiar cupo</button>`
}
