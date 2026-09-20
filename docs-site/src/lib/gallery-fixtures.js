// Real, minimal markup fixtures for the gallery's live-content state — not
// screenshots. Each fixture is plain HTML the browser renders for real, so
// the "skeleton" side of the toggle is Ghostwire's own real .gw-bone output
// against this exact markup, not a canned image. Styled with Tailwind
// (only this page loads it) so these read as realistic, modern app UI
// rather than placeholder boxes; dark: variants follow the page's own
// data-theme via the custom variant in tailwind.css.
export const FIXTURES = [
  {
    id: 'paginated-table',
    label: 'Paginated table',
    html: `
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="border-b border-slate-200 dark:border-slate-700">
            <th class="px-3 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400">Customer</th>
            <th class="px-3 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400">Status</th>
            <th class="px-3 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400">Updated</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          <tr>
            <td class="px-3 py-3">
              <div class="flex items-center gap-2.5">
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">AC</span>
                <span class="font-medium text-slate-900 dark:text-slate-100">Acme Corp</span>
              </div>
            </td>
            <td class="px-3 py-3"><span class="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">Active</span></td>
            <td class="px-3 py-3 text-slate-500 dark:text-slate-400">2 hours ago</td>
          </tr>
          <tr>
            <td class="px-3 py-3">
              <div class="flex items-center gap-2.5">
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-semibold text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">GI</span>
                <span class="font-medium text-slate-900 dark:text-slate-100">Globex Inc</span>
              </div>
            </td>
            <td class="px-3 py-3"><span class="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">Pending</span></td>
            <td class="px-3 py-3 text-slate-500 dark:text-slate-400">1 day ago</td>
          </tr>
          <tr>
            <td class="px-3 py-3">
              <div class="flex items-center gap-2.5">
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fuchsia-100 text-xs font-semibold text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300">IT</span>
                <span class="font-medium text-slate-900 dark:text-slate-100">Initech</span>
              </div>
            </td>
            <td class="px-3 py-3"><span class="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">Active</span></td>
            <td class="px-3 py-3 text-slate-500 dark:text-slate-400">3 days ago</td>
          </tr>
        </tbody>
      </table>`,
  },
  {
    id: 'kanban',
    label: 'Kanban board',
    html: `
      <div class="flex gap-4">
        <div class="flex-1 rounded-xl border-t-2 border-slate-300 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-800/60">
          <h4 class="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">To Do</h4>
          <div class="mb-2 rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
            <p class="text-sm font-medium text-slate-900 dark:text-slate-100">Design review</p>
            <span class="mt-2 inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">Design</span>
          </div>
          <div class="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
            <p class="text-sm font-medium text-slate-900 dark:text-slate-100">Write tests</p>
            <span class="mt-2 inline-flex items-center rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-medium text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">QA</span>
          </div>
        </div>
        <div class="flex-1 rounded-xl border-t-2 border-amber-400 bg-slate-50 p-3 dark:bg-slate-800/60">
          <h4 class="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">In Progress</h4>
          <div class="rounded-lg bg-white p-3 shadow-sm dark:bg-slate-900">
            <p class="text-sm font-medium text-slate-900 dark:text-slate-100">Ship playground</p>
            <span class="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">In progress</span>
          </div>
        </div>
      </div>`,
  },
  {
    id: 'dashboard-cards',
    label: 'Dashboard cards',
    html: `
      <div class="grid grid-cols-3 gap-4">
        <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Revenue</div>
          <div class="text-xl font-bold text-slate-900 dark:text-slate-100">$48,200</div>
          <div class="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">&#8593; 12.4%</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Users</div>
          <div class="text-xl font-bold text-slate-900 dark:text-slate-100">1,204</div>
          <div class="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">&#8593; 3.1%</div>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Errors</div>
          <div class="text-xl font-bold text-slate-900 dark:text-slate-100">3</div>
          <div class="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">&#8595; 2</div>
        </div>
      </div>`,
  },
];
