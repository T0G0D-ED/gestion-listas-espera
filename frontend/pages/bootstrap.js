let role = 'administrativo'
try {
  role = localStorage.getItem('appRole') === 'paciente' ? 'paciente' : 'administrativo'
} catch {}

if (role === 'paciente') {
  await import('./patient.js')
} else {
  await import('./main.js')
}
