import { spawnSync } from 'node:child_process'

function run(script) {
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('backend/db/migrate.js')

const { pool } = await import('./pool.js')
let needsSeed
try {
  const { rows } = await pool.query('SELECT COUNT(*)::INTEGER AS count FROM appointment_slots')
  needsSeed = rows[0].count === 0
} finally {
  await pool.end()
}

if (needsSeed) run('backend/db/seed.js')
