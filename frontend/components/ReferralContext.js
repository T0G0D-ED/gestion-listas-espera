export const referralContextTemplate = `
<section class="bg-white border border-slate-200 rounded-xl p-5 text-sm">
  <div class="flex justify-between items-start gap-2"><h2 class="font-semibold text-base">Contexto de la interconsulta</h2><span id="current-referral-id" class="shrink-0 text-[11px] bg-slate-100 rounded px-2 py-0.5">IC-2026-000184</span></div>
  <dl class="mt-3 space-y-2">
    <div><dt class="text-xs text-slate-500">Especialidad solicitada</dt><dd class="font-semibold">Traumatología adulto</dd></div>
    <div><dt class="text-xs text-slate-500">Establecimiento de origen</dt><dd class="font-semibold">CESFAM Nuevo Horizonte · San Bernardo</dd></div>
    <div class="flex justify-between"><div><dt class="text-xs text-slate-500">Fecha de ingreso</dt><dd class="font-semibold">28 sept 2026</dd></div><div><dt class="text-xs text-slate-500">Prioridad</dt><dd class="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 inline-block">Preferente</dd></div></div>
  </dl>
  <button id="next-referral" type="button" class="mt-4 w-full rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand hover:bg-brand-tint disabled:cursor-not-allowed disabled:opacity-50">Siguiente interconsulta</button>
  <p id="referral-message" class="mt-2 text-xs text-slate-500" aria-live="polite"></p>
  <p class="mt-3 text-xs bg-slate-100 rounded-lg p-2">Vista administrativa: no contiene nombre, RUT ni información clínica.</p>
</section>
<p class="bg-brand-tint rounded-xl p-4 text-xs"><strong class="text-sm block">Apoyo de priorización</strong>Permite comparar fecha, establecimiento y modalidad. Esto ayuda, no reemplaza el criterio clínico ni la coordinación con el equipo de salud.</p>`
