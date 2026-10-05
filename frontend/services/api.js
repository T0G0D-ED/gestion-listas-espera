const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(payload.error || 'No fue posible completar la solicitud.')
    error.status = response.status
    throw error
  }

  return payload
}

export async function getCupos() {
  const result = await request('/api/cupos', { cache: 'no-store' })
  if (!Array.isArray(result.data)) {
    throw new Error('La API no devolvió cupos. Verifica que el backend esté iniciado y que /api/cupos responda JSON.')
  }
  return result.data
}

export async function reservarCupo({
  cupoId,
  interconsultaId,
  centroSolicitante,
  especialidad = 'Traumatología adulto',
  prioridadClinica = 0,
}) {
  return request('/api/cupos/reservar', {
    method: 'POST',
    body: JSON.stringify({ cupoId, interconsultaId, centroSolicitante, especialidad, prioridadClinica }),
  })
}

export async function getReservas() {
  const result = await request('/api/reservas', { cache: 'no-store' })
  return result.data
}

export async function getListaEspera() {
  const result = await request('/api/lista-espera', { cache: 'no-store' })
  return result.data
}

export async function agregarAListaEspera({ interconsultaId, especialidad, centroSolicitante, prioridadClinica, motivo }) {
  return request('/api/lista-espera', {
    method: 'POST',
    body: JSON.stringify({ interconsultaId, especialidad, centroSolicitante, prioridadClinica, motivo }),
  })
}

export async function cancelarReserva(reservationId, motivo) {
  return request(`/api/reservas/${encodeURIComponent(reservationId)}/cancelar`, {
    method: 'PATCH',
    body: JSON.stringify({ motivo }),
  })
}

export async function reprogramarReserva(reservationId, cupoId, motivo) {
  return request(`/api/reservas/${encodeURIComponent(reservationId)}/reprogramar`, {
    method: 'PATCH',
    body: JSON.stringify({ cupoId, motivo }),
  })
}
