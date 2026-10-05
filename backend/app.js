import cors from 'cors'
import express from 'express'
import {
  cancelReservation,
  listReservations,
  listSlots,
  reserveSlot,
  rescheduleReservation,
} from './cuposRepository.js'
import { sendAppointmentNotification } from './resendNotifications.js'

const reservationReasons = new Set([
  'Solicitud del paciente',
  'Indisponibilidad del profesional',
  'Reorganización del establecimiento',
  'Otro',
])

function getReason(body) {
  const { motivo, otroMotivo } = body ?? {}
  if (typeof motivo !== 'string' || !reservationReasons.has(motivo)) return null
  if (motivo === 'Otro') {
    if (typeof otroMotivo !== 'string' || !otroMotivo.trim()) return null
    return `Otro: ${otroMotivo.trim()}`
  }
  return motivo
}

function validReservationId(id) {
  return /^\d+$/.test(id)
}

const defaultOrigins = [
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

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

export function createApp(pool, { notify = sendAppointmentNotification } = {}) {
  const app = express()
  const allowedOrigins = new Set(
    (process.env.FRONTEND_ORIGINS || defaultOrigins.join(','))
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean),
  )

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

  app.get('/api/reservas', async (_req, res) => {
    try {
      const data = await listReservations(pool)
      return res.json({ total: data.length, data })
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.post('/api/cupos/reservar', async (req, res) => {
    const { cupoId, interconsultaId, centroSolicitante } = req.body ?? {}
    if (![cupoId, interconsultaId, centroSolicitante].every(value =>
      typeof value === 'string' && value.trim().length > 0,
    )) {
      return res.status(400).json({
        error: 'Se requieren cupoId, interconsultaId y centroSolicitante.',
      })
    }

    try {
      const result = await reserveSlot(pool, {
        cupoId: cupoId.trim(),
        interconsultaId: interconsultaId.trim(),
        centroSolicitante: centroSolicitante.trim(),
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
