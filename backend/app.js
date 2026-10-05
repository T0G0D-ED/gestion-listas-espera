import cors from 'cors'
import express from 'express'
import {
  cancelReservation,
  addToWaitlist,
  getAttendanceRequest,
  listReservations,
  listSlots,
  listTimelineEvents,
  listAuditableReferrals,
  listReturnedReferrals,
  listWaitlist,
  reserveSlot,
  resubmitReturnedInterconsulta,
  reviewInterconsulta,
  rescheduleReservation,
  respondToAttendance,
} from './cuposRepository.js'
import {
  sendAppointmentNotification,
  sendReferralReturnNotification,
} from './resendNotifications.js'
import {
  demoInterconsultaIds,
  demoPatients,
  findDemoPatientByRut,
  isRutFormatValid,
} from './demoPatients.js'

const defaultOrigins = [
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:4174',
  'http://127.0.0.1:4174',
  'http://localhost:4175',
  'http://127.0.0.1:4175',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

function validReservationId(value) {
  return /^\d+$/.test(value)
}

function getDemoActor(req) {
  return req.get('x-demo-profile') === 'medico'
    ? { name: 'Dr. Kosme Fulanito (perfil de desarrollo)', role: 'medico' }
    : { name: 'María Fernández (perfil de desarrollo)', role: 'administrativo' }
}

function requireDemoRole(req, res, role) {
  if (req.get('x-demo-profile') === role) return true
  res.status(403).json({ error: 'Esta operación no está disponible para el perfil seleccionado.' })
  return false
}

function validDemoReferralId(value) {
  return demoInterconsultaIds.includes(value)
}

function getReason(body = {}) {
  const { motivo, otroMotivo } = body
  if (typeof motivo !== 'string' || !motivo.trim()) return null
  if (motivo.trim() !== 'Otro') return motivo.trim()
  if (typeof otroMotivo !== 'string' || !otroMotivo.trim()) return null
  return `Otro: ${otroMotivo.trim()}`
}

function databaseError(res, error) {
  console.error('Error de base de datos:', error.message)
  const unavailable = error.code?.startsWith('08') || error.code === 'ECONNREFUSED'
  const outdatedSchema = error.code === '42703' || error.code === '42P01'
  return res.status(unavailable ? 503 : 500).json({
    error: unavailable
      ? 'La base central no está disponible. Intenta nuevamente.'
      : outdatedSchema
        ? 'El esquema de la base está desactualizado. Ejecuta npm run db:migrate y reinicia el backend.'
      : 'No fue posible completar la operación.',
  })
}

async function deliverNotification(notification, notify) {
  try {
    const delivery = await notify(notification)
    console.info(`Notificación de cita enviada por Resend (${notification.action}).`)
    return delivery
  } catch (error) {
    console.error('No se pudo enviar la notificación por Resend:', error.message)
    return {
      sent: false,
      error: 'La cita se actualizó, pero no se pudo enviar el correo de prueba. Revisa la configuración de Resend.',
    }
  }
}

async function deliverReferralReturnNotification(notification, notify) {
  try {
    return await notify(notification)
  } catch (error) {
    console.error('No se pudo enviar el aviso de devolución por Resend:', error.message)
    return {
      sent: false,
      error: 'La interconsulta se devolvió, pero no se pudo enviar el correo de prueba. Revisa la configuración de Resend.',
    }
  }
}

export function createApp(pool, {
  notify = sendAppointmentNotification,
  notifyReferralReturn = sendReferralReturnNotification,
} = {}) {
  const app = express()
  const configuredOrigins = (process.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
  const allowedOrigins = new Set([...defaultOrigins, ...configuredOrigins])

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true)
      return callback(new Error('Origen no permitido'))
    },
  }))
  app.use(express.json({ limit: '32kb' }))

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1')
      res.json({ status: 'ok', database: 'connected' })
    } catch (error) {
      databaseError(res, error)
    }
  })

  app.get('/api/cupos', async (_req, res) => {
    try {
      const data = await listSlots(pool)
      res.json({ total: data.length, data })
    } catch (error) {
      databaseError(res, error)
    }
  })

  app.get('/api/reservas', async (req, res) => {
    try {
      const interconsultaIds = req.get('x-demo-profile') === 'medico' ? demoInterconsultaIds : null
      const data = await listReservations(pool, { interconsultaIds })
      return res.json({ total: data.length, data })
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.get('/api/citas/asistencia/:token', async (req, res) => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(req.params.token)) {
      return res.status(400).json({ error: 'El enlace de respuesta no es válido.' })
    }
    try {
      const result = await getAttendanceRequest(pool, req.params.token)
      const { status, ...body } = result
      return res.status(status).json(body)
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.post('/api/citas/asistencia/:token', async (req, res) => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(req.params.token)) {
      return res.status(400).json({ error: 'El enlace de respuesta no es válido.' })
    }
    const { response } = req.body ?? {}
    if (!['confirmed', 'cancelled'].includes(response)) {
      return res.status(400).json({ error: 'Selecciona confirmar o cancelar la asistencia.' })
    }
    try {
      const result = await respondToAttendance(pool, {
        token: req.params.token,
        response,
      })
      const { status, ...body } = result
      return res.status(status).json(body)
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.get('/api/lista-espera', async (_req, res) => {
    try {
      const data = await listWaitlist(pool)
      return res.json({ total: data.length, data })
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.get('/api/interconsultas/:id/linea-tiempo', async (req, res) => {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(req.params.id)) {
      return res.status(400).json({ error: 'El identificador de interconsulta no es válido.' })
    }
    try {
      const data = await listTimelineEvents(pool, req.params.id)
      return res.json({
        interconsultaId: req.params.id,
        data,
        includesDemoEvents: data.some(event => event.is_demo),
        accessMode: 'prototipo-sin-autenticacion',
      })
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.get('/api/interconsultas/auditoria', async (req, res) => {
    if (!requireDemoRole(req, res, 'medico')) return
    try {
      const data = await listAuditableReferrals(pool)
      return res.json({ total: data.length, data, demo: true })
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.get('/api/interconsultas/devueltas', async (req, res) => {
    if (!requireDemoRole(req, res, 'administrativo')) return
    try {
      const data = await listReturnedReferrals(pool)
      return res.json({ total: data.length, data, demo: true })
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.post('/api/interconsultas/:id/devolver', async (req, res) => {
    if (!requireDemoRole(req, res, 'medico')) return
    if (!validDemoReferralId(req.params.id)) {
      return res.status(404).json({ error: 'No se encontró la interconsulta asignada al médico auditor.' })
    }
    const { observations, missingExams = '' } = req.body ?? {}
    if (![observations, missingExams].every(value => typeof value === 'string')
      || (!observations.trim() && !missingExams.trim())
      || observations.length > 3000 || missingExams.length > 3000) {
      return res.status(400).json({
        error: 'Escribe observaciones o indica los exámenes faltantes. Cada campo admite hasta 3000 caracteres.',
      })
    }

    try {
      const result = await reviewInterconsulta(pool, {
        interconsultaId: req.params.id,
        decision: 'return',
        observations: observations.trim(),
        missingExams: missingExams.trim(),
        actor: getDemoActor(req),
      })
      if (result.data?.notification) {
        result.data.notification = await deliverReferralReturnNotification(
          result.data.notification,
          notifyReferralReturn,
        )
      }
      const { status, ...body } = result
      return res.status(status).json(body)
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.post('/api/interconsultas/:id/rechazar', async (req, res) => {
    if (!requireDemoRole(req, res, 'medico')) return
    if (!validDemoReferralId(req.params.id)) {
      return res.status(404).json({ error: 'No se encontró la interconsulta asignada al médico auditor.' })
    }
    const { reason } = req.body ?? {}
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 3000) {
      return res.status(400).json({ error: 'Debes justificar el rechazo definitivo (máximo 3000 caracteres).' })
    }

    try {
      const result = await reviewInterconsulta(pool, {
        interconsultaId: req.params.id,
        decision: 'reject',
        reason: reason.trim(),
        actor: getDemoActor(req),
      })
      const { status, ...body } = result
      return res.status(status).json(body)
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.post('/api/interconsultas/:id/reenviar', async (req, res) => {
    if (!requireDemoRole(req, res, 'administrativo')) return
    if (!validDemoReferralId(req.params.id)) {
      return res.status(404).json({ error: 'No se encontró la interconsulta devuelta.' })
    }
    const { issuerResponse, addedExams = '' } = req.body ?? {}
    if (![issuerResponse, addedExams].every(value => typeof value === 'string')
      || (!issuerResponse.trim() && !addedExams.trim())
      || issuerResponse.length > 3000 || addedExams.length > 3000) {
      return res.status(400).json({
        error: 'Escribe una respuesta o los exámenes agregados antes de reenviar (máximo 3000 caracteres por campo).',
      })
    }

    try {
      const result = await resubmitReturnedInterconsulta(pool, {
        interconsultaId: req.params.id,
        issuerResponse: issuerResponse.trim(),
        addedExams: addedExams.trim(),
        actor: getDemoActor(req),
      })
      const { status, ...body } = result
      return res.status(status).json(body)
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.get('/api/pacientes/ruts-demostracion', (_req, res) => {
    res.json({
      data: demoPatients.map(({ rut, interconsultaId }) => ({ rut, interconsultaId })),
      demo: true,
    })
  })

  app.get('/api/pacientes/linea-tiempo', async (req, res) => {
    const { rut } = req.query
    if (!isRutFormatValid(rut)) {
      return res.status(400).json({ error: 'Ingresa un RUT con formato válido.' })
    }
    const patient = findDemoPatientByRut(rut)
    if (!patient) {
      return res.status(404).json({ error: 'No encontramos una interconsulta asociada a ese RUT de demostración.' })
    }
    try {
      const data = await listTimelineEvents(pool, patient.interconsultaId)
      return res.json({
        rut: patient.rut,
        interconsultaId: patient.interconsultaId,
        data,
        includesDemoEvents: data.some(event => event.is_demo),
        demo: true,
      })
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.post('/api/lista-espera', async (req, res) => {
    const { interconsultaId, especialidad, centroSolicitante, prioridadClinica, motivo } = req.body ?? {}
    if (![interconsultaId, especialidad, centroSolicitante, motivo].every(value =>
      typeof value === 'string' && value.trim().length > 0,
    ) || !Number.isInteger(prioridadClinica) || prioridadClinica < 0 || prioridadClinica > 3) {
      return res.status(400).json({
        error: 'Se requieren interconsultaId, especialidad, centroSolicitante, motivo y prioridadClinica entre 0 y 3.',
      })
    }

    try {
      const result = await addToWaitlist(pool, {
        interconsultaId: interconsultaId.trim(),
        especialidad: especialidad.trim(),
        centroSolicitante: centroSolicitante.trim(),
        prioridadClinica,
        reason: motivo.trim(),
        actor: getDemoActor(req),
      })
      const { status, ...body } = result
      return res.status(status).json(body)
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.post('/api/cupos/reservar', async (req, res) => {
    const {
      cupoId,
      interconsultaId,
      centroSolicitante,
      especialidad = 'Traumatología adulto',
      prioridadClinica = 0,
    } = req.body ?? {}
    if (![cupoId, interconsultaId, centroSolicitante].every(value =>
      typeof value === 'string' && value.trim().length > 0,
    ) || typeof especialidad !== 'string' || !especialidad.trim()
      || !Number.isInteger(prioridadClinica) || prioridadClinica < 0 || prioridadClinica > 3) {
      return res.status(400).json({
        error: 'Se requieren cupoId, interconsultaId, centroSolicitante, especialidad y prioridadClinica entre 0 y 3.',
      })
    }
    if (req.get('x-demo-profile') === 'medico' && !validDemoReferralId(interconsultaId.trim())) {
      return res.status(403).json({ error: 'La interconsulta no está asignada al médico auditor de demostración.' })
    }

    try {
      const result = await reserveSlot(pool, {
        cupoId: cupoId.trim(),
        interconsultaId: interconsultaId.trim(),
        centroSolicitante: centroSolicitante.trim(),
        especialidad: especialidad.trim(),
        prioridadClinica,
        actor: getDemoActor(req),
      })
      if (result.data?.notification) {
        result.data.notification = await deliverNotification(result.data.notification, notify)
      }
      const { status, ...body } = result
      return res.status(status).json(body)
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.patch('/api/reservas/:id/reprogramar', async (req, res) => {
    if (!validReservationId(req.params.id)) {
      return res.status(400).json({ error: 'El identificador de cita no es válido.' })
    }
    const { cupoId } = req.body ?? {}
    const reason = getReason(req.body)
    if (typeof cupoId !== 'string' || !cupoId.trim() || !reason) {
      return res.status(400).json({
        error: 'Selecciona un cupo y un motivo. Si eliges Otro, debes especificarlo.',
      })
    }

    try {
      const result = await rescheduleReservation(pool, {
        reservationId: req.params.id,
        cupoId: cupoId.trim(),
        reason,
        actor: getDemoActor(req),
      })
      if (result.data?.notification) {
        result.data.notification = await deliverNotification(result.data.notification, notify)
      }
      const { status, ...body } = result
      return res.status(status).json(body)
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.patch('/api/reservas/:id/cancelar', async (req, res) => {
    if (!validReservationId(req.params.id)) {
      return res.status(400).json({ error: 'El identificador de cita no es válido.' })
    }
    const reason = getReason(req.body)
    if (!reason) {
      return res.status(400).json({
        error: 'Selecciona un motivo. Si eliges Otro, debes especificarlo.',
      })
    }

    try {
      const result = await cancelReservation(pool, {
        reservationId: req.params.id,
        reason,
        actor: getDemoActor(req),
      })
      if (result.data?.notification) {
        result.data.notification = await deliverNotification(result.data.notification, notify)
      }
      const { status, ...body } = result
      return res.status(status).json(body)
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.use((error, _req, res, _next) => {
    if (error.message === 'Origen no permitido') {
      return res.status(403).json({ error: error.message })
    }
    return res.status(400).json({ error: 'Solicitud inválida.' })
  })

  return app
}
