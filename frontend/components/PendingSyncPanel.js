const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]))

const dateTime = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function renderPendingSyncDetails(operations, slots, error) {
  if (error) {
    return `<p role="alert" class="text-sm text-amber-900">${escapeHtml(error)}</p>`
  }
  if (!operations.length) {
    return '<p class="text-sm text-slate-600">No hay interconsultas pendientes de subir al servidor.</p>'
  }

  return `<ul class="space-y-2">${operations.map(operation => {
    const slot = slots.find(item => item.id === operation.payload.cupoId)
    const queuedAt = dateTime.format(new Date(operation.queuedAt))
    return `<li class="rounded-lg border border-amber-200 bg-white p-3 text-sm">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p class="font-semibold">${escapeHtml(operation.payload.interconsultaId)}</p>
          <p class="mt-1 text-slate-700">${slot
            ? `${escapeHtml(slot.at.replace('T', ' '))} · ${escapeHtml(slot.est)} · ${escapeHtml(slot.doctor)}`
            : `Cupo solicitado: ${escapeHtml(operation.payload.cupoId)}`}</p>
          <p class="mt-1 text-xs text-slate-500">Encolada: ${escapeHtml(queuedAt)}</p>
        </div>
        <span class="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">Pendiente de envío</span>
      </div>
    </li>`
  }).join('')}</ul>`
}
