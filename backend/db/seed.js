import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { pool } from './pool.js'

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
      ON CONFLICT (id) DO NOTHING
    `, [slot.id, slot.at, slot.doctor, slot.est, slot.comuna, slot.mod, slot.box, slot.cupos])
  }

  console.log(`${slots.length} cupos de ejemplo sincronizados sin sobrescribir reservas.`)
} finally {
  await pool.end()
}
