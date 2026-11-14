export function AlertasCriticas() {
    const contenedor = document.createElement('div');
    contenedor.style.cssText = `
        background-color: #ffffff;
        border-radius: 12px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        padding: 1.5rem 2rem;
        ;margin: 1.5rem 0;
        font-family: system-ui, -apple-system, sans-serif;
        max-width: 800px;
    `;
    contenedor.innerHTML = '<p style="color: #6b7280; font-size: 0.9rem; margin: 0;">Cargando alertas críticas...</p>';

    async function obtenerAlertas() {
        try {
            const res = await fetch('http://localhost:3000/api/alertas/criticas');
            const data = await res.json();

            if (!data.alertas || data.alertas.length === 0) {
                contenedor.innerHTML = `
                    <div style="
                        background-color: #ecfdf5; border-left: 4px solid #10b981;
                        padding: 0.875rem 1rem; border-radius: 6px; color: #065f46;
                        font-size: 0.95rem; font-weight: 500; display: flex; align-items: center; gap: 0.5rem;
                    ">
                        <span>✅</span>
                        <span>No hay interconsultas próximas a vencer (>= 80% límite).</span>
                    </div>`;
                return;
            }

            contenedor.innerHTML = `
                <h4 style="color: #b91c1c; font-weight: 700; margin-top: 0; margin-bottom: 1rem; font-size: 1.1rem;">
                    ⚠️ Alertas Críticas Detectadas (${data.total_alertas})
                </h4>`;
            
            const lista = document.createElement('div');
            lista.style.cssText = 'display: flex; flex-direction: column; gap: 0.75rem;';

            data.alertas.forEach(alerta => {
                const item = document.createElement('div');
                item.style.cssText = `
                    background-color: #fef2f2; border-left: 4px solid #ef4444;
                    padding: 0.875rem 1rem; border-radius: 6px; color: #1f2937;
                    font-size: 0.9rem; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem;
                `;
                item.innerHTML = `
                    <div>
                        <strong style="color: #991b1b;">Paciente RUT:</strong> ${alerta.paciente_rut} · 
                        <strong style="color: #991b1b;">Prioridad:</strong> ${alerta.prioridad}
                    </div>
                    <span style="background-color: #dc2626; color: white; padding: 0.2rem 0.65rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 600;">
                        Tiempo usado: ${alerta.porcentaje_tiempo_usado}%
                    </span>
                `;
                lista.appendChild(item);
            });
            contenedor.appendChild(lista);
        } catch (err) {
            contenedor.innerHTML = `
                <div style="
                    background-color: #fef2f2; border-left: 4px solid #ef4444;
                    padding: 0.875rem 1rem; border-radius: 6px; color: #991b1b;
                    font-size: 0.9rem; font-weight: 500;
                ">
                    ❌ Error de conexión con el módulo de alertas.
                </div>`;
        }
    }

    obtenerAlertas();
    return contenedor;
}
