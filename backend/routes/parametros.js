import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// 1. GET /api/parametros-prioridad -> Consultar parametros (Lectura)
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT id, categoria, descripcion, tiempo_maximo_horas FROM parametros_prioridad ORDER BY tiempo_maximo_horas ASC'
        );
        return res.status(200).json(rows);
    } catch (error) {
        console.error('Error al consultar parámetros:', error);
        return res.status(500).json({ error: 'Error al consultar parámetros de prioridad' });
    }
});

// 2. PUT /api/parametros-prioridad/:categoria -> Configurar/modificar parametro (Regla de negocio)
router.put('/:categoria', async (req, res) => {
    const { categoria } = req.params;
    const { tiempo_maximo_horas, descripcion } = req.body;

    // Regla de validacion. Tiempo obligatorio y estrictamente positivo
    if (tiempo_maximo_horas === undefined || typeof tiempo_maximo_horas !== 'number' || tiempo_maximo_horas <= 0) {
        return res.status(400).json({
            error: 'El campo tiempo_maximo_horas es obligatorio y debe ser un número entero mayor a 0.'
        });
    }

    try {
        const query = `
            INSERT INTO parametros_prioridad (categoria, descripcion, tiempo_maximo_horas)
            VALUES ($1, $2, $3)
            ON CONFLICT (categoria) 
            DO UPDATE SET 
                tiempo_maximo_horas = EXCLUDED.tiempo_maximo_horas,
                descripcion = COALESCE(EXCLUDED.descripcion, parametros_prioridad.descripcion)
            RETURNING id, categoria, descripcion, tiempo_maximo_horas;
        `;
        const { rows } = await pool.query(query, [categoria.toUpperCase(), descripcion || null, tiempo_maximo_horas]);

        return res.status(200).json({
            mensaje: `Parámetro para la categoría ${categoria.toUpperCase()} configurado correctamente.`,
            parametro: rows[0]
        });
    } catch (error) {
        console.error('Error al actualizar parámetro:', error);
        return res.status(500).json({ error: 'Error interno al guardar la configuración' });
    }
});

export default router;