import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resubmitReturnedInterconsulta,
  reviewInterconsulta,
} from './cuposRepository.js'
import { createApp } from './app.js'

function createWorkflowPool(initialStatus = 'pending') {
  const row = {
    interconsulta_id: 'IC-2026-000184',
    status: initialStatus,
    issuer_establishment: 'CESFAM Nuevo Horizonte',
    issuer_professional: 'Profesional emisor de demostración',
    observations: null,
    missing_exams: null,
    rejection_reason: null,
    issuer_response: null,
    added_exams: null,
  }
  const events = []
  const originalInterconsulta = { referralText: 'Contenido original inmutable para esta prueba.' }

  return {
    row,
    events,
    originalInterconsulta,
    async connect() {
      return {
        async query(sql, values = []) {
          const statement = sql.replace(/\s+/g, ' ').trim().toUpperCase()
          if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(statement)) {
            return { rows: [], rowCount: 0 }
          }
          if (statement.startsWith('SELECT INTERCONSULTA_ID, STATUS, ISSUER_ESTABLISHMENT')) {
            return values[0] === row.interconsulta_id
              ? { rows: [{ ...row }], rowCount: 1 }
              : { rows: [], rowCount: 0 }
          }
          if (statement.startsWith('UPDATE INTERCONSULTA_REVIEW_WORKFLOW SET STATUS = $2')) {
            const [, status, observations, missingExams, reason] = values
            Object.assign(row, {
              status,
              observations,
              missing_exams: missingExams,
              rejection_reason: reason,
            })
            return { rows: [{ ...row }], rowCount: 1 }
          }
          if (statement.startsWith("UPDATE INTERCONSULTA_REVIEW_WORKFLOW SET STATUS = 'PENDING'")) {
            const [, issuerResponse, addedExams] = values
            Object.assign(row, {
              status: 'pending',
              issuer_response: issuerResponse,
              added_exams: addedExams,
            })
            return { rows: [{ ...row }], rowCount: 1 }
          }
          if (statement.startsWith('INSERT INTO INTERCONSULTA_TIMELINE_EVENTS')) {
            events.push(values)
            return { rows: [], rowCount: 1 }
          }
          throw new Error(`Unexpected query: ${statement}`)
        },
        release() {},
      }
    },
  }
}

const auditor = { name: 'Dr. Kosme Fulanito', role: 'medico' }
const issuer = { name: 'María Fernández', role: 'administrativo' }

test('return stores observations and missing exams without changing referral source, and is one-way until resubmission', async () => {
  const pool = createWorkflowPool()
  const original = structuredClone(pool.originalInterconsulta)
  const result = await reviewInterconsulta(pool, {
    interconsultaId: 'IC-2026-000184',
    decision: 'return',
    observations: 'Precisar evolución de síntomas.',
    missingExams: 'Agregar radiografía.',
    actor: auditor,
  })

  assert.equal(result.status, 200)
  assert.equal(pool.row.status, 'returned')
  assert.equal(pool.row.observations, 'Precisar evolución de síntomas.')
  assert.equal(pool.row.missing_exams, 'Agregar radiografía.')
  assert.deepEqual(pool.originalInterconsulta, original)
  assert.equal(result.data.notification.interconsultaId, 'IC-2026-000184')
  assert.equal(pool.events[0][1], 'returned')
  assert.equal(pool.events[0][8], true)

  const duplicateReview = await reviewInterconsulta(pool, {
    interconsultaId: 'IC-2026-000184',
    decision: 'reject',
    reason: 'No pertinente.',
    actor: auditor,
  })
  assert.equal(duplicateReview.status, 409)
})

test('final rejection records justification and cannot be resubmitted', async () => {
  const pool = createWorkflowPool()
  const result = await reviewInterconsulta(pool, {
    interconsultaId: 'IC-2026-000184',
    decision: 'reject',
    reason: 'Derivación fuera de criterio clínico.',
    actor: auditor,
  })

  assert.equal(result.status, 200)
  assert.equal(pool.row.status, 'rejected')
  assert.equal(pool.row.rejection_reason, 'Derivación fuera de criterio clínico.')
  assert.equal(result.data.notification, null)
  const resubmission = await resubmitReturnedInterconsulta(pool, {
    interconsultaId: 'IC-2026-000184',
    issuerResponse: 'Respuesta.',
    addedExams: '',
    actor: issuer,
  })
  assert.equal(resubmission.status, 409)
})

test('CESFAM response and added exams resubmit the returned referral while preserving the original observations', async () => {
  const pool = createWorkflowPool('returned')
  Object.assign(pool.row, {
    observations: 'Aclarar antecedente.',
    missing_exams: 'Adjuntar examen.',
  })
  const result = await resubmitReturnedInterconsulta(pool, {
    interconsultaId: 'IC-2026-000184',
    issuerResponse: 'Se aclara antecedente.',
    addedExams: 'Informe de examen adjunto.',
    actor: issuer,
  })

  assert.equal(result.status, 200)
  assert.equal(pool.row.status, 'pending')
  assert.equal(pool.row.observations, 'Aclarar antecedente.')
  assert.equal(pool.row.missing_exams, 'Adjuntar examen.')
  assert.equal(pool.row.issuer_response, 'Se aclara antecedente.')
  assert.equal(pool.row.added_exams, 'Informe de examen adjunto.')
  assert.equal(pool.events[0][1], 'resubmitted')
  assert.equal(pool.events[0][8], true)
})

test('return and CESFAM resubmission routes use demo roles and trigger test notification', async t => {
  const pool = createWorkflowPool()
  const originalQuery = pool.query
  pool.query = async (sql, values) => {
    if (sql.includes('FROM interconsulta_review_workflow AS workflow')) {
      return {
        rows: pool.row.status === 'returned' ? [{ ...pool.row }] : [],
        rowCount: pool.row.status === 'returned' ? 1 : 0,
      }
    }
    return originalQuery ? originalQuery(sql, values) : { rows: [], rowCount: 0 }
  }
  let notification
  const app = createApp(pool, {
    async notifyReferralReturn(value) {
      notification = value
      return { sent: true, recipient: 'test@example.com', messageId: 'return-mail' }
    },
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  const returned = await fetch(`${baseUrl}/api/interconsultas/IC-2026-000184/devolver`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Demo-Profile': 'medico' },
    body: JSON.stringify({ observations: 'Completar antecedentes.', missingExams: 'Agregar examen.' }),
  })
  const returnBody = await returned.json()
  assert.equal(returned.status, 200)
  assert.equal(returnBody.data.status, 'returned')
  assert.equal(returnBody.data.notification.sent, true)
  assert.equal(notification.issuerProfessional, 'Profesional emisor de demostración')

  const inbox = await fetch(`${baseUrl}/api/interconsultas/devueltas`, {
    headers: { 'X-Demo-Profile': 'administrativo' },
  })
  assert.equal(inbox.status, 200)
  assert.equal((await inbox.json()).data.length, 1)

  const resubmitted = await fetch(`${baseUrl}/api/interconsultas/IC-2026-000184/reenviar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Demo-Profile': 'administrativo' },
    body: JSON.stringify({ issuerResponse: 'Antecedentes completados.', addedExams: 'Informe cargado.' }),
  })
  assert.equal(resubmitted.status, 200)
  const resubmittedBody = await resubmitted.json()
  assert.equal(resubmittedBody.data.status, 'pending')
  assert.equal(resubmittedBody.data.observations, 'Completar antecedentes.')
  assert.equal(resubmittedBody.data.issuer_response, 'Antecedentes completados.')
})
