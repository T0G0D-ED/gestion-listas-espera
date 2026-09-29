import 'dotenv/config'
import { createApp } from './app.js'
import { pool } from './db/pool.js'

const port = Number(process.env.PORT || 3000)
const app = createApp(pool)
const server = app.listen(port, () => {
    console.log(`API de red asistencial disponible en http://localhost:${port}`)
})

function shutdown() {
    server.close(async () => {
        await pool.end()
        process.exit(0)
    })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
