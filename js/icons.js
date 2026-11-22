// Simple line icons per part category (24x24, currentColor). Own artwork, no Shopee images.
const wrap = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  cpu: wrap('<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3"/>'),
  motherboard: wrap('<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="6" y="6" width="6" height="6" rx="1"/><path d="M15 6v8M17.5 6v8M6 15.5h6M6 18h9"/>'),
  ram: wrap('<rect x="2.5" y="7" width="19" height="8" rx="1.2"/><path d="M6 10h2M10 10h2M14 10h2M4 15v2M8 15v2M12 15v2M16 15v2M20 15v2"/>'),
  gpu: wrap('<rect x="2.5" y="6" width="19" height="10" rx="1.5"/><circle cx="9" cy="11" r="3"/><circle cx="16" cy="11" r="2"/><path d="M4 16v3M7 16v3"/>'),
  ssd: wrap('<rect x="2.5" y="8.5" width="19" height="7" rx="1.2"/><rect x="5" y="10.5" width="5" height="3" rx=".5"/><rect x="11.5" y="10.5" width="3" height="3" rx=".5"/><path d="M19 10.5v3"/>'),
  psu: wrap('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="10" cy="12" r="4"/><path d="M10 9.5v5M7.5 12h5M16.5 9h2M16.5 12h2M16.5 15h2"/>'),
  case: wrap('<rect x="6" y="2.5" width="12" height="19" rx="1.8"/><path d="M9 6h6M9 8.5h6"/><circle cx="12" cy="15" r="2.5"/>'),
  cooler: wrap('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.5"/><path d="M12 10.5c0-3 1-5.5 3.5-6M13.5 12c3 0 5.5 1 6 3.5M12 13.5c0 3-1 5.5-3.5 6M10.5 12c-3 0-5.5-1-6-3.5"/>'),
};
