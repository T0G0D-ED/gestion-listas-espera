import cors from 'cors'
import express from 'express'
import { listSlots, reserveSlot } from './cuposRepository.js'

const defaultOrigins = [
  'http://localhost:4173',
  'http://127.0.0.1:4173',
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
