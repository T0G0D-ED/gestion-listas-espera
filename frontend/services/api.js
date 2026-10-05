const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

async function request(path, options = {}) {
  let demoProfile = 'administrativo'
  try {
    demoProfile = localStorage.getItem('demoProfile') || demoProfile
  } catch {}
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      'X-Demo-Profile': demoProfile,
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

export async function getInterconsultaTimeline(interconsultaId) {
  const result = await request(
    `/api/interconsultas/${encodeURIComponent(interconsultaId)}/linea-tiempo`,
    { cache: 'no-store' },
  )
  if (!Array.isArray(result.data)) {
    throw new Error('La API no devolvió el historial de la interconsulta.')
  }
  return result.data
}

export async function getDemoPatients() {
  const result = await request('/api/pacientes/ruts-demostracion', { cache: 'no-store' })
  if (!Array.isArray(result.data)) {
    throw new Error('La API no devolvió los RUTs de demostración.')
  }
  return result.data
}

export async function getPatientTimelineByRut(rut) {
  const query = new URLSearchParams({ rut })
  const result = await request(`/api/pacientes/linea-tiempo?${query}`, { cache: 'no-store' })
  if (!Array.isArray(result.data) || typeof result.interconsultaId !== 'string') {
    throw new Error('La API no devolvió la línea de tiempo asociada al RUT.')
  }
  return result
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
  if (!Array.isArray(result.data)) {
    throw new Error('La API no devolvió la lista de citas tomadas.')
  }
  return result.data.map(reservation => ({
    ...reservation,
    reservationId: reservation.reservationId ?? reservation.reservation_id,
    cupoId: reservation.cupoId ?? reservation.slot_id,
    interconsultaId: reservation.interconsultaId ?? reservation.interconsulta_id,
    centroSolicitante: reservation.centroSolicitante ?? reservation.centro_solicitante,
  }))
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

export async function reprogramarReserva(reservationId, reason, motivo) {
  const details = typeof reason === 'object' && reason !== null
    ? reason
    : { cupoId: reason, motivo }
  return request(`/api/reservas/${encodeURIComponent(reservationId)}/reprogramar`, {
    method: 'PATCH',
    body: JSON.stringify(details),
  })
}

export async function cancelarReserva(reservationId, reason, otroMotivo) {
  const details = typeof reason === 'object' && reason !== null
    ? reason
    : { motivo: reason, otroMotivo }
  return request(`/api/reservas/${encodeURIComponent(reservationId)}/cancelar`, {
    method: 'PATCH',
    body: JSON.stringify(details),
  })
}
