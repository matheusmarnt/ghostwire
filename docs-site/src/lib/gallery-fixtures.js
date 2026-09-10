// Real, minimal markup fixtures for the gallery's live-content state — not
// screenshots. Each fixture is plain HTML the browser renders for real, so
// the "skeleton" side of the toggle is Ghostwire's own real .gw-bone output
// against this exact markup, not a canned image.
export const FIXTURES = [
  {
    id: 'paginated-table',
    label: 'Paginated table',
    html: `
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr><th style="text-align:left;padding:8px;">Name</th><th style="text-align:left;padding:8px;">Status</th><th style="text-align:left;padding:8px;">Updated</th></tr></thead>
        <tbody>
          <tr><td style="padding:8px;">Acme Corp</td><td style="padding:8px;">Active</td><td style="padding:8px;">2 hours ago</td></tr>
          <tr><td style="padding:8px;">Globex Inc</td><td style="padding:8px;">Pending</td><td style="padding:8px;">1 day ago</td></tr>
          <tr><td style="padding:8px;">Initech</td><td style="padding:8px;">Active</td><td style="padding:8px;">3 days ago</td></tr>
        </tbody>
      </table>`,
  },
  {
    id: 'kanban',
    label: 'Kanban board',
    html: `
      <div style="display:flex;gap:12px;">
        <div style="flex:1;background:#f4f4f8;border-radius:8px;padding:10px;">
          <h4 style="margin:0 0 8px;">To Do</h4>
          <div style="background:#fff;border-radius:6px;padding:8px;margin-bottom:6px;">Design review</div>
          <div style="background:#fff;border-radius:6px;padding:8px;">Write tests</div>
        </div>
        <div style="flex:1;background:#f4f4f8;border-radius:8px;padding:10px;">
          <h4 style="margin:0 0 8px;">In Progress</h4>
          <div style="background:#fff;border-radius:6px;padding:8px;">Ship playground</div>
        </div>
      </div>`,
  },
  {
    id: 'dashboard-cards',
    label: 'Dashboard cards',
    html: `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div style="background:#f4f4f8;border-radius:8px;padding:14px;"><div style="font-size:0.8rem;color:#777;">Revenue</div><div style="font-size:1.5rem;font-weight:700;">$48,200</div></div>
        <div style="background:#f4f4f8;border-radius:8px;padding:14px;"><div style="font-size:0.8rem;color:#777;">Users</div><div style="font-size:1.5rem;font-weight:700;">1,204</div></div>
        <div style="background:#f4f4f8;border-radius:8px;padding:14px;"><div style="font-size:0.8rem;color:#777;">Errors</div><div style="font-size:1.5rem;font-weight:700;">3</div></div>
      </div>`,
  },
];
