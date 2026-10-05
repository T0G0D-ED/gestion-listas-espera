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
  attendanceToken,
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
  let attendanceActions = ''
  if (!isCancellation) {
    if (typeof attendanceToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(attendanceToken)) {
      throw new Error('No se pudo crear un enlace seguro para responder la asistencia.')
    }
    const publicAppUrl = new URL(process.env.PUBLIC_APP_URL || 'http://localhost:5173')
    if (!['http:', 'https:'].includes(publicAppUrl.protocol) || !publicAppUrl.hostname) {
      throw new Error('PUBLIC_APP_URL debe ser una URL HTTP o HTTPS válida.')
    }
    const baseUrl = publicAppUrl.href.replace(/\/+$/, '')
    const confirmationUrl = `${baseUrl}/asistencia.html?token=${encodeURIComponent(attendanceToken)}&decision=confirmed`
    const cancellationUrl = `${baseUrl}/asistencia.html?token=${encodeURIComponent(attendanceToken)}&decision=cancelled`
    attendanceActions = `<section><h2>Confirma o cancela tu asistencia</h2><p>Al abrir un enlace podrás revisar la cita y confirmar la acción antes de que se registre.</p><p><a href="${escapeHtml(confirmationUrl)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border-radius:6px;background:#0f5c55;color:#fff;text-decoration:none">Confirmar asistencia</a><a href="${escapeHtml(cancellationUrl)}" style="display:inline-block;padding:12px 18px;border-radius:6px;background:#fff;color:#9f1239;border:1px solid #9f1239;text-decoration:none">Cancelar asistencia</a></p><p>Si los botones no funcionan, copia este enlace: <a href="${escapeHtml(confirmationUrl)}">${escapeHtml(confirmationUrl)}</a></p></section>`
  }
  const html = `<main><p>Se informa una actualización de la cita de la interconsulta <strong>${escapeHtml(interconsultaId)}</strong>.</p>${details}<p>Centro solicitante: ${escapeHtml(centroSolicitante)}</p>${reason ? `<p>Motivo: ${escapeHtml(reason)}</p>` : ''}${attendanceActions}<p>Este mensaje fue enviado a una dirección de prueba configurada para el sistema.</p></main>`

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

export async function sendReferralReturnNotification({
  interconsultaId,
  issuerEstablishment,
  issuerProfessional,
  observations,
  missingExams,
}, { apiKey = process.env.RESEND_API_KEY, recipient = process.env.RESEND_TEST_EMAIL, fetchImpl = fetch } = {}) {
  if (!apiKey?.trim() || !recipient?.trim()) {
    throw new Error('Configura RESEND_API_KEY y RESEND_TEST_EMAIL en el archivo .env.')
  }

  const optionalDetails = [
    observations ? `<h2>Observaciones del auditor</h2><p>${escapeHtml(observations)}</p>` : '',
    missingExams ? `<h2>Exámenes solicitados</h2><p>${escapeHtml(missingExams)}</p>` : '',
  ].join('')
  const response = await fetchImpl(resendEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `******`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: testSender,
      to: [recipient.trim()],
      subject: `Interconsulta devuelta · ${interconsultaId}`,
      html: `<main><p>El médico auditor devolvió la interconsulta <strong>${escapeHtml(interconsultaId)}</strong> al equipo emisor para correcciones.</p><p>Establecimiento emisor: ${escapeHtml(issuerEstablishment)}</p><p>Profesional emisor: ${escapeHtml(issuerProfessional)}</p>${optionalDetails}<p>Este mensaje fue enviado a una dirección de prueba configurada para el sistema.</p></main>`,
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = typeof payload?.message === 'string' ? `: ${payload.message}` : ''
    throw new Error(`Resend devolvió HTTP ${response.status}${detail}`)
  }

  return { sent: true, recipient: recipient.trim(), messageId: payload?.id ?? null }
}
