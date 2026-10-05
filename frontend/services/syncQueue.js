const databaseName = 'cesfam-offline'
const storeName = 'pending-operations'
const channel = typeof BroadcastChannel === 'undefined'
  ? null
  : new BroadcastChannel('cesfam-sync-queue')

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir la cola local.'))
  })
}

async function withStore(mode, operation) {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode)
      const store = transaction.objectStore(storeName)
      let result
      try {
        result = operation(store)
      } catch (error) {
        reject(error)
        return
      }
      transaction.oncomplete = () => resolve(result?.result ?? result)
      transaction.onerror = () => reject(transaction.error ?? new Error('Falló la operación en la cola local.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Se canceló la operación en la cola local.'))
    })
  } finally {
    database.close()
  }
}

async function broadcastQueueCount() {
  const count = await getPendingSyncCount()
  const message = { type: 'queue-count', count }
  window.dispatchEvent(new CustomEvent('sync-queue-count', { detail: message }))
  channel?.postMessage(message)
  return count
}

export async function getPendingSyncCount() {
  return withStore('readonly', store => store.count())
}

export async function getPendingSyncOperations() {
  return withStore('readonly', store => store.getAll())
}

export async function enqueueReservation(reservation) {
  const database = await openDatabase()
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      const getAll = store.getAll()
      getAll.onsuccess = () => {
        const duplicate = getAll.result.some(operation =>
          operation.type === 'reservation'
          && operation.payload.interconsultaId === reservation.interconsultaId,
        )
        if (duplicate) {
          transaction.abort()
          reject(new Error('Esta interconsulta ya está pendiente de sincronización en este dispositivo.'))
          return
        }

        store.add({
          id: crypto.randomUUID(),
          type: 'reservation',
          payload: reservation,
          queuedAt: new Date().toISOString(),
        })
      }
      getAll.onerror = () => reject(getAll.error ?? new Error('No se pudo consultar la cola local.'))
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error ?? new Error('No se pudo guardar la operación pendiente.'))
      transaction.onabort = () => {
        if (!duplicateOperation(getAll.result, reservation.interconsultaId)) {
          reject(transaction.error ?? new Error('Se canceló el guardado en la cola local.'))
        }
      }
    })
  } finally {
    database.close()
  }
  await broadcastQueueCount()
}

function duplicateOperation(operations = [], interconsultaId) {
  return operations.some(operation =>
    operation.type === 'reservation'
    && operation.payload.interconsultaId === interconsultaId,
  )
}

export async function removePendingSyncOperation(id) {
  await withStore('readwrite', store => store.delete(id))
  await broadcastQueueCount()
}

export function subscribeToSyncQueueCount(listener) {
  const onWindowMessage = event => listener(event.detail.count)
  const onChannelMessage = event => {
    if (event.data?.type === 'queue-count') listener(event.data.count)
  }
  window.addEventListener('sync-queue-count', onWindowMessage)
  channel?.addEventListener('message', onChannelMessage)
  return () => {
    window.removeEventListener('sync-queue-count', onWindowMessage)
    channel?.removeEventListener('message', onChannelMessage)
  }
}
