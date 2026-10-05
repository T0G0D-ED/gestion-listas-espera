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

La API central expone `GET /api/cupos` para consultar disponibilidad y `POST /api/cupos/reservar` para reservar una plaza. También permite consultar las citas activas con `GET /api/reservas`, reprogramarlas con `PATCH /api/reservas/:id/reprogramar` y cancelarlas con `PATCH /api/reservas/:id/cancelar`. Las reprogramaciones y cancelaciones requieren un motivo; al seleccionar `Otro` también se exige describirlo. Estas operaciones mantienen el historial de cambios y actualizan la disponibilidad dentro de transacciones PostgreSQL.

### Ejecutar en un equipo

Requisitos: Node.js con npm y un servidor PostgreSQL en funcionamiento. Desde PowerShell, abre la carpeta del proyecto y ejecuta:

```powershell
cd "C:\ruta\al\proyecto\gestion-listas-espera"
npm install
```

Crea un archivo `.env` en la carpeta principal del proyecto (junto a `package.json`). No lo publiques ni compartas: contiene credenciales. Configura la URL de tu base PostgreSQL, los orígenes autorizados y las variables de Resend para notificaciones de prueba:

```dotenv
DATABASE_URL=postgresql://USUARIO:CONTRASENA@localhost:5432/NOMBRE_BASE
PORT=3000
FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
RESEND_API_KEY=re_REEMPLAZAR_POR_TU_CLAVE
RESEND_TEST_EMAIL=tu-correo-verificado@example.com
```

Reemplaza los valores de ejemplo por los de tu instalación. Si la contraseña contiene caracteres especiales, codifícalos para usarlos en una URL. El archivo `.env` está excluido de Git.

Al reservar, reprogramar o cancelar una cita, el backend envía un aviso a `RESEND_TEST_EMAIL` mediante Resend; nunca toma el destinatario del navegador. Al confirmar una reserva, el comprobante informa si el correo de prueba se envió correctamente o si falló. Para este flujo de prueba se usa el remitente `onboarding@resend.dev`, admitido por Resend para envíos de prueba a destinatarios permitidos/verificados. Los correos incluyen el ID de interconsulta, centro, datos de la cita y, si aplica, el motivo, pero no nombre, RUT ni información clínica. La operación de la cita se conserva aunque Resend no esté disponible y la página informa si falló el envío. No reutilices una clave que haya sido expuesta; revócala en Resend y agrega una clave nueva solo en el `.env` local.

Antes de continuar, inicia PostgreSQL y crea la base de datos indicada en `DATABASE_URL` si todavía no existe. Ejecuta las migraciones y los datos de ejemplo una vez:

```powershell
npm run db:migrate
npm run db:seed
```

Si ya tenías instalada una versión anterior, vuelve a ejecutar `npm run db:migrate` para añadir el estado de las citas y el historial de reprogramaciones/cancelaciones.

Inicia el backend en una ventana de PowerShell y déjala abierta:

```powershell
npm run dev:backend
```

En otra ventana, inicia el frontend:

```powershell
npm run dev
```

Abre la dirección que indique Vite, normalmente `http://localhost:5173`. Puedes comprobar la API en `http://localhost:3000/api/health`.

En la aplicación, el enlace **Cupos tomados** de la navegación abre una página con las citas activas (`/reservas.html`). Puedes filtrar por IC, doctor, hospital y fecha. Desde ahí se puede reprogramar a otro cupo disponible o cancelar; ambas acciones abren un modal, exigen seleccionar un motivo, y `Otro` requiere una descripción.

La pantalla **Interconsultas** incluye interconsultas de ejemplo desde `IC-2026-000184` hasta `IC-2026-000199`. Usa **Siguiente interconsulta** en el contexto para avanzar a una que todavía no tenga una cita activa y probar varias reservas. El control de última sincronización en ambas páginas muestra la fecha y hora de la última carga correcta.

En **Interconsultas**, el contador de pendientes muestra las reservas guardadas en la cola local de IndexedDB. Selecciona el contador para desplegar las interconsultas que esperan subirse al servidor, con el cupo, establecimiento, profesional y hora en que se encolaron. Si no hay conexión, se puede guardar una reserva para sincronizarla cuando la conexión vuelva; al sincronizarse correctamente se elimina de la cola y el contador y el detalle se actualizan.

Al terminar un intento de sincronización, la pantalla muestra una notificación emergente de éxito si todas las interconsultas se enviaron, o una advertencia con el resultado y el primer error si quedaron elementos pendientes. Las notificaciones se pueden cerrar manualmente y desaparecen automáticamente.

### Permitir el acceso desde otros equipos de la misma red

Estos pasos permiten que otros equipos de la misma red local (por ejemplo, el mismo Wi-Fi) abran la aplicación alojada en este equipo. El equipo que la aloja debe permanecer encendido y ambos equipos deben seguir conectados a la red.

1. En el equipo anfitrión, averigua su dirección IPv4 privada ejecutando `ipconfig` en PowerShell. Busca la dirección IPv4 del adaptador Wi-Fi o Ethernet activo, por ejemplo `192.168.1.25`.
2. Añade esa dirección a `FRONTEND_ORIGINS` en el `.env` de la carpeta principal. Sustituye el ejemplo por la IP real:

   ```dotenv
   FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://192.168.1.25:5173
   ```

3. Reinicia el backend (Ctrl+C y vuelve a ejecutar `npm run dev:backend`) para que cargue el cambio.
4. En una tercera ventana de PowerShell, inicia Vite escuchando en la red local:

   ```powershell
   npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
   ```

5. Si Windows muestra una alerta de Firewall, permite el acceso a Node.js en redes privadas. Si no aparece, crea una regla de entrada para TCP en el puerto `5173` en el Firewall de Windows, limitada a redes privadas. No es necesario abrir el puerto `3000` a los otros equipos; Vite reenvía las llamadas a la API desde el equipo anfitrión.
6. Desde otro equipo conectado a la misma red, abre `http://192.168.1.25:5173`, reemplazando la IP de ejemplo por la del anfitrión.

Si cambia la IP del anfitrión, actualiza `FRONTEND_ORIGINS`, reinicia el backend y usa la nueva dirección en el navegador. Si el puerto `5173` ya está ocupado, libera ese puerto o cambia el puerto y actualiza también `FRONTEND_ORIGINS` y la dirección que compartirás.

### Acceso por Internet

Los pasos anteriores son solo para una red local; no hacen que la aplicación sea accesible desde cualquier lugar de Internet. Para eso hay que desplegar el frontend y la API en un servicio accesible públicamente, configurar PostgreSQL, dominio, HTTPS, CORS y controles de acceso, y asegurar la operación y las copias de seguridad. No expongas directamente el servidor de desarrollo de Vite ni esta API en una red pública. La autenticación institucional y la autorización por roles deben implementarse antes de usar el sistema con información clínica real.

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