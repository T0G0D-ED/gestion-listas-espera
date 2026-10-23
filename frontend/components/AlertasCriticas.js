export function AlertasCriticas() {
    const contenedor = document.createElement('div');
    contenedor.className = 'card border-danger shadow-sm my-3 p-3';
    contenedor.style.backgroundColor = '#fff5f5';
    contenedor.innerHTML = '<p class="text-muted">Cargando alertas críticas...</p>';

    async function obtenerAlertas() {
        try {
            const res = await fetch('http://localhost:3000/api/alertas/criticas');
            const data = await res.json();

            if (!data.alertas || data.alertas.length === 0) {
                contenedor.innerHTML = `
                    <div class="d-flex align-items-center text-success">
                        <span class="me-2">✅</span> 
                        <span>No hay interconsultas próximas a vencer (>= 80% límite).</span>
                    </div>`;
                return;
            }

            contenedor.innerHTML = `<h5 class="text-danger mb-2">⚠️ Alertas Críticas Detectadas (${data.total_alertas})</h5>`;
            data.alertas.forEach(alerta => {
                const item = document.createElement('div');
                item.className = 'p-2 mb-2 border-start border-danger border-3 bg-white rounded shadow-xs';
                item.innerHTML = `
                    <strong>Paciente RUT:</strong> ${alerta.paciente_rut} | 
                    <strong>Prioridad:</strong> ${alerta.prioridad} | 
                    <strong>Tiempo usado:</strong> <span class="badge bg-danger">${alerta.porcentaje_tiempo_usado}%</span>
                `;
                contenedor.appendChild(item);
            });
        } catch (err) {
            contenedor.innerHTML = '<span class="text-danger">❌ Error de conexión con el módulo de alertas.</span>';
        }
    }

    obtenerAlertas();
    return contenedor;
}