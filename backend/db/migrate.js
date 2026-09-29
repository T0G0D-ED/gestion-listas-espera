import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { pool } from './pool.js'

try {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
  await pool.query(schema)
  console.log('Esquema PostgreSQL aplicado.')
} finally {
  await pool.end()
}
