const resendEndpoint = 'https://api.resend.com/emails'
const testSender = 'Red Salud Pública <onboarding@resend.dev>'

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]))
}

function formatAppointmentDate(value) {
  const [date, time = '00:00:00'] = value.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const appointmentDate = new Date(Date.UTC(year, month - 1, day, hour, minute))
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(appointmentDate)
}

function appointmentDetails(slot) {
  return [
    `Fecha y hora: ${formatAppointmentDate(slot.at)}`,
    `Hospital: ${slot.est}`,
    `Profesional: ${slot.doctor}`,
    `Modalidad: ${slot.mod}`,
    `Box: ${slot.box}`,
  ]
}

export async function sendAppointmentNotification({
  action,
  interconsultaId,
  centroSolicitante,
  previousSlot,
  nextSlot,
  reason,
}, { apiKey = process.env.RESEND_API_KEY, recipient = process.env.RESEND_TEST_EMAIL, fetchImpl = fetch } = {}) {
  if (!apiKey?.trim() || !recipient?.trim()) {
    throw new Error('Configura RESEND_API_KEY y RESEND_TEST_EMAIL en el archivo .env.')
  }

  const isReschedule = action === 'rescheduled'
  const isCancellation = action === 'cancelled'
  const subject = isReschedule
    ? `Cita reprogramada · ${interconsultaId}`
    : isCancellation
      ? `Cita cancelada · ${interconsultaId}`
      : `Cita reservada · ${interconsultaId}`
  const details = isReschedule
    ? `<h2>Nueva cita</h2><ul>${appointmentDetails(nextSlot).map(detail => `<li>${escapeHtml(detail)}</li>`).join('')}</ul><h2>Cita anterior</h2><ul>${appointmentDetails(previousSlot).map(detail => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>`
    : `<h2>${isCancellation ? 'Cita cancelada' : 'Cita reservada'}</h2><ul>${appointmentDetails(previousSlot).map(detail => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>`
  const html = `<main><p>Se informa una actualización de la cita de la interconsulta <strong>${escapeHtml(interconsultaId)}</strong>.</p>${details}<p>Centro solicitante: ${escapeHtml(centroSolicitante)}</p>${reason ? `<p>Motivo: ${escapeHtml(reason)}</p>` : ''}<p>Este mensaje fue enviado a una dirección de prueba configurada para el sistema.</p></main>`

  const response = await fetchImpl(resendEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: testSender,
      to: [recipient.trim()],
      subject,
      html,
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = typeof payload?.message === 'string' ? `: ${payload.message}` : ''
    throw new Error(`Resend devolvió HTTP ${response.status}${detail}`)
  }

  return { sent: true, recipient: recipient.trim(), messageId: payload?.id ?? null }
}
