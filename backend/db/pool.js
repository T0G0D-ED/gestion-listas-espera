import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  throw new Error('Define DATABASE_URL para conectar con PostgreSQL.')
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
