let role = 'administrativo'
try {
  const savedRole = localStorage.getItem('appRole')
  role = ['paciente', 'medico'].includes(savedRole) ? savedRole : 'administrativo'
} catch {}

if (role === 'medico') {
  await import('./auditor.js')
} else if (role === 'paciente') {
  await import('./patient.js')
} else {
  await import('./main.js')
}
