export const syncToastTemplate = `
<div id="sync-toast" class="fixed right-4 top-4 z-50 hidden w-[calc(100%-2rem)] max-w-md rounded-xl border p-4 shadow-lg" role="status" aria-live="polite">
  <div class="flex items-start justify-between gap-4">
    <div>
      <p id="sync-toast-title" class="font-semibold"></p>
      <p id="sync-toast-message" class="mt-1 text-sm"></p>
    </div>
    <button id="sync-toast-close" type="button" class="shrink-0 rounded-md px-2 py-1 text-sm font-medium hover:bg-black/5" aria-label="Cerrar notificación">Cerrar</button>
  </div>
</div>`

let dismissTimer

export function showSyncToast({ type, title, message }) {
  const toast = document.querySelector('#sync-toast')
  const titleElement = document.querySelector('#sync-toast-title')
  const messageElement = document.querySelector('#sync-toast-message')
  if (!toast || !titleElement || !messageElement) return

  clearTimeout(dismissTimer)
  toast.className = `fixed right-4 top-4 z-50 w-[calc(100%-2rem)] max-w-md rounded-xl border p-4 shadow-lg ${
    type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : 'border-amber-300 bg-amber-50 text-amber-950'
  }`
  toast.setAttribute('role', type === 'success' ? 'status' : 'alert')
  toast.setAttribute('aria-live', type === 'success' ? 'polite' : 'assertive')
  titleElement.textContent = title
  messageElement.textContent = message
  toast.hidden = false
  dismissTimer = setTimeout(() => {
    toast.hidden = true
  }, 8000)
}

export function dismissSyncToast() {
  clearTimeout(dismissTimer)
  const toast = document.querySelector('#sync-toast')
  if (toast) toast.hidden = true
}
