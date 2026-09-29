import cors from 'cors'
import express from 'express'
import {
  cancelReservation,
  addToWaitlist,
  listReservations,
  listSlots,
  listWaitlist,
  reserveSlot,
  rescheduleReservation,
} from './cuposRepository.js'

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

function databaseError(res, error) {
  console.error('Error de base de datos:', error.message)
  const unavailable = error.code?.startsWith('08') || error.code === 'ECONNREFUSED'
  return res.status(unavailable ? 503 : 500).json({
    error: unavailable
      ? 'La base central no está disponible. Intenta nuevamente.'
      : 'No fue posible completar la operación.',
  })
}

export function createApp(pool) {
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

  app.get('/api/reservas', async (_req, res) => {
    try {
      const data = await listReservations(pool)
      return res.json({ total: data.length, data })
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

    try {
      const result = await reserveSlot(pool, {
        cupoId: cupoId.trim(),
        interconsultaId: interconsultaId.trim(),
        centroSolicitante: centroSolicitante.trim(),
        especialidad: especialidad.trim(),
        prioridadClinica,
      })
      const { status, ...body } = result
      return res.status(status).json(body)
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.patch('/api/reservas/:id/cancelar', async (req, res) => {
    const reservationId = req.params.id
    const { motivo } = req.body ?? {}
    if (!/^\d+$/.test(reservationId) || typeof motivo !== 'string' || !motivo.trim()) {
      return res.status(400).json({ error: 'Selecciona un motivo para cancelar la cita.' })
    }

    try {
      const result = await cancelReservation(pool, { reservationId, reason: motivo.trim() })
      const { status, ...body } = result
      return res.status(status).json(body)
    } catch (error) {
      return databaseError(res, error)
    }
  })

  app.patch('/api/reservas/:id/reprogramar', async (req, res) => {
    const reservationId = req.params.id
    const { cupoId, motivo } = req.body ?? {}
    if (!/^\d+$/.test(reservationId) || typeof cupoId !== 'string' || !cupoId.trim()
      || typeof motivo !== 'string' || !motivo.trim()) {
      return res.status(400).json({ error: 'Selecciona un nuevo horario y un motivo para reprogramar.' })
    }

    try {
      const result = await rescheduleReservation(pool, {
        reservationId,
        cupoId: cupoId.trim(),
        reason: motivo.trim(),
      })
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
