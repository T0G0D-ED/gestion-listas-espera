export function renderReceiptModal({ slot, receiptId, date, time }) {
  return `<dialog id="receipt-modal" aria-labelledby="receipt-title" class="fixed left-1/2 top-1/2 m-0 w-[calc(100%-2rem)] max-w-lg max-h-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border-0 p-0 backdrop:bg-slate-900/50">
    <div class="p-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase text-brand">Confirmación de cita</p>
          <h2 id="receipt-title" class="mt-1 text-xl font-semibold">Comprobante generado</h2>
        </div>
        <button type="button" id="receipt-close" aria-label="Cerrar comprobante" class="rounded-lg border px-3 py-1 text-sm hover:bg-slate-50">Cerrar</button>
      </div>
      <p class="mt-3 text-sm text-slate-600">El comprobante fue enviado a la dirección de correo asociada al paciente.</p>
      <div class="mt-4 flex flex-wrap gap-2">
        <button type="button" id="receipt-preview-toggle" aria-expanded="false" aria-controls="receipt-preview" class="rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-brand-tint">Previsualizar comprobante</button>
        <button type="button" id="receipt-download" class="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Descargar PDF</button>
      </div>
      <article id="receipt-preview" hidden class="mt-5 rounded-lg border border-slate-200 bg-white p-5" aria-label="Vista previa del comprobante">
        <div class="border-b border-slate-200 pb-3">
          <p class="text-xs font-semibold uppercase text-brand">Red Salud Pública</p>
          <h3 class="mt-1 text-lg font-semibold">Comprobante de cita</h3>
          <p class="mt-1 text-xs text-slate-500">Folio ${receiptId}</p>
        </div>
        <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt class="text-xs text-slate-500">Fecha</dt><dd class="font-medium">${date}</dd></div>
          <div><dt class="text-xs text-slate-500">Hora</dt><dd class="font-medium">${time}</dd></div>
          <div><dt class="text-xs text-slate-500">Hospital / establecimiento</dt><dd class="font-medium">${slot.est}</dd></div>
          <div><dt class="text-xs text-slate-500">Box</dt><dd class="font-medium">${slot.box}</dd></div>
          <div class="sm:col-span-2"><dt class="text-xs text-slate-500">Profesional</dt><dd class="font-medium">${slot.doctor}</dd></div>
        </dl>
      </article>
    </div>
  </dialog>`
}