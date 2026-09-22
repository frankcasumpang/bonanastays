/* Shared helpers for the public site and the admin dashboard. Exposes window.S */
(function () {
  'use strict';

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- dates: plain YYYY-MM-DD strings, calculated in UTC so time zones never shift them ---------- */
  const DAY = 864e5;
  const toMs = (s) => Date.parse(s + 'T00:00:00Z');
  const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
  const addDays = (s, n) => fmt(toMs(s) + n * DAY);
  const diffDays = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);
  const dow = (s) => new Date(toMs(s)).getUTCDay();
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MON = MONTHS.map((m) => m.slice(0, 3));
  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const parts = (s) => s.split('-').map(Number);
  const dateLabel = (s) => {
    if (!s) return '';
    const [y, m, d] = parts(s);
    return `${MON[m - 1]} ${d}, ${y}`;
  };
  const dateShort = (s) => {
    if (!s) return '';
    const [, m, d] = parts(s);
    return `${MON[m - 1]} ${d}`;
  };
  const monthYear = (s) => {
    if (!s) return '';
    const [y, m] = parts(s);
    return `${MONTHS[m - 1]} ${y}`;
  };
  const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

  const money = (n, sym = '₱') => {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    return (v < 0 ? '-' : '') + sym + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  };

  const timeLabel = (t) => {
    if (!/^\d{1,2}:\d{2}$/.test(t || '')) return t || '';
    let [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ap}`;
  };

  /* Turn plain admin text into safe HTML: blank line = paragraph, lines starting with - or • = bullet list */
  const rich = (text) => {
    const blocks = String(text || '').trim().split(/\n\s*\n/);
    return blocks
      .filter(Boolean)
      .map((b) => {
        const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length > 1 && lines.every((l) => /^[-•*]\s+/.test(l))) return '<ul>' + lines.map((l) => `<li>${esc(l.replace(/^[-•*]\s+/, ''))}</li>`).join('') + '</ul>';
        return '<p>' + lines.map(esc).join('<br>') + '</p>';
      })
      .join('');
  };

  /* ---------- icons ---------- */
  const I = {
    wifi: '<path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 19.5h.01"/>',
    aircon: '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>',
    tv: '<rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 21h8M12 18v3"/>',
    fridge: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M6 10h12M9 6v1.5M9 13v3"/>',
    microwave: '<rect x="2" y="5" width="20" height="14" rx="2"/><rect x="5" y="8" width="10" height="8" rx="1"/><path d="M18.5 9h.01M18.5 12h.01M18.5 15h.01"/>',
    kitchen: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    coffee: '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
    washer: '<rect x="3" y="2" width="18" height="20" rx="2"/><circle cx="12" cy="13.5" r="5"/><path d="M7 6h.01M10.5 6h.01"/>',
    hairdryer: '<path d="M3 8a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2a2 2 0 0 1-2 2H8"/><path d="m8 12-2 9h4l1.5-9"/><path d="M22 7v3"/>',
    shower: '<path d="m4 4 2.5 2.5"/><path d="M13.5 6.5a5 5 0 0 0-7 7"/><path d="M15 5 5 15"/><path d="M14 17v.01M10 16v.01M13 13v.01M16 10v.01M11 20v.01M17 14v.01M20 11v.01"/>',
    balcony: '<path d="M3 21h18"/><path d="M5 21V11h14v10"/><path d="M5 15h14M9 11v10M15 11v10"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    pool: '<path d="M2 19c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0"/><path d="M8 15V6a2.5 2.5 0 0 1 5 0"/><path d="M15 15V6a2.5 2.5 0 0 1 5 0"/><path d="M8 9h7"/>',
    parking: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9.5 17V7H13a3 3 0 0 1 0 6H9.5"/>',
    laptop: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 20h20"/>',
    dining: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/>',
    towel: '<rect x="5" y="3" width="14" height="12" rx="1.5"/><path d="M5 8h14M9 15v6M15 15v6"/>',
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    elevator: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m9 10 3-3 3 3M9 14l3 3 3-3"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    luggage: '<rect x="5" y="7" width="14" height="14" rx="2"/><path d="M9 7V4h6v3M9 11v6M15 11v6"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3M14 9l2 2"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M19 17v4M17 19h4"/>',
    leaf: '<path d="M5 19C5 10 10 5 20 4c0 10-5 15-14 15Z"/><path d="M5 19c3-5 6-8 10-10"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
    heart: '<path d="M12 20s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.6A4.5 4.5 0 0 1 20 9c0 6.2-8 11-8 11Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    coffeecup: '<path d="M4 9h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z"/><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"/>',
    // structure & UI
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    bed: '<path d="M3 19V6M3 15h18v4M21 15v-2.5A3.5 3.5 0 0 0 17.5 9H11v6"/><circle cx="7" cy="11.5" r="2"/>',
    bath: '<path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z"/><path d="M6 12V6a2 2 0 0 1 2-2h1M7 19l-1 2M17 19l1 2"/>',
    pin: '<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    chevL: '<path d="m14.5 6-6 6 6 6"/>',
    chevR: '<path d="m9.5 6 6 6-6 6"/>',
    chevD: '<path d="m6 9.5 6 6 6-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8Z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
    home: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4Z"/>',
    external: '<path d="M14 4h6v6M20 4 10 14M18 14v5H5V6h5"/>',
    directions: '<path d="m4 11 16-7-7 16-2-7Z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    // nearby
    utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"/><path d="M5 12v8h14v-8"/>',
    car: '<path d="M5 16v-5l2-5h10l2 5v5"/><path d="M3 16h18v3H3zM7 11h10"/>',
    plane: '<path d="M10 14 3 11V9l8 1 4-6 2 1-2.5 6.5L20 13v2l-6.5-1L12 20l-2-.5Z"/>',
    tree: '<path d="M12 3 6 12h3l-4 6h14l-4-6h3Z"/><path d="M12 18v3"/>',
    school: '<path d="m2 9 10-5 10 5-10 5Z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/>',
    landmark: '<path d="M3 20h18M5 20V10M9.5 20V10M14.5 20V10M19 20V10"/><path d="m3 10 9-6 9 6Z"/>',
    camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4Z"/><circle cx="12" cy="13" r="3.5"/>',
    // social
    facebook: '<path d="M14 8h2V4.5h-2.5A3.5 3.5 0 0 0 10 8v2H8v3.5h2V21h3.5v-7.5H16l.5-3.5h-3V8.3c0-.2.1-.3.3-.3Z"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
    tiktok: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.3 2.6 2 4.4 5 4.6"/>',
    whatsapp: '<path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.6Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2Z"/>',
    messenger: '<path d="M12 3a9 9 0 0 0-9 9c0 2.7 1.2 5 3 6.6V21l2.6-1.4A9 9 0 1 0 12 3Z"/><path d="m7.5 13.5 3-3.5 2 2 3-2.5"/>',
    viber: '<path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6l-4 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M9 8.5c0 3 2 5 5 5l1-1.2-1.8-1-.8.7a3 3 0 0 1-1.4-1.4l.7-.8-1-1.8Z"/>',
    // admin
    dashboard: '<rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
    logout: '<path d="M10 4H5v16h5M15 8l5 4-5 4M20 12H9"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6A16.5 16.5 0 0 0 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    star: '<path d="m12 2.8 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.4l-5.7 3 1.1-6.4L2.8 9.5l6.4-.9Z"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4Z"/><path d="M10 21h4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.2 0-2.5 1.5-2.5H17a4 4 0 0 0 4-4A9 9 0 0 0 12 3Z"/><path d="M7.5 11h.01M9.5 7.5h.01M14.5 7.5h.01"/>',
    file: '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
    grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3"/>',
    rocket: '<path d="M5 19c0-3 1-4 3-4l-1-3c-2 1-3 3-3 5M13 4c4 0 7 1 7 1s1 3 1 7c-3 3-6 4-9 4l-3-3c0-3 1-6 4-9Z"/><circle cx="15" cy="9" r="1.5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>',
    msg: '<path d="M4 5h16v11H9l-5 4Z"/>',
  };
  const FILLED = { starf: '<path d="m12 2.8 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.4l-5.7 3 1.1-6.4L2.8 9.5l6.4-.9Z"/>' };

  const ico = (name, size = 20, cls = '') => {
    if (FILLED[name])
      return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round" aria-hidden="true">${FILLED[name]}</svg>`;
    return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || I.sparkle}</svg>`;
  };
  const stars = (n, size = 16) => {
    const r = Math.round(Number(n) || 0);
    return `<span class="stars" role="img" aria-label="${n} out of 5 stars">${[1, 2, 3, 4, 5].map((i) => ico(i <= r ? 'starf' : 'star', size, i <= r ? 'on' : 'off')).join('')}</span>`;
  };
  const NEARBY_ICON = { restaurants: 'utensils', shopping: 'store', attraction: 'camera', transport: 'car', nature: 'tree', airport: 'plane', schools: 'school', government: 'landmark' };
  const ICON_NAMES = Object.keys(I);

  window.S = { esc, DAY, toMs, fmt, addDays, diffDays, dow, MONTHS, MON, DOW, dateLabel, dateShort, monthYear, daysInMonth, parts, money, timeLabel, rich, ico, stars, NEARBY_ICON, ICON_NAMES };
})();
