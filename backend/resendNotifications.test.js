import assert from 'node:assert/strict'
import test from 'node:test'
import {
  sendAppointmentNotification,
  sendReferralReturnNotification,
} from './resendNotifications.js'

const cancellation = {
  action: 'cancelled',
  interconsultaId: 'IC-2026-000184',
  centroSolicitante: 'CESFAM <Norte>',
  previousSlot: {
    at: '2026-10-05T10:30:00',
    est: 'Hospital Central',
    doctor: 'Dra. Prueba',
    mod: 'Presencial',
    box: 'Box 2',
  },
  reason: 'Otro: cambio de horario',
}

test('notification is sent only to the configured test recipient', async () => {
  let request
  const result = await sendAppointmentNotification(cancellation, {
    apiKey: 'test-api-key',
    recipient: 'test@example.com',
    fetchImpl: async (url, options) => {
      request = { url, options }
      return { ok: true, async json() { return { id: 'email-test-id' } } }
    },
  })
  const body = JSON.parse(request.options.body)

  assert.equal(result.sent, true)
  assert.equal(result.messageId, 'email-test-id')
  assert.deepEqual(body.to, ['test@example.com'])
  assert.equal(body.from, 'Red Salud Pública <onboarding@resend.dev>')
  assert.equal(request.options.headers.Authorization, 'Bearer test-api-key')
  assert.match(body.html, /CESFAM &lt;Norte&gt;/)
  assert.match(body.html, /cambio de horario/)
})

test('reservation email template contains dynamic appointment details and confirmation links', async () => {
  let request
  const originalBaseUrl = process.env.PUBLIC_APP_URL
  process.env.PUBLIC_APP_URL = 'https://salud.example.test/'
  try {
    await sendAppointmentNotification({
      action: 'reserved',
      interconsultaId: 'IC-2026-000184',
      centroSolicitante: 'CESFAM <Norte>',
      previousSlot: cancellation.previousSlot,
      attendanceToken: 'a'.repeat(43),
    }, {
      apiKey: 'test-api-key',
      recipient: 'test@example.com',
      fetchImpl: async (url, options) => {
        request = { url, options }
        return { ok: true, async json() { return { id: 'email-test-id' } } }
      },
    })
  } finally {
    if (originalBaseUrl === undefined) delete process.env.PUBLIC_APP_URL
    else process.env.PUBLIC_APP_URL = originalBaseUrl
  }

  const body = JSON.parse(request.options.body)
  assert.match(body.html, /Cita reservada/)
  assert.match(body.html, /Hospital Central/)
  assert.match(body.html, /Dra\. Prueba/)
  assert.match(body.html, /CESFAM &lt;Norte&gt;/)
  assert.match(body.html, /Confirmar asistencia/)
  assert.match(body.html, /Cancelar asistencia/)
  assert.match(body.html, /https:\/\/salud\.example\.test\/asistencia\.html\?token=a{43}&amp;decision=confirmed/)
  assert.match(body.html, /decision=cancelled/)
})

test('Resend rejection is reported to the caller', async () => {
  await assert.rejects(
    sendAppointmentNotification(cancellation, {
      apiKey: 'test-api-key',
      recipient: 'test@example.com',
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        async json() { return { message: 'Invalid API key' } },
      }),
    }),
    /HTTP 401/,
  )
})

test('missing test recipient prevents sending', async () => {
  await assert.rejects(
    sendAppointmentNotification(cancellation, {
      apiKey: 'test-api-key',
      recipient: '',
      fetchImpl: async () => {
        throw new Error('Resend must not be contacted without a recipient.')
      },
    }),
    /RESEND_TEST_EMAIL/,
  )
})

test('returned-referral notification goes only to the configured test address and escapes review text', async () => {
  let request
  const result = await sendReferralReturnNotification({
    interconsultaId: 'IC-2026-000184',
    issuerEstablishment: 'CESFAM <Norte>',
    issuerProfessional: 'Profesional de prueba',
    observations: 'Aclarar <antecedente>.',
    missingExams: 'Radiografía & informe',
  }, {
    apiKey: 'test-api-key',
    recipient: 'test@example.com',
    fetchImpl: async (url, options) => {
      request = { url, options }
      return { ok: true, async json() { return { id: 'return-email-id' } } }
    },
  })
  const body = JSON.parse(request.options.body)

  assert.equal(result.sent, true)
  assert.equal(result.messageId, 'return-email-id')
  assert.deepEqual(body.to, ['test@example.com'])
  assert.match(body.subject, /IC-2026-000184/)
  assert.match(body.html, /CESFAM &lt;Norte&gt;/)
  assert.match(body.html, /Aclarar &lt;antecedente&gt;/)
  assert.match(body.html, /Radiografía &amp; informe/)
})
