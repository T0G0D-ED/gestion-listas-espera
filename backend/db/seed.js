import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { pool } from './pool.js'

function nextOccurrence(at, now = new Date()) {
  const date = new Date(at)
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  while (date < tomorrow) date.setDate(date.getDate() + 7)
  const pad = value => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

try {
  const slots = JSON.parse(await readFile(
    new URL('../../frontend/data/cupos.json', import.meta.url),
    'utf8',
  ))

  for (const slot of slots) {
    await pool.query(`
      INSERT INTO appointment_slots (
        id, appointment_at, doctor, establishment, comuna, modalidad, box,
        total_cupos, cupos_disponibles
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
      ON CONFLICT (id) DO UPDATE SET
        appointment_at = EXCLUDED.appointment_at,
        total_cupos = EXCLUDED.total_cupos,
        cupos_disponibles = GREATEST(
          EXCLUDED.total_cupos - (
            SELECT COUNT(*)::INTEGER
            FROM appointment_reservations
            WHERE slot_id = EXCLUDED.id AND status = 'active'
          ),
          0
        ),
        updated_at = NOW()
    `, [
      slot.id,
      nextOccurrence(slot.at),
      slot.doctor,
      slot.est,
      slot.comuna,
      slot.mod,
      slot.box,
      slot.cupos,
    ])
  }

  console.log(`${slots.length} cupos de ejemplo actualizados con fechas futuras.`)
} finally {
  await pool.end()
}
