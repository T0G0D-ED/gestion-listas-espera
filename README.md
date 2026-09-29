# Gestión de Listas de Espera en Atención Primaria de Salud (APS)

## Descripción

### Problema
En los Centros de Salud Familiar (CESFAM) de comunas con alta demanda, la derivación e interconsulta hacia la atención secundaria presenta severas fallas de sincronización. Al gestionarse mediante planillas y registros dispersos entre establecimientos, los equipos de salud enfrentan dificultades para priorizar casos según criterios clínicos y mantener informados a los pacientes sobre sus tiempos de espera. Esta falta de un mecanismo centralizado y confiable genera incertidumbre, reclamos y el riesgo constante de postergar atenciones clínicamente urgentes.

### Solución propuesta
Se propone el desarrollo de un sistema centralizado de gestión y seguimiento de interconsultas y derivaciones para la red asistencial de atención primaria y secundaria. La plataforma permite a los equipos médicos, administrativos y a los propios pacientes conocer el estado en tiempo real de sus solicitudes, ofreciendo soporte a la priorización clínica, operatividad offline-first para mitigar problemas de conectividad intermitente y resguardo de la confidencialidad de la información médica.

---

## Integrantes
- Gonzalo Yuseff
- Francisco Molinet
- Maximiliano Parra

---

## Arquitectura
**Arquitectura Offline-First Dirigida por Eventos (Event-Driven & Local-First Architecture)**

* **Local-First / Operatividad Offline:** La aplicación prioriza el almacenamiento local (IndexedDB / SQLite local) para que los usuarios puedan continuar trabajando, registrando interconsultas y realizando updates sin importar la calidad del enlace a internet.
* **Procesamiento Dirigido por Eventos (Event-Driven):** Los cambios de estado (creación de derivación, cambio de prioridad clínica, asignación de cita) se registran como eventos locales.
* **Mecanismo de Cola y Sincronización:** Al detectar restablecimiento de conectividad, se procesa de manera asíncrona una cola de eventos hacia el backend central, garantizando eventual consistencia de los datos y resolución de conflictos.
* **Seguridad & Confidencialidad:** Cifrado de datos en tránsito y en reposo local, junto a un esquema de autorización y autenticación basado en roles para asegurar la protección de la información médica.

---

## Tecnologías

* **Frontend:** HTML5, CSS3, Tailwind CSS, JavaScript (ES6+) / Progressive Web App (PWA) / Service Workers (para gestión de caché y conectividad intermitente).
* **Backend:** Node.js, Express.js.
* **Base de Datos:** PostgreSQL (Servidor Central) + IndexedDB / SQLite (Cálculo local y soporte Offline).
* **Control de Versiones & Gestión:** Git, GitHub.

## API y PostgreSQL

La API central expone `GET /api/cupos` para consultar disponibilidad y `POST /api/cupos/reservar` para reservar una plaza. La reserva se ejecuta en una transacción PostgreSQL: la disponibilidad se decrementa solo si todavía es mayor que cero, y una interconsulta solo puede tener una reserva en toda la red.

Para iniciar el backend local:

1. Copia `.env.example` a `.env` y configura `DATABASE_URL` con la conexión PostgreSQL entregada para el proyecto.
2. Ejecuta `npm run db:migrate` para crear las tablas.
3. Ejecuta `npm run db:seed` para cargar los cupos de ejemplo sin sobrescribir reservas existentes.
4. Ejecuta `npm run dev:backend` para iniciar la API en el puerto 3000.
5. Ejecuta `npm run dev` o `npm run preview` para iniciar el frontend. El proxy `/api` apunta al backend local.

La reserva recibe `cupoId`, `interconsultaId` y `centroSolicitante`; se usa el identificador de interconsulta y no el RUT del paciente. Antes de desplegar en la red asistencial, el endpoint debe derivar el centro y la identidad desde autenticación institucional; CORS no reemplaza autenticación ni autorización.

---

## Organización del Repositorio

```text
.
├── src/
│   ├── config/          # Configuraciones globales (base de datos, variables de entorno)
│   ├── js/              # Manejo de Node.js
│   ├── routes/          # Definición de rutas y endpoints de la API
│   └── assets/          # Archivos estáticos de la interfaz frontend (HTML, CSS, JS cliente)
├── docs/                # Documentación del proyecto, diagramas y entrega de Unidades
├── data/                # Informacion pre cargada
├── .gitignore           # Archivos e historial excluidos de Git
├── package.json         # Dependencias y scripts del proyecto Node.js
└── README.md            # Presentación general del proyecto