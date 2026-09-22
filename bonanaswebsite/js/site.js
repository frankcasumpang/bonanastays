/* Public website. Every piece of content comes from /api/public (the admin database).
   When the admin changes anything the server pings /api/events and this page re-renders in place. */
(function () {
  'use strict';
  const { esc, ico, stars, money, dateLabel, dateShort, addDays, diffDays, rich, timeLabel, NEARBY_ICON, MONTHS, DOW, parts, daysInMonth, fmt, toMs } = S;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  let D = JSON.parse($('#boot').textContent);
  const STATIC = !!D.static; // exported snapshot (no server of ours)
  const NETLIFY = STATIC && !!D.staticCfg && D.staticCfg.forms === 'netlify'; // requests are collected by Netlify Forms
  const st = { checkIn: '', checkOut: '', guests: 2, suiteId: '', quote: null, done: null, filter: 'all' };
  let busyCache = {};

  const suiteById = (id) => D.suites.find((s) => s.id === id);
  const sym = () => D.pricing.symbol || '₱';
  const PH = STATIC ? 'img/placeholder/' : '/img/placeholder/';
  const isPh = (u) => !u || u.startsWith(PH);
  const safeHref = (u) => (/^(#|\/|https?:|tel:|mailto:|viber:)/i.test(u || '') ? u : '#');
  const catLabel = (k) => (D.categories.find((c) => c.key === k) || {}).label || k;
  const amenityByKey = (k) => D.amenities.find((a) => a.key === k);

  /* Only touch the DOM when the markup really changed, so live updates never flicker or reset scroll/hover. */
  const put = (el, html) => {
    if (!el) return;
    if (el._h === html) return;
    el._h = html;
    el.innerHTML = html;
  };

  const photosOf = (suite) =>
    D.photos.filter((p) => p.suiteId === suite.id).sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
  const cover = (suite) => (photosOf(suite)[0] || {}).url || PH + 'bedroom.svg';
  const realPhoto = () => (D.photos.find((p) => !isPh(p.url)) || {}).url;

  /* ---------------------------------------------------------------- theme & meta (live) */
  function applyTheme() {
    const t = $('#theme');
    if (t.textContent !== D.theme.css) t.textContent = D.theme.css;
    const link = $('link[href^="https://fonts.googleapis.com/css2"]');
    if (link && link.getAttribute('href') !== D.theme.fonts) link.setAttribute('href', D.theme.fonts);
    if (document.title !== D.meta.title) document.title = D.meta.title;
    if (D.meta.favicon) $('link[rel=icon]').setAttribute('href', D.meta.favicon);
  }

  /* ---------------------------------------------------------------- nav, promo, hero */
  const discountText = (p) => (p.type === 'amount' ? `${money(p.value, sym())} off` : `${p.value}% off`);
  const brand = () => {
    const p = D.property;
    return p.logo ? `<img class="logo" src="${esc(p.logo)}" alt="${esc(p.name)}">` : `<span class="brand-name">${esc(p.name)}</span>`;
  };

  function renderPromo() {
    const el = $('#promoBar');
    const p = D.homepage.showPromoBanner ? D.promotions[0] : null;
    if (!p || sessionStorage.getItem('promo-' + p.id)) return put(el, '');
    put(el, `<div class="promo-bar"><div class="wrap promo-in"><span><strong>${esc(p.name)}</strong> ${esc(discountText(p))}${p.code ? ` with code <button type="button" class="code" data-act="copy-code" data-code="${esc(p.code)}" title="Copy code">${esc(p.code)}${ico('copy', 14)}</button>` : ''}</span><a href="#booking">Book now</a><button type="button" class="promo-x" data-act="dismiss-promo" data-id="${esc(p.id)}" aria-label="Dismiss">${ico('x', 16)}</button></div></div>`);
  }

  function navLinks() {
    const h = D.homepage;
    return [
      ['home', 'Home', true],
      ['suites', 'Suites', true],
      ['amenities', 'Amenities', true],
      ['gallery', 'Gallery', h.showGallery && D.photos.length > 0],
      ['location', 'Location', h.showLocation],
      ['reviews', 'Reviews', h.showReviews && D.reviews.length > 0],
      ['contact', 'Contact', true],
    ].filter((l) => l[2]);
  }
  function renderNav() {
    const links = navLinks().map(([id, label]) => `<a href="#${id}">${label}</a>`).join('');
    put($('#nav'), `<div class="wrap nav-in"><a class="brand" href="#home" aria-label="${esc(D.property.name)} home">${brand()}</a><nav class="nav-links" aria-label="Main">${links}</nav><a class="btn btn-primary btn-sm nav-cta" href="#booking">Book Now</a><button type="button" class="nav-toggle" data-act="menu" aria-label="Menu" aria-expanded="false">${ico('menu', 24)}</button></div><div class="drawer" id="drawer">${links}<a class="btn btn-primary" href="#booking">Book Now</a></div>`);
  }

  function renderHero() {
    const h = D.homepage;
    const img = h.heroImage || realPhoto() || PH + 'hero.svg';
    const media = h.heroVideo
      ? `<video class="hero-media" autoplay muted loop playsinline poster="${esc(img)}" src="${esc(h.heroVideo)}"></video>`
      : `<img class="hero-media" src="${esc(img)}" alt="">`;
    put($('#heroBg'), media + '<div class="hero-shade"></div>');
    put($('#heroText'), `<h1>${esc(h.heroHeadline)}</h1><p class="lead">${esc(h.heroDescription)}</p><div class="hero-cta"><a class="btn btn-light btn-lg" href="${esc(safeHref(h.cta1Link))}">${esc(h.cta1Label)}</a><a class="btn btn-ghost btn-lg" href="${esc(safeHref(h.cta2Link))}">${esc(h.cta2Label)}</a></div>`);
  }

  /* ---------------------------------------------------------------- about + host */
  function renderAbout() {
    const h = D.homepage, p = D.property;
    const suite = D.suites[0];
    const second = suite ? photosOf(suite)[1] : null;
    const img = h.introImage || (second && second.url) || (D.photos.find((x) => x.category === 'living' || x.category === 'bathroom') || {}).url || PH + 'living.svg';
    const third = suite ? photosOf(suite)[2] : null;
    const mirrorImg = (third || D.photos.find((x) => x.url !== img)) && (third || D.photos.find((x) => x.url !== img)).url;
    const hostBits = [];
    if (p.hostYears) hostBits.push(`<li><strong>${esc(p.hostYears)}</strong><span>years hosting</span></li>`);
    if (p.hostRating) hostBits.push(`<li><strong>${ico('starf', 15, 'gold')} ${esc(p.hostRating)}</strong><span>${p.hostReviews ? esc(p.hostReviews) + ' host reviews' : 'host rating'}</span></li>`);
    if (p.hostResponse) hostBits.push(`<li><strong>${ico('clock', 15)}</strong><span>${esc(p.hostResponse)}</span></li>`);
    const initial = esc((p.ownerName || p.name || 'H').trim().charAt(0).toUpperCase());
    const host = p.ownerName
      ? `<div class="host"><div class="host-top">${p.hostPhoto ? `<img class="avatar" src="${esc(p.hostPhoto)}" alt="">` : `<span class="avatar">${initial}</span>`}<div><span class="host-by">Hosted by</span><strong>${esc(p.ownerName)}</strong></div></div>${p.hostBio ? `<p class="host-bio">${esc(p.hostBio)}</p>` : ''}${hostBits.length ? `<ul class="host-stats">${hostBits.join('')}</ul>` : ''}</div>`
      : '';
    put($('#about'), `<div class="wrap about-grid"><div class="about-copy"><h2>${esc(h.introHeading)}</h2><p class="lead">${esc(h.introText)}</p>${host}</div><div class="about-media"><img src="${esc(img)}" alt="Interior of ${esc(p.name)}" loading="lazy" decoding="async">${mirrorImg ? `<span class="mirror"><img src="${esc(mirrorImg)}" alt="" loading="lazy" decoding="async"></span>` : ''}</div></div>`);
  }

  /* ---------------------------------------------------------------- suites */
  const priceHtml = (s) => {
    const promo = Number(s.promoPrice) > 0;
    const rate = promo ? Number(s.promoPrice) : Number(s.priceRegular);
    if (!rate) return '<span class="ask">Ask for rates</span>';
    return `${promo && Number(s.priceRegular) > rate ? `<s>${money(s.priceRegular, sym())}</s>` : ''}<span class="amt">${money(rate, sym())}</span><span class="per"> / night</span>`;
  };
  const facts = (s) =>
    [
      ['users', `Up to ${s.maxGuests} guest${Number(s.maxGuests) > 1 ? 's' : ''}`],
      s.bedrooms !== '' && s.bedrooms != null ? ['home', `${s.bedrooms} bedroom${Number(s.bedrooms) === 1 ? '' : 's'}`] : null,
      ['bed', s.bedsText || `${s.beds} bed${Number(s.beds) === 1 ? '' : 's'}`],
      ['bath', s.bathroomText || `${s.bathrooms} bathroom${Number(s.bathrooms) === 1 ? '' : 's'}`],
    ].filter(Boolean);
  const ratingHtml = (s) => (s.rating.count ? `<span class="rate">${ico('starf', 15, 'gold')}<b>${s.rating.avg.toFixed(1)}</b><small>${s.rating.count} review${s.rating.count > 1 ? 's' : ''}</small></span>` : '');

  function suiteCard(s) {
    const am = (s.amenities || []).map(amenityByKey).filter(Boolean);
    const chips = am.slice(0, 5).map((a) => `<li>${ico(a.icon, 16)}${esc(a.label)}</li>`).join('') + (am.length > 5 ? `<li class="more">+${am.length - 5} more</li>` : '');
    const n = photosOf(s).length;
    return `<article class="suite"><button type="button" class="suite-media" data-act="view-suite" data-id="${esc(s.id)}" aria-label="View ${esc(s.name)}"><img src="${esc(cover(s))}" alt="${esc(s.name)}" loading="lazy" decoding="async">${n > 1 ? `<span class="badge">${ico('image', 14)} ${n} photos</span>` : ''}</button><div class="suite-body"><div class="suite-head"><h3>${esc(s.name)}</h3>${ratingHtml(s)}</div><p class="suite-desc">${esc(s.shortDescription)}</p><ul class="facts">${facts(s).map(([i, t]) => `<li>${ico(i, 18)}<span>${esc(t)}</span></li>`).join('')}</ul>${chips ? `<ul class="chips">${chips}</ul>` : ''}<div class="suite-foot"><div class="price">${priceHtml(s)}</div><div class="suite-actions"><button type="button" class="btn btn-outline" data-act="view-suite" data-id="${esc(s.id)}">View Suite</button><button type="button" class="btn btn-primary" data-act="book-suite" data-id="${esc(s.id)}">Book Now</button></div></div></div></article>`;
  }
  function renderSuites() {
    const h = D.homepage;
    const feat = h.featuredSuites || [];
    const list = [...D.suites].sort((a, b) => feat.includes(b.id) - feat.includes(a.id));
    put($('#suites'), `<div class="wrap"><div class="sec-head"><h2>${esc(h.suitesHeading)}</h2></div><div class="suites n${Math.min(list.length, 3)}">${list.map(suiteCard).join('') || '<p class="empty">Suites will appear here soon.</p>'}</div></div>`);
  }

  /* ---------------------------------------------------------------- amenities */
  function renderAmenities() {
    const h = D.homepage;
    let keys = h.featuredAmenities && h.featuredAmenities.length ? h.featuredAmenities : [...new Set(D.suites.flatMap((s) => s.amenities || []))];
    const list = D.amenities.filter((a) => keys.includes(a.key));
    put($('#amenities'), `<div class="wrap amen-grid"><div class="amen-copy"><h2>${esc(h.amenitiesHeading)}</h2></div><ul class="amen-list">${list.map((a) => `<li>${ico(a.icon, 28)}<span>${esc(a.label)}</span></li>`).join('')}</ul></div>`);
  }

  /* ---------------------------------------------------------------- gallery + lightbox */
  const galleryList = () => D.photos.filter((p) => st.filter === 'all' || p.category === st.filter);
  function renderGallery() {
    const sec = $('#gallery');
    const show = D.homepage.showGallery && D.photos.length > 0;
    sec.hidden = !show;
    if (!show) return put(sec, '');
    const cats = D.categories.filter((c) => D.photos.some((p) => p.category === c.key));
    if (st.filter !== 'all' && !cats.some((c) => c.key === st.filter)) st.filter = 'all';
    const list = galleryList();
    const items = list.slice(0, 8).map((p, i) => `<figure class="gal-item"><button type="button" data-act="lightbox" data-i="${i}" aria-label="Open photo: ${esc(p.caption || catLabel(p.category))}"><img src="${esc(p.url)}" alt="${esc(p.caption || catLabel(p.category))}" loading="lazy" decoding="async"><span class="gal-cap"><b>${esc(p.caption || catLabel(p.category))}</b>${ico('expand', 18)}</span></button></figure>`).join('');
    put(sec, `<div class="wrap"><div class="sec-head"><h2>${esc(D.homepage.galleryHeading)}</h2>${cats.length > 1 ? `<div class="filters" role="tablist">${[{ key: 'all', label: 'All' }, ...cats].map((c) => `<button type="button" role="tab" aria-selected="${st.filter === c.key}" class="${st.filter === c.key ? 'on' : ''}" data-act="filter" data-key="${esc(c.key)}">${esc(c.label)}</button>`).join('')}</div>` : ''}</div><div class="masonry">${items}</div><div class="center"><button type="button" class="btn btn-outline btn-lg" data-act="lightbox" data-i="0">View Full Gallery</button></div></div>`);
  }
  let lb = null;
  function openLightbox(i) {
    lb = { list: galleryList(), i: Number(i) || 0 };
    drawLightbox();
    document.body.classList.add('locked');
  }
  function drawLightbox() {
    const p = lb.list[lb.i];
    if (!p) return closeLayer();
    put($('#layer'), `<div class="lightbox" role="dialog" aria-modal="true" aria-label="Photo gallery"><button type="button" class="lb-close" data-act="close" aria-label="Close">${ico('x', 26)}</button><button type="button" class="lb-nav prev" data-act="lb-prev" aria-label="Previous photo">${ico('chevL', 28)}</button><figure><img src="${esc(p.url)}" alt="${esc(p.caption)}"><figcaption>${esc(p.caption || catLabel(p.category))}<small>${lb.i + 1} of ${lb.list.length}</small></figcaption></figure><button type="button" class="lb-nav next" data-act="lb-next" aria-label="Next photo">${ico('chevR', 28)}</button></div>`);
  }

  /* ---------------------------------------------------------------- experience */
  function renderExperience() {
    const h = D.homepage, sec = $('#experience');
    sec.hidden = !h.showExperience;
    sec.style.backgroundImage = h.experienceImage ? `linear-gradient(rgba(24,22,20,.78),rgba(24,22,20,.82)),url("${h.experienceImage.replace(/"/g, '%22')}")` : '';
    if (!h.showExperience) return put(sec, '');
    put(sec, `<div class="wrap"><h2>${esc(h.experienceHeading)}</h2><div class="exp-grid">${(h.experience || []).map((c) => `<div class="exp">${ico(c.icon || 'sparkle', 34)}<h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></div>`).join('')}</div></div>`);
  }

  /* ---------------------------------------------------------------- location */
  function mapSrc() {
    const l = D.location;
    if (/^https:\/\//.test(l.mapEmbedUrl || '')) return l.mapEmbedUrl;
    const q = l.lat && l.lng ? `${l.lat},${l.lng}` : [l.address, l.country].filter(Boolean).join(', ');
    return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed`;
  }
  function renderLocation() {
    const l = D.location, sec = $('#location');
    sec.hidden = !D.homepage.showLocation;
    if (!D.homepage.showLocation) return put(sec, '');
    const rows = (l.nearby || []).map((n) => `<li>${ico(NEARBY_ICON[n.category] || 'pin', 22)}<span class="n">${esc(n.name)}</span><span class="t">${esc(n.time)}</span></li>`);
    if (l.airportDistance) rows.push(`<li>${ico('plane', 22)}<span class="n">Airport</span><span class="t">${esc(l.airportDistance)}</span></li>`);
    if (l.beachDistance) rows.push(`<li>${ico('tree', 22)}<span class="n">Beach and nature</span><span class="t">${esc(l.beachDistance)}</span></li>`);
    const dest = l.lat && l.lng ? `${l.lat},${l.lng}` : encodeURIComponent([l.address, l.country].filter(Boolean).join(', '));
    const dir = l.mapsLink || `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    put(sec, `<div class="wrap loc-grid"><div class="loc-info"><h2>${esc(D.homepage.locationHeading)}</h2><p class="addr">${ico('pin', 20)}<span>${esc([l.address, l.country].filter(Boolean).join(', '))}</span></p>${l.addressNote ? `<p class="muted">${esc(l.addressNote)}</p>` : ''}${rows.length ? `<ul class="nearby">${rows.join('')}</ul>` : ''}${l.landmarks ? `<p class="muted">${esc(l.landmarks)}</p>` : ''}<a class="btn btn-primary btn-lg" href="${esc(safeHref(dir))}" target="_blank" rel="noopener">${ico('directions', 18)} Get Directions</a></div><div class="loc-map"><iframe src="${esc(mapSrc())}" title="Map of ${esc(D.property.name)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div></div>`);
  }

  /* ---------------------------------------------------------------- reviews */
  function renderReviews() {
    const sec = $('#reviews');
    const show = D.homepage.showReviews && D.reviews.length > 0;
    sec.hidden = !show;
    if (!show) return put(sec, '');
    const r = D.rating, p = D.property;
    const cards = D.reviews.map((v) => {
      const when = v.date ? (() => { const [y, m] = parts(v.date); return `${MONTHS[m - 1]} ${y}`; })() : '';
      return `<blockquote class="rev">${stars(v.rating)}<p>${esc(v.text)}</p><footer>${v.photo ? `<img class="avatar" src="${esc(v.photo)}" alt="">` : `<span class="avatar">${esc((v.name || '?').charAt(0).toUpperCase())}</span>`}<div><cite>${esc(v.name)}</cite><small>${esc([when, v.source ? 'via ' + v.source : ''].filter(Boolean).join(', '))}</small></div></footer></blockquote>`;
    }).join('');
    put(sec, `<div class="wrap"><div class="rev-head"><h2>${esc(D.homepage.reviewsHeading)}</h2><div class="rev-sum"><span class="big">${r.avg.toFixed(1)}<small>/ 5</small></span><div>${stars(r.avg, 18)}<span class="muted">Guest rating from ${r.count} review${r.count > 1 ? 's' : ''}</span>${p.hostRating && p.hostReviews ? `<span class="muted">Host rating ${esc(p.hostRating)} across ${esc(p.hostReviews)} reviews</span>` : ''}</div></div></div><div class="rev-track" id="revTrack" tabindex="0">${cards}</div><div class="rev-nav" id="revNav"><button type="button" data-act="rev-prev" aria-label="Previous reviews">${ico('chevL', 22)}</button><button type="button" data-act="rev-next" aria-label="Next reviews">${ico('chevR', 22)}</button></div></div>`);
    requestAnimationFrame(() => { const t = $('#revTrack'), n = $('#revNav'); if (t && n) n.hidden = t.scrollWidth <= t.clientWidth + 4; armReveal(); });
  }

  /* ---------------------------------------------------------------- booking side content */
  function renderBookHead() {
    put($('#bookHead'), `<h2>${esc(D.homepage.bookingHeading)}</h2><p class="lead">${esc(D.homepage.bookingText)}</p>`);
  }
  function renderBookAside() {
    const r = D.rules, po = D.policies;
    const rowsA = [
      ['clock', 'Check-in', 'after ' + timeLabel(r.checkInTime)],
      ['clock', 'Check-out', 'before ' + timeLabel(r.checkOutTime)],
      D.suites.length ? ['users', 'Guests', 'up to ' + Math.max(...D.suites.map((s) => Number(s.maxGuests) || 1))] : null,
      r.requireId ? ['key', 'At check-in', 'valid ID required'] : null,
    ].filter(Boolean).map(([i, k, v]) => `<li>${ico(i, 18)}<span>${k}</span><b>${esc(v)}</b></li>`).join('');
    const promos = D.promotions.map((p) => `<li class="promo-item"><div><b>${esc(p.name)}</b><span>${esc(discountText(p))}${p.minStay > 1 ? `, ${p.minStay}+ nights` : ''}</span></div>${p.code ? `<button type="button" class="code" data-act="copy-code" data-code="${esc(p.code)}">${esc(p.code)}${ico('copy', 14)}</button>` : ''}</li>`).join('');
    const pay = D.payments.methods.length ? `<div class="aside-block"><h4>Payment options</h4><p>${D.payments.methods.map((m) => esc(m.label)).join(', ')}</p>${r.depositRequired ? `<p class="muted">A ${r.depositPercent}% deposit secures your booking.</p>` : ''}</div>` : '';
    const links = [['houseRules', 'House rules'], ['cancellation', 'Cancellation policy'], ['safety', 'Safety']].filter(([k]) => (po[k] || '').trim()).map(([k, l]) => `<button type="button" class="link" data-act="policy" data-key="${k}">${l}</button>`).join('');
    put($('#bookAside'), `<div class="aside-block"><h4>Good to know</h4><ul class="kv">${rowsA}</ul></div>${promos ? `<div class="aside-block"><h4>Offers</h4><ul class="promos">${promos}</ul></div>` : ''}${pay}${links ? `<div class="aside-block links">${links}</div>` : ''}`);
  }

  /* ---------------------------------------------------------------- contact + footer + chat */
  const digits = (v) => String(v || '').replace(/\D/g, '');
  const waLink = (v) => (/^https?:/.test(v) ? v : `https://wa.me/${digits(v)}`);
  const msLink = (v) => (/^https?:/.test(v) ? v : `https://m.me/${String(v).replace(/^@/, '')}`);
  const socialLink = (v, base) => (/^https?:/.test(v) ? v : base + String(v).replace(/^@/, ''));
  function contactRows() {
    const c = D.contact, l = D.location;
    return [
      c.phone && ['phone', 'Phone', c.phone, 'tel:' + c.phone.replace(/[^\d+]/g, '')],
      c.email && ['mail', 'Email', c.email, 'mailto:' + c.email],
      c.messenger && ['messenger', 'Messenger', 'Chat on Messenger', msLink(c.messenger)],
      !c.messenger && c.facebook && ['facebook', 'Facebook', 'Visit our Facebook page', socialLink(c.facebook, 'https://facebook.com/')],
      c.whatsapp && ['whatsapp', 'WhatsApp', c.whatsapp, waLink(c.whatsapp)],
      c.viber && ['viber', 'Viber', c.viber, 'viber://chat?number=%2B' + digits(c.viber)],
      l.address && ['pin', 'Address', [l.address, l.country].filter(Boolean).join(', '), ''],
      c.receptionHours && ['clock', 'Support hours', c.receptionHours, ''],
      c.emergencyContact && ['shield', 'Emergency contact', c.emergencyContact, /[\d]{7,}/.test(c.emergencyContact) ? 'tel:' + c.emergencyContact.replace(/[^\d+]/g, '') : ''],
    ].filter(Boolean);
  }
  const socials = () => {
    const c = D.contact;
    return [
      c.facebook && ['facebook', 'Facebook', socialLink(c.facebook, 'https://facebook.com/')],
      c.instagram && ['instagram', 'Instagram', socialLink(c.instagram, 'https://instagram.com/')],
      c.tiktok && ['tiktok', 'TikTok', socialLink(c.tiktok, 'https://tiktok.com/@')],
    ].filter(Boolean).map(([i, n, u]) => `<a class="soc" href="${esc(safeHref(u))}" target="_blank" rel="noopener" aria-label="${n}">${ico(i, 20)}</a>`).join('');
  };
  function renderContact() {
    const rows = contactRows().map(([i, k, v, href]) => `<li>${ico(i, 22)}<div><span>${k}</span>${href ? `<a href="${esc(safeHref(href))}"${href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${esc(v)}</a>` : `<b>${esc(v)}</b>`}</div></li>`).join('');
    put($('#contactInfo'), `<h2>${esc(D.homepage.contactHeading)}</h2><p class="lead">Send us a message and we will get back to you as soon as we can.</p><ul class="contact-list">${rows}</ul><div class="socials">${socials()}</div>`);
    const cs = $('#contactStatic');
    if (STATIC && !NETLIFY && cs) {
      const c = D.contact;
      const btns = [
        c.whatsapp && ['whatsapp', 'Message on WhatsApp', waLink(c.whatsapp)],
        c.messenger && ['messenger', 'Message on Messenger', msLink(c.messenger)],
        !c.messenger && c.facebook && ['facebook', 'Message us on Facebook', socialLink(c.facebook, 'https://facebook.com/')],
        c.phone && ['phone', 'Call ' + c.phone, 'tel:' + c.phone.replace(/[^\d+]/g, '')],
        c.email && ['mail', 'Email ' + c.email, 'mailto:' + c.email],
      ].filter(Boolean);
      $('#contactForm').hidden = true;
      cs.hidden = false;
      put(cs, `<h3>Send us a message</h3><p class="muted">The quickest way to reach us. We usually reply within the hour.</p><div class="contact-btns">${btns.map(([i, l, u], n) => `<a class="btn ${n ? 'btn-outline' : 'btn-primary'} btn-lg" href="${esc(safeHref(u))}"${u.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${ico(i, 20)} ${esc(l)}</a>`).join('')}</div>`);
    }
  }
  function renderFooter() {
    const p = D.property, po = D.policies;
    const qlinks = navLinks().map(([id, l]) => `<li><a href="#${id}">${l}</a></li>`).join('') + '<li><a href="#booking">Book Now</a></li>';
    const suites = D.suites.map((s) => `<li><button type="button" class="link" data-act="view-suite" data-id="${esc(s.id)}">${esc(s.name)}</button></li>`).join('');
    const contact = contactRows().filter((r) => ['phone', 'mail', 'pin'].includes(r[0])).map(([i, , v, href]) => `<li>${ico(i, 16)}${href ? `<a href="${esc(safeHref(href))}">${esc(v)}</a>` : `<span>${esc(v)}</span>`}</li>`).join('');
    const legal = [['privacy', 'Privacy Policy'], ['terms', 'Terms & Conditions'], ['houseRules', 'House Rules']].filter(([k]) => (po[k] || '').trim()).map(([k, l]) => `<button type="button" class="link" data-act="policy" data-key="${k}">${l}</button>`).join('');
    put($('#footer'), `<div class="wrap foot-grid"><div class="foot-brand"><div class="brand light">${brand()}</div><p>${esc(p.description)}</p><div class="socials">${socials()}</div></div><div><h4>Quick links</h4><ul>${qlinks}</ul></div><div><h4>Suites</h4><ul>${suites}</ul></div><div><h4>Contact</h4><ul class="foot-contact">${contact}</ul></div></div><div class="wrap foot-bar"><span>&copy; ${new Date().getFullYear()} ${esc(p.name)}. All Rights Reserved.</span><span class="legal">${legal}</span></div>`);
  }
  function renderChat() {
    const c = D.contact;
    const link = c.whatsapp ? [waLink(c.whatsapp), 'whatsapp', 'Chat on WhatsApp'] : c.messenger ? [msLink(c.messenger), 'messenger', 'Chat on Messenger'] : c.facebook ? [socialLink(c.facebook, 'https://facebook.com/'), 'facebook', 'Visit our Facebook page'] : null;
    put($('#chat'), c.chatButton && link ? `<a class="chat-fab" href="${esc(safeHref(link[0]))}" target="_blank" rel="noopener" aria-label="${link[2]}">${ico(link[1], 26)}</a>` : '');
  }

  /* ---------------------------------------------------------------- modals */
  const layer = () => $('#layer');
  function closeLayer() {
    lb = null;
    put(layer(), '');
    document.body.classList.remove('locked');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  let lastFocus = null;
  function openModal(html, cls = '') {
    lastFocus = document.activeElement;
    put(layer(), `<div class="backdrop" data-act="close"></div><div class="modal ${cls}" role="dialog" aria-modal="true"><button type="button" class="modal-x" data-act="close" aria-label="Close">${ico('x', 22)}</button>${html}</div>`);
    document.body.classList.add('locked');
    const x = $('.modal-x', layer());
    if (x) x.focus({ preventScroll: true });
  }
  const POLICY = { houseRules: 'House Rules', cancellation: 'Cancellation Policy', refund: 'Refund Policy', privacy: 'Privacy Policy', terms: 'Terms & Conditions', safety: 'Safety Information', emergency: 'Emergency Procedures' };
  function openPolicy(key) {
    let body = rich(D.policies[key]);
    if (key === 'houseRules') {
      const extra = [['checkInPolicy', 'Check-in'], ['checkOutPolicy', 'Check-out'], ['earlyCheckIn', 'Early check-in'], ['lateCheckOut', 'Late check-out'], ['quietHours', 'Quiet hours'], ['visitorPolicy', 'Visitors'], ['petPolicy', 'Pets'], ['smokingPolicy', 'Smoking'], ['idRequirements', 'ID requirements']].filter(([k]) => (D.policies[k] || '').trim());
      body += extra.map(([k, l]) => `<h4>${l}</h4>${rich(D.policies[k])}`).join('');
    }
    openModal(`<div class="modal-body prose"><h3>${POLICY[key]}</h3>${body}</div>`, 'narrow');
  }

  function openSuite(id) {
    const s = suiteById(id);
    if (!s) return;
    const ph = photosOf(s);
    const imgs = ph.length ? ph : [{ url: PH + 'bedroom.svg', caption: s.name }];
    const am = (s.amenities || []).map(amenityByKey).filter(Boolean);
    const dl = [
      ['Suite type', s.type], ['Unit', s.unitNumber], ['Floor', s.floor], ['Room size', s.roomSize], ['View', s.viewType],
      ['Balcony', s.balcony ? 'Yes' : ''], ['Smoking', s.smoking], ['Pets', s.petPolicy], ['Accessibility', s.accessibility],
    ].filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
    const rates = [
      Number(s.priceWeekend) > 0 && ['Weekend night', money(s.priceWeekend, sym())],
      Number(s.priceHoliday) > 0 && ['Holiday night', money(s.priceHoliday, sym())],
      Number(s.priceWeekly) > 0 && ['Weekly rate', money(s.priceWeekly, sym())],
      Number(s.priceMonthly) > 0 && ['Monthly rate', money(s.priceMonthly, sym())],
      Number(s.cleaningFee) > 0 && ['Cleaning fee', money(s.cleaningFee, sym())],
      Number(s.securityDeposit) > 0 && ['Refundable security deposit', money(s.securityDeposit, sym())],
      Number(s.extraGuestFee) > 0 && ['Additional guest, per night', money(s.extraGuestFee, sym())],
      Number(s.extraBedFee) > 0 && ['Extra bed, per night', money(s.extraBedFee, sym())],
      Number(s.minStay) > 1 && ['Minimum stay', `${s.minStay} nights`],
    ].filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
    openModal(`<div class="sm"><div class="sm-gallery"><div class="sm-main"><img id="smMain" src="${esc(imgs[0].url)}" alt="${esc(imgs[0].caption || s.name)}"></div>${imgs.length > 1 ? `<div class="sm-thumbs">${imgs.map((p, i) => `<button type="button" class="${i ? '' : 'on'}" data-act="thumb" data-src="${esc(p.url)}" aria-label="Photo ${i + 1}"><img src="${esc(p.url)}" alt=""></button>`).join('')}</div>` : ''}</div><div class="sm-body"><div class="suite-head"><h3>${esc(s.name)}</h3>${ratingHtml(s)}</div><ul class="facts">${facts(s).map(([i, t]) => `<li>${ico(i, 18)}<span>${esc(t)}</span></li>`).join('')}</ul><div class="prose">${rich(s.description || s.shortDescription)}</div>${dl ? `<h4>Details</h4><dl class="dl">${dl}</dl>` : ''}${am.length ? `<h4>What this suite offers</h4><ul class="sm-amen">${am.map((a) => `<li>${ico(a.icon, 20)}${esc(a.label)}</li>`).join('')}</ul>` : ''}${rates ? `<h4>Rates and fees</h4><dl class="dl">${rates}</dl>` : ''}<p class="muted">Check-in after ${timeLabel(D.rules.checkInTime)}. Check-out before ${timeLabel(D.rules.checkOutTime)}.</p>${/^https:/.test(s.virtualTourUrl || '') ? `<a class="btn btn-outline" href="${esc(s.virtualTourUrl)}" target="_blank" rel="noopener">${ico('cube', 18)} Take the 360° tour</a>` : ''}</div><div class="sm-foot"><div class="price">${priceHtml(s)}</div><button type="button" class="btn btn-primary btn-lg" data-act="book-suite" data-id="${esc(s.id)}">Book this suite</button></div></div>`, 'wide');
  }

  /* ---------------------------------------------------------------- availability + date picker */
  const busySet = (id) => busyCache[id] || (busyCache[id] = new Set((suiteById(id) || {}).busy || []));
  const candidateIds = () => (st.suiteId ? [st.suiteId] : D.suites.map((s) => s.id));
  const nightFree = (d) => candidateIds().some((id) => !busySet(id).has(d));
  /* Latest possible check-out for a given check-in: up to the first occupied night. */
  function lastCheckout(ci) {
    let best = ci;
    candidateIds().forEach((id) => {
      const b = busySet(id);
      let d = ci, n = 0;
      while (!b.has(d) && n < 60) { d = addDays(d, 1); n++; }
      if (d > best) best = d;
    });
    return best;
  }
  const minNights = () => {
    const ids = candidateIds();
    const m = ids.map((id) => Number((suiteById(id) || {}).minStay) || Number(D.rules.minStay) || 1);
    return m.length ? Math.min(...m) : 1;
  };

  const cal = { on: false, which: 'in', month: '', anchor: null, hover: '' };
  function openCal(anchor, which) {
    cal.on = true;
    cal.which = which;
    cal.anchor = anchor;
    const base = which === 'out' && st.checkIn ? st.checkIn : st.checkIn || D.today;
    cal.month = base.slice(0, 7) + '-01';
    drawCal();
    const pop = $('#cal');
    requestAnimationFrame(() => pop && pop.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }
  function closeCal() {
    cal.on = false;
    const el = $('#cal');
    if (el) el.remove();
  }
  function monthGrid(m) {
    const [y, mo] = parts(m);
    const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
    const n = daysInMonth(y, mo);
    const maxOut = st.checkIn ? lastCheckout(st.checkIn) : '';
    const mn = minNights();
    let cells = '';
    for (let i = 0; i < first; i++) cells += '<span></span>';
    for (let d = 1; d <= n; d++) {
      const date = `${m.slice(0, 8)}${String(d).padStart(2, '0')}`;
      let dis = date < D.today;
      let cls = '';
      if (!dis) {
        if (cal.which === 'in' || !st.checkIn) { if (!nightFree(date)) { dis = true; cls += ' busy'; } }
        else if (date <= st.checkIn) dis = date !== st.checkIn ? true : false;
        else if (date > maxOut) { dis = true; if (!nightFree(date)) cls += ' busy'; }
        else if (diffDays(st.checkIn, date) < mn) dis = true;
      }
      const end = st.checkOut || (cal.which === 'out' ? cal.hover : '');
      if (st.checkIn && date === st.checkIn) cls += ' sel start';
      if (st.checkOut && date === st.checkOut) cls += ' sel end';
      if (st.checkIn && end && date > st.checkIn && date < end) cls += ' mid';
      if (date === D.today) cls += ' today';
      cells += `<button type="button" class="d${cls}" data-act="cal-day" data-date="${date}"${dis ? ' disabled' : ''}>${d}</button>`;
    }
    return `<div class="cal-month"><h5>${MONTHS[mo - 1]} ${y}</h5><div class="cal-dow">${DOW.map((x) => `<span>${x}</span>`).join('')}</div><div class="cal-days">${cells}</div></div>`;
  }
  const shiftMonth = (m, n) => { const [y, mo] = parts(m); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return fmt(d.getTime()); };
  function drawCal() {
    let el = $('#cal');
    if (!el) { el = document.createElement('div'); el.id = 'cal'; el.className = 'cal'; document.body.appendChild(el); }
    const two = window.innerWidth >= 900;
    const canPrev = cal.month > D.today.slice(0, 7) + '-01';
    const mn = minNights();
    el.innerHTML = `<div class="cal-top"><button type="button" data-act="cal-prev" aria-label="Previous month" ${canPrev ? '' : 'disabled'}>${ico('chevL', 20)}</button><strong>${cal.which === 'in' ? 'Choose your check-in date' : 'Choose your check-out date'}</strong><button type="button" data-act="cal-next" aria-label="Next month">${ico('chevR', 20)}</button></div><div class="cal-months">${monthGrid(cal.month)}${two ? monthGrid(shiftMonth(cal.month, 1)) : ''}</div><div class="cal-foot"><span>${mn > 1 ? `Minimum stay: ${mn} nights` : 'Crossed-out dates are taken'}</span><button type="button" class="link" data-act="cal-close">Close</button></div>`;
    if (window.innerWidth >= 720 && cal.anchor) {
      const r = cal.anchor.getBoundingClientRect();
      const w = two ? 640 : 340;
      let left = Math.min(Math.max(12, r.left + window.scrollX), window.scrollX + window.innerWidth - w - 12);
      el.style.cssText = `top:${r.bottom + window.scrollY + 10}px;left:${left}px;width:${w}px`;
    } else el.style.cssText = '';
  }
  function pickDay(date) {
    if (cal.which === 'in' || !st.checkIn || date <= st.checkIn) {
      st.checkIn = date;
      if (st.checkOut && (st.checkOut <= date || st.checkOut > lastCheckout(date))) st.checkOut = '';
      cal.which = 'out';
      resetQuote();
      syncUI();
      drawCal();
    } else {
      st.checkOut = date;
      resetQuote();
      syncUI();
      closeCal();
    }
  }

  /* ---------------------------------------------------------------- form state <-> UI */
  function fillSelects() {
    const maxG = st.suiteId ? Number((suiteById(st.suiteId) || {}).maxGuests) || 1 : Math.max(1, ...D.suites.map((s) => Number(s.maxGuests) || 1));
    if (st.guests > maxG) st.guests = maxG;
    const gOpts = Array.from({ length: maxG }, (_, i) => `<option value="${i + 1}"${st.guests === i + 1 ? ' selected' : ''}>${i + 1} guest${i ? 's' : ''}</option>`).join('');
    const sOpts = (D.suites.length > 1 ? `<option value="">Any suite</option>` : '') + D.suites.map((s) => `<option value="${esc(s.id)}"${st.suiteId === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
    $$('select[data-sync=guests]').forEach((el) => { if (el._o !== gOpts) { el._o = gOpts; el.innerHTML = gOpts; } el.value = st.guests; });
    $$('select[data-sync=suiteId]').forEach((el) => { if (el._o !== sOpts) { el._o = sOpts; el.innerHTML = sOpts; } el.value = st.suiteId; });
    const pay = $('select[name=payment]');
    const field = $('#payField');
    if (pay) {
      const opts = D.payments.methods.map((m) => `<option value="${esc(m.key)}">${esc(m.label)}</option>`).join('');
      if (pay._o !== opts) { const cur = pay.value; pay._o = opts; pay.innerHTML = opts; if (cur) pay.value = cur; }
      field.hidden = D.payments.methods.length < 2;
    }
  }
  function syncUI() {
    if (D.suites.length === 1) st.suiteId = D.suites[0].id;
    if (st.suiteId && !suiteById(st.suiteId)) st.suiteId = '';
    fillSelects();
    $$('[data-val=checkIn]').forEach((el) => { el.textContent = st.checkIn ? dateLabel(st.checkIn) : 'Add date'; el.classList.toggle('set', !!st.checkIn); });
    $$('[data-val=checkOut]').forEach((el) => { el.textContent = st.checkOut ? dateLabel(st.checkOut) : 'Add date'; el.classList.toggle('set', !!st.checkOut); });
  }
  function resetQuote() {
    st.quote = null;
    const p = $('#quotePanel');
    p.hidden = true;
    p._h = '';
    p.innerHTML = '';
    $('#bookMsg').hidden = true;
  }

  /* ---------------------------------------------------------------- quote + booking */
  /* Static export: the same pricing engine runs in the browser (js/pricing.js) against the exported snapshot. */
  function staticQuote(b) {
    const suite = D.suites.find((x) => x.id === b.suiteId);
    const c = D.staticCfg;
    const settings = {
      rules: { minStay: D.rules.minStay, maxStay: D.rules.maxStay, maxAdvanceDays: c.maxAdvanceDays, holdPending: true, depositRequired: D.rules.depositRequired, depositPercent: D.rules.depositPercent },
      pricing: { symbol: D.pricing.symbol, currency: D.pricing.currency, taxPercent: D.pricing.taxPercent, weekendDays: c.weekendDays, holidays: c.holidays, tzOffset: c.tzOffset },
    };
    const blocks = suite ? suite.busy.map((d) => ({ suiteId: suite.id, start: d, end: d })) : [];
    return window.Pricing.quote({ suite, settings, promotions: D.promotions, bookings: [], blocks, input: { checkIn: b.checkIn, checkOut: b.checkOut, guests: b.guests, promoCode: b.promoCode } });
  }
  /* Netlify Forms: the export contains hidden forms named "booking" and "inquiry"; posting to "/" stores a submission. */
  async function netlifyPost(formName, fields) {
    const fail = { status: 0, data: { error: 'We could not send that automatically. Please message us on Facebook instead.' } };
    try {
      const r = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ 'form-name': formName, ...fields }).toString() });
      return r.ok ? { status: r.status, data: { ok: true } } : fail;
    } catch (e) { return fail; }
  }
  const api = async (url, body) => {
    if (STATIC && url === '/api/quote') return { status: 200, data: staticQuote(body) };
    if (STATIC && url === '/api/inquiries') return netlifyPost('inquiry', { name: body.name, email: body.email, message: body.message, website: body.website || '' });
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let j = {};
    try { j = await r.json(); } catch (e) { /* ignore */ }
    return { status: r.status, data: j };
  };
  const showMsg = (el, text, ok) => { el.hidden = !text; el.textContent = text || ''; el.className = 'form-msg' + (ok ? ' ok' : ''); };
  const form = () => $('#bookForm');
  const promoCode = () => form().elements.promo.value.trim();

  async function checkAvailability(silent) {
    const msg = $('#bookMsg'), panel = $('#quotePanel');
    if (!st.checkIn || !st.checkOut) {
      showMsg(msg, 'Please choose your check-in and check-out dates.');
      return openCal($('#bookForm [data-which=' + (st.checkIn ? 'out' : 'in') + ']'), st.checkIn ? 'out' : 'in');
    }
    showMsg(msg, '');
    const btn = $('#bookCheck');
    if (!silent) { btn.disabled = true; btn.textContent = 'Checking...'; }
    const ids = candidateIds();
    const res = await Promise.all(ids.map((id) => api('/api/quote', { suiteId: id, checkIn: st.checkIn, checkOut: st.checkOut, guests: st.guests, promoCode: promoCode() })));
    btn.disabled = false;
    btn.textContent = 'Check Availability';
    const quotes = res.map((r) => r.data);
    if (st.suiteId) {
      const q = quotes[0];
      if (!q || !q.ok) { st.quote = null; panel.hidden = false; return put(panel, `<div class="q-none">${ico('calendar', 22)}<p>${esc((q && q.error) || 'Something went wrong. Please try again.')}</p></div>`); }
      st.quote = q;
      return renderQuote();
    }
    const okList = quotes.filter((q) => q.ok);
    panel.hidden = false;
    if (!okList.length) return put(panel, `<div class="q-none">${ico('calendar', 22)}<p>${esc((quotes[0] && quotes[0].error) || 'No suites are available for those dates.')}</p></div>`);
    put(panel, `<div class="q-pick"><strong>Available for your dates</strong>${okList.map((q) => `<button type="button" class="q-opt" data-act="pick-suite" data-id="${esc(q.suiteId)}"><span>${esc(q.suiteName)}<small>${q.nights} night${q.nights > 1 ? 's' : ''}</small></span><b>${money(q.total, q.symbol)}</b></button>`).join('')}</div>`);
  }

  function renderQuote() {
    const q = st.quote, panel = $('#quotePanel');
    if (!q) return;
    const lines = q.lines.map((l) => `<li class="${l.amount < 0 ? 'neg' : ''}"><span>${esc(l.label)}</span><span>${money(l.amount, q.symbol)}</span></li>`).join('');
    const auto = D.rules.autoConfirm;
    panel.hidden = false;
    put(panel, `<div class="q-head"><strong>${esc(q.suiteName)}</strong><span>${dateLabel(q.checkIn)} to ${dateLabel(q.checkOut)}, ${q.nights} night${q.nights > 1 ? 's' : ''}, ${q.guests} guest${q.guests > 1 ? 's' : ''}</span></div><ul class="q-lines">${lines}</ul><div class="q-total"><span>Total</span><strong>${money(q.total, q.symbol)}</strong></div>${q.depositDue ? `<p class="fine">Deposit to secure your booking: <b>${money(q.depositDue, q.symbol)}</b></p>` : ''}${q.securityDeposit ? `<p class="fine">Refundable security deposit of ${money(q.securityDeposit, q.symbol)} is collected at check-in.</p>` : ''}${q.promoMessage ? `<p class="fine warn">${esc(q.promoMessage)}</p>` : ''}<button type="button" class="btn btn-primary btn-lg" id="confirmBtn" data-act="confirm-booking">${STATIC && !NETLIFY ? 'Prepare Booking Request' : STATIC ? 'Send Booking Request' : auto ? 'Confirm Booking' : 'Send Booking Request'}</button><p class="fine">${STATIC && !NETLIFY ? 'Next you will get a ready-made message to send us. We confirm availability and send payment details. You are not charged yet.' : STATIC ? "You won't be charged yet. We will confirm your request and send payment details." : auto ? 'Your booking is confirmed as soon as you submit.' : "You won't be charged yet. We will confirm your request and send payment details."}</p>`);
  }

  async function confirmBooking() {
    const f = form(), msg = $('#bookMsg'), q = st.quote;
    if (!q) return;
    const name = f.elements.name.value.trim(), email = f.elements.email.value.trim(), phone = f.elements.phone.value.trim();
    if (!name || !email || !phone) {
      showMsg(msg, 'Please fill in your name, email and phone number so we can confirm your stay.');
      return (!name ? f.elements.name : !phone ? f.elements.phone : f.elements.email).focus();
    }
    if (STATIC) return sendStaticBooking({ name, email, phone, requests: f.elements.requests.value.trim() });
    const btn = $('#confirmBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    const r = await api('/api/bookings', {
      suiteId: q.suiteId, checkIn: q.checkIn, checkOut: q.checkOut, guests: q.guests, promoCode: promoCode(),
      guest: { name, email, phone }, requests: f.elements.requests.value, paymentMethod: f.elements.payment ? f.elements.payment.value : '', website: f.elements.website.value,
    });
    if (!r.data.ok) {
      showMsg(msg, r.data.error || 'We could not send your request. Please try again.');
      btn.disabled = false;
      btn.textContent = D.rules.autoConfirm ? 'Confirm Booking' : 'Send Booking Request';
      if (r.status === 409) { await refresh(); checkAvailability(true); }
      return;
    }
    st.done = r.data;
    showDone();
  }

  function staticMessage(g) {
    const q = st.quote;
    const lines = [
      `Hello! I would like to book ${q.suiteName}.`,
      `Check-in: ${dateLabel(q.checkIn)} (after ${timeLabel(D.rules.checkInTime)})`,
      `Check-out: ${dateLabel(q.checkOut)} (before ${timeLabel(D.rules.checkOutTime)})`,
      `Nights: ${q.nights}   Guests: ${q.guests}`,
      `Estimated total: ${money(q.total, q.symbol)}`,
      promoCode() ? `Promo code: ${promoCode()}` : '',
      `Name: ${g.name}`, `Phone: ${g.phone}`, `Email: ${g.email}`,
      g.requests ? `Requests: ${g.requests}` : '',
    ].filter(Boolean);
    return { lines, text: lines.join('\n') };
  }
  async function sendStaticBooking(g) {
    if (!NETLIFY) return showStaticDone(g, null);
    const q = st.quote, f = form();
    const btn = $('#confirmBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    const opt = f.elements.payment && f.elements.payment.selectedOptions[0];
    const r = await netlifyPost('booking', {
      suite: q.suiteName, check_in: q.checkIn, check_out: q.checkOut, nights: q.nights, guests: q.guests,
      estimated_total: money(q.total, q.symbol), promo_code: promoCode(), payment_method: opt ? opt.textContent : '',
      guest_name: g.name, phone: g.phone, email: g.email, requests: g.requests, message: staticMessage(g).text, website: f.elements.website.value,
    });
    showStaticDone(g, r.data.ok === true);
  }
  /* sent: true = received by Netlify Forms, false = automatic sending failed, null = message-only export */
  function showStaticDone(g, sent) {
    const q = st.quote, c = D.contact;
    const { lines, text } = staticMessage(g);
    const enc = encodeURIComponent(text);
    const btns = [
      c.whatsapp && `<a class="btn btn-primary" target="_blank" rel="noopener" href="${esc(waLink(c.whatsapp) + '?text=' + enc)}">${ico('whatsapp', 18)} Send on WhatsApp</a>`,
      c.email && `<a class="btn btn-primary" href="${esc('mailto:' + c.email + '?subject=' + encodeURIComponent('Booking request: ' + q.suiteName) + '&body=' + enc)}">${ico('mail', 18)} Send by email</a>`,
      c.messenger && `<a class="btn btn-primary" target="_blank" rel="noopener" href="${esc(msLink(c.messenger))}">${ico('messenger', 18)} Open Messenger</a>`,
      !c.messenger && c.facebook && `<a class="btn btn-primary" target="_blank" rel="noopener" href="${esc(safeHref(socialLink(c.facebook, 'https://facebook.com/')))}">${ico('facebook', 18)} Open our Facebook page</a>`,
    ].filter(Boolean).join('');
    const head = sent ? 'Booking request sent' : sent === false ? 'Please send your request to us' : 'Your request is ready to send';
    const lead = sent
      ? 'Thank you! We received your request and will reply to confirm availability and share payment details. Want a faster reply? You can also send the details below on our Facebook page.'
      : sent === false
        ? 'We could not send your request automatically. Please copy the message below and send it to us. We will reply to confirm availability and share payment details.'
        : `Copy the message below and send it to us${c.whatsapp || c.email ? '' : ' on our Facebook page'}. We will reply to confirm availability and share payment details.`;
    $('#bookForm').hidden = true;
    const el = $('#bookDone');
    el.hidden = false;
    el.innerHTML = `<div class="done-icon">${ico('check', 30)}</div><h3>${head}</h3><p>${lead}</p><textarea class="msg-box" id="msgBox" readonly rows="${lines.length + 1}">${esc(text)}</textarea><div class="done-actions"><button type="button" class="btn btn-outline" data-act="copy-msg">${ico('copy', 18)} Copy message</button>${btns}</div><div class="done-actions"><button type="button" class="btn btn-outline" data-act="new-booking">${sent ? 'Make another request' : 'Start over'}</button></div>`;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function showDone() {
    const d = st.done, q = d.quote, pay = d.payment;
    const c = D.contact;
    const chatBase = c.whatsapp ? waLink(c.whatsapp) + '?text=' : c.messenger ? msLink(c.messenger) + '?text=' : '';
    const chat = chatBase || (c.facebook ? socialLink(c.facebook, 'https://facebook.com/') : '');
    const chatLabel = chatBase ? 'Message us about this booking' : 'Open our Facebook page';
    const text = encodeURIComponent(`Hi! I just sent booking request ${d.ref} for ${q.suiteName}, ${dateLabel(q.checkIn)} to ${dateLabel(q.checkOut)}.`);
    const methods = pay.methods.length ? `<div class="done-block"><h4>How to pay</h4>${pay.instructions ? `<p>${esc(pay.instructions)}</p>` : ''}<ul class="pay-list">${pay.methods.map((m) => `<li><b>${esc(m.label)}</b>${m.details ? `<span>${esc(m.details)}</span>` : ''}</li>`).join('')}</ul>${pay.depositDue ? `<p class="fine">Deposit due: <b>${money(pay.depositDue, q.symbol)}</b></p>` : ''}</div>` : '';
    $('#bookForm').hidden = true;
    const el = $('#bookDone');
    el.hidden = false;
    el.innerHTML = `<div class="done-icon">${ico('check', 30)}</div><h3>${d.status === 'confirmed' ? 'Your booking is confirmed' : 'Booking request received'}</h3><p>${esc(pay.confirmation || 'Thank you! We will confirm your request shortly.')}</p><div class="ref"><span>Booking reference</span><strong>${esc(d.ref)}</strong></div><ul class="q-lines"><li><span>${esc(q.suiteName)}</span><span>${q.nights} night${q.nights > 1 ? 's' : ''}</span></li><li><span>Check-in</span><span>${dateLabel(q.checkIn)}, after ${timeLabel(D.rules.checkInTime)}</span></li><li><span>Check-out</span><span>${dateLabel(q.checkOut)}, before ${timeLabel(D.rules.checkOutTime)}</span></li><li><span>Guests</span><span>${q.guests}</span></li></ul><div class="q-total"><span>Total</span><strong>${money(q.total, q.symbol)}</strong></div>${methods}<div class="done-actions">${chat ? `<a class="btn btn-primary" target="_blank" rel="noopener" href="${esc(chatBase ? chat + text : chat)}">${chatLabel}</a>` : ''}<button type="button" class="btn btn-outline" data-act="new-booking">Make another booking</button></div>`;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------------------------------------------------------------- gentle reveal for review cards */
  let revealObs = null;
  function armReveal() {
    if (!('IntersectionObserver' in window)) return $$('.rv').forEach((el) => el.classList.add('in'));
    if (!revealObs) revealObs = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); revealObs.unobserve(e.target); } }), { threshold: 0.2 });
    $$('.rv:not(.in)').forEach((el, i) => { el.style.setProperty('--d', Math.min(i, 4) * 0.08 + 's'); revealObs.observe(el); });
  }

  /* ---------------------------------------------------------------- misc UI */
  let toastT;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('on'), 2200);
  }
  const scrollTo = (sel) => { const el = $(sel); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  const actions = {
    pick: (t) => openCal(t, t.dataset.which),
    menu: (t) => { const open = $('#nav').classList.toggle('open'); t.setAttribute('aria-expanded', open); },
    'view-suite': (t) => openSuite(t.dataset.id),
    'book-suite': (t) => {
      closeLayer();
      st.suiteId = t.dataset.id;
      resetQuote();
      syncUI();
      scrollTo('#booking');
      if (st.checkIn && st.checkOut) setTimeout(() => checkAvailability(), 500);
    },
    close: () => closeLayer(),
    thumb: (t) => { $('#smMain').src = t.dataset.src; $$('.sm-thumbs button').forEach((b) => b.classList.toggle('on', b === t)); },
    filter: (t) => { st.filter = t.dataset.key; renderGallery(); },
    lightbox: (t) => openLightbox(t.dataset.i),
    'lb-prev': () => { lb.i = (lb.i - 1 + lb.list.length) % lb.list.length; drawLightbox(); },
    'lb-next': () => { lb.i = (lb.i + 1) % lb.list.length; drawLightbox(); },
    policy: (t) => openPolicy(t.dataset.key),
    'copy-code': (t) => { (navigator.clipboard ? navigator.clipboard.writeText(t.dataset.code) : Promise.reject()).then(() => toast('Promo code copied'), () => toast('Code: ' + t.dataset.code)); const p = form().elements.promo; if (!p.value) p.value = t.dataset.code; },
    'dismiss-promo': (t) => { sessionStorage.setItem('promo-' + t.dataset.id, '1'); renderPromo(); },
    'rev-prev': () => { const t = $('#revTrack'); t.scrollBy({ left: -t.clientWidth * 0.8, behavior: 'smooth' }); },
    'rev-next': () => { const t = $('#revTrack'); t.scrollBy({ left: t.clientWidth * 0.8, behavior: 'smooth' }); },
    'cal-day': (t) => pickDay(t.dataset.date),
    'cal-prev': () => { cal.month = shiftMonth(cal.month, -1); drawCal(); },
    'cal-next': () => { cal.month = shiftMonth(cal.month, 1); drawCal(); },
    'cal-close': () => closeCal(),
    'pick-suite': (t) => { st.suiteId = t.dataset.id; syncUI(); checkAvailability(); },
    'confirm-booking': () => confirmBooking(),
    'copy-msg': () => { const t = $('#msgBox'); t.select(); (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(() => toast('Message copied'), () => { document.execCommand('copy'); toast('Message copied'); }); },
    'new-booking': () => {
      st.done = null;
      resetQuote();
      st.checkIn = st.checkOut = '';
      $('#bookDone').hidden = true;
      $('#bookForm').hidden = false;
      syncUI();
      scrollTo('#booking');
    },
  };

  document.addEventListener('click', (e) => {
    if (cal.on && !e.target.closest('#cal') && !e.target.closest('[data-act=pick]')) closeCal();
    const t = e.target.closest('[data-act]');
    if (t && actions[t.dataset.act]) { if (t.tagName === 'A') return; actions[t.dataset.act](t, e); }
    if (e.target.closest('.drawer a')) $('#nav').classList.remove('open');
  });
  document.addEventListener('mouseover', (e) => {
    const d = e.target.closest && e.target.closest('.cal .d');
    if (d && cal.which === 'out' && st.checkIn && !st.checkOut && d.dataset.date !== cal.hover) {
      cal.hover = d.dataset.date;
      $$('#cal .d').forEach((x) => x.classList.toggle('mid', x.dataset.date > st.checkIn && x.dataset.date < cal.hover));
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (cal.on) closeCal(); else if (layer().innerHTML) closeLayer(); }
    if (lb && e.key === 'ArrowRight') actions['lb-next']();
    if (lb && e.key === 'ArrowLeft') actions['lb-prev']();
  });
  window.addEventListener('scroll', () => $('#nav').classList.toggle('solid', window.scrollY > 40), { passive: true });
  window.addEventListener('resize', () => { if (cal.on) drawCal(); });
  document.addEventListener('error', (e) => {
    const im = e.target;
    if (im && im.tagName === 'IMG' && !im.dataset.fb) { im.dataset.fb = '1'; im.src = PH + 'living.svg'; }
  }, true);

  document.addEventListener('change', (e) => {
    const k = e.target.dataset && e.target.dataset.sync;
    if (!k) return;
    st[k] = k === 'guests' ? Number(e.target.value) : e.target.value;
    if (k === 'suiteId' && st.checkOut && st.checkIn && st.checkOut > lastCheckout(st.checkIn)) st.checkOut = '';
    resetQuote();
    syncUI();
  });

  $('#searchCard').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!st.checkIn) return openCal($('#searchCard [data-which=in]'), 'in');
    if (!st.checkOut) return openCal($('#searchCard [data-which=out]'), 'out');
    scrollTo('#booking');
    setTimeout(() => checkAvailability(), 450);
  });
  form().addEventListener('submit', (e) => { e.preventDefault(); checkAvailability(); });
  form().elements.promo.addEventListener('input', () => { if (st.quote || $('#quotePanel').innerHTML) resetQuote(); });

  $('#contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, msg = $('#contactMsg'), btn = $('button[type=submit]', f);
    btn.disabled = true;
    const r = await api('/api/inquiries', { name: f.elements.name.value, email: f.elements.email.value, message: f.elements.message.value, website: f.elements.website.value });
    btn.disabled = false;
    if (r.data.ok) { showMsg(msg, 'Thank you! Your message has been sent and we will reply soon.', true); f.reset(); }
    else showMsg(msg, r.data.error || 'We could not send your message. Please try again.');
  });

  /* ---------------------------------------------------------------- render + live updates */
  function renderAll() {
    busyCache = {};
    applyTheme();
    renderPromo();
    renderNav();
    renderHero();
    renderAbout();
    renderSuites();
    renderAmenities();
    renderGallery();
    renderExperience();
    renderLocation();
    renderReviews();
    renderBookHead();
    renderBookAside();
    renderContact();
    renderFooter();
    renderChat();
    syncUI();
  }

  let refreshing = false;
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const r = await fetch('/api/public', { cache: 'no-store' });
      if (r.ok) {
        D = await r.json();
        renderAll();
        if (cal.on) drawCal();
        if (st.quote && !st.done) checkAvailability(true); // dates may have just been taken or prices changed
        if (lb) { lb.list = galleryList(); drawLightbox(); }
      }
    } catch (e) { /* offline: try again on next event */ } finally { refreshing = false; }
  }
  let deb;
  if (!STATIC && 'EventSource' in window) {
    const es = new EventSource('/api/events');
    es.addEventListener('change', () => { clearTimeout(deb); deb = setTimeout(refresh, 250); });
  }
  if (!STATIC) setInterval(() => { if (!document.hidden) refresh(); }, 90000); // safety net if the live connection drops
  if (!STATIC) document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

  if (STATIC) D.today = window.Pricing.todayStr(D.staticCfg.tzOffset); // the snapshot may be days old: use the visitor's real date
  renderAll();
  $('#nav').classList.toggle('solid', window.scrollY > 40);
})();
