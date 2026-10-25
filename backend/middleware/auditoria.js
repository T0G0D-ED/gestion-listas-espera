
 //Funcion fabrica para el middleware de auditoria.
 //Recibe el pool de conexiones para evitar dependencias ocultas y facilitar pruebas
 //Registra de forma asincrona para no impactar el rendimiento.
 
export const crearMiddlewareAuditoria = (pool) => {
    return (req, res, next) => {
    // ALCANCE: Solo auditar metodos que modifican datos
    const metodosModificadores = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!metodosModificadores.includes(req.method)) {
        return next();
    }

    // IDENTIDAD: Solo usar req.user si un middleware de auth previo lo poblo de forma segura.
    // Nunca confiar en headers del cliente como 'x-user-rut'.
    const usuario = (req.user && (req.user.rut || req.user.id || req.user.username)) || 'Anónimo';

    // IP: Extraer la IP real, considerando proxies inversos (como Nginx o Docker)
    const ip = req.ip || req.socket.remoteAddress || 'Desconocida';

    // REGISTRO: Escuchar el evento 'finish' para obtener el status code final de la respuesta
    res.on('finish', () => {
        // Construir detalle con metadatos minimos y seguros 
        const detalle = {
            metodo: req.method,
            ruta: req.originalUrl || req.url,
            status: res.statusCode,
            // Opcional: Si un controlador quiere registrar el ID del recurso creado/afectado, 
            // puede hacerlo mediante: res.locals.resourceId = 'uuid-123';
            resource_id: res.locals?.resourceId || null
        };

        
        // Ejecucion asincrona sin await para no retrasar la respuesta al cliente
        pool.query(
                `INSERT INTO logs_auditoria (usuario, accion, recurso, detalle, ip_origen)
                 VALUES ($1, $2, $3, $4, $5)`,
                [usuario, req.method, req.originalUrl || req.url, detalle, ip]
            ).catch(err => {
                console.error('[ERROR AUDITORIA BD]:', err.message);
            });

            console.log(`[AUDITORIA] ${req.method} ${req.originalUrl} | Usuario: ${usuario} | Status: ${res.statusCode} | IP: ${ip}`);
        });


        next();
    };
};