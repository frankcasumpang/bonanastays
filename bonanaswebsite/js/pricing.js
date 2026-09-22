window.Pricing = (function () {
var module = { exports: {} };
'use strict';
/**
 * Availability + pricing. All dates are plain "YYYY-MM-DD" strings (property-local dates).
 * A booking occupies the NIGHTS checkIn .. checkOut-1. Blocks occupy start .. end inclusive.
 */
const DAY = 864e5;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
const toMs = (s) => Date.parse(s + 'T00:00:00Z');
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (s, n) => fmt(toMs(s) + n * DAY);
const diffDays = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);
const dow = (s) => new Date(toMs(s)).getUTCDay();
const todayStr = (tz = 8) => fmt(Date.now() + tz * 3600e3);

function nightsList(ci, co, cap = 800) {
  const out = [];
  for (let d = ci, i = 0; d < co && i < cap; d = addDays(d, 1), i++) out.push(d);
  return out;
}

const BLOCKING = ['pending', 'confirmed', 'checked_in', 'completed'];

/** Set of occupied nights for a suite. */
function busyNights(suiteId, bookings, blocks, { holdPending = true, exclude = null } = {}) {
  const set = new Set();
  for (const b of bookings) {
    if (b.suiteId !== suiteId || b.id === exclude) continue;
    if (!BLOCKING.includes(b.status)) continue;
    if (b.status === 'pending' && !holdPending) continue;
    if (!isDate(b.checkIn) || !isDate(b.checkOut)) continue;
    nightsList(b.checkIn, b.checkOut).forEach((n) => set.add(n));
  }
  for (const k of blocks) {
    if (k.suiteId !== suiteId && k.suiteId !== '*') continue;
    if (!isDate(k.start) || !isDate(k.end)) continue;
    nightsList(k.start, addDays(k.end, 1), 1200).forEach((n) => set.add(n));
  }
  return set;
}

const money = (n, sym = '₱') => {
  const v = Math.round(n * 100) / 100;
  return (v < 0 ? '-' : '') + sym + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
};

function nightRate(suite, date, pricing) {
  const weekend = String(pricing.weekendDays || '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '')
    .map(Number);
  const holiday = (pricing.holidays || []).some((h) => h && h.date === date);
  const regular = Number(suite.promoPrice) > 0 ? Number(suite.promoPrice) : Number(suite.priceRegular) || 0;
  if (holiday && Number(suite.priceHoliday) > 0) return { rate: Number(suite.priceHoliday), kind: 'holiday' };
  if (weekend.includes(dow(date)) && Number(suite.priceWeekend) > 0) return { rate: Number(suite.priceWeekend), kind: 'weekend' };
  return { rate: regular, kind: 'regular' };
}

function promoApplies(p, { suiteId, checkIn, nights, code }) {
  if (!p.enabled) return false;
  if (p.start && checkIn < p.start) return false;
  if (p.end && checkIn > p.end) return false;
  if (Array.isArray(p.suites) && p.suites.length && !p.suites.includes(suiteId)) return false;
  if (Number(p.minStay) > nights) return false;
  const pc = (p.code || '').trim().toUpperCase();
  if (code) return pc && pc === code;
  return !pc; // codeless promotions apply automatically
}

/**
 * quote({ suite, settings, promotions, bookings, blocks, input, excludeBooking })
 * input: { checkIn, checkOut, guests, extraBeds, promoCode }
 */
function quote({ suite, settings, promotions, bookings, blocks, input, excludeBooking = null, skipRules = false }) {
  const fail = (error) => ({ ok: false, error });
  if (!suite || suite.active === false) return fail('This suite is not available.');
  const { rules, pricing } = settings;
  const sym = pricing.symbol || '₱';
  const { checkIn, checkOut } = input;
  if (!isDate(checkIn) || !isDate(checkOut)) return fail('Please choose your check-in and check-out dates.');
  const nights = diffDays(checkIn, checkOut);
  if (nights < 1) return fail('Check-out must be after check-in.');
  const today = todayStr(pricing.tzOffset);
  if (!skipRules) {
    if (checkIn < today) return fail('Check-in cannot be in the past.');
    if (diffDays(today, checkIn) > (Number(rules.maxAdvanceDays) || 365)) return fail('These dates are too far ahead to book online.');
  }
  const minStay = Number(suite.minStay) || Number(rules.minStay) || 1;
  const maxStay = Number(suite.maxStay) || Number(rules.maxStay) || 365;
  if (!skipRules && nights < minStay) return fail(`The minimum stay is ${minStay} night${minStay > 1 ? 's' : ''}.`);
  if (nights > maxStay) return fail(`The maximum stay is ${maxStay} nights.`);
  const guests = Math.max(1, parseInt(input.guests, 10) || 1);
  const maxGuests = Number(suite.maxGuests) || 1;
  if (guests > maxGuests) return fail(`This suite sleeps up to ${maxGuests} guest${maxGuests > 1 ? 's' : ''}.`);

  const busy = busyNights(suite.id, bookings, blocks, { holdPending: rules.holdPending !== false, exclude: excludeBooking });
  const list = nightsList(checkIn, checkOut);
  const clash = list.find((n) => busy.has(n));
  if (clash) return { ok: false, unavailable: true, error: 'Sorry, those dates are no longer available.' };

  const nightly = list.map((d) => ({ date: d, ...nightRate(suite, d, pricing) }));
  const nightlySum = (arr) => arr.reduce((s, n) => s + n.rate, 0);
  let accommodation = nightlySum(nightly);
  let plan = 'nightly';
  const monthly = Number(suite.priceMonthly) || 0;
  const weekly = Number(suite.priceWeekly) || 0;
  if (monthly > 0 && nights >= 30) {
    const m = Math.floor(nights / 30);
    const t = m * monthly + nightlySum(nightly.slice(m * 30));
    if (t < accommodation) { accommodation = t; plan = 'monthly'; }
  }
  if (weekly > 0 && nights >= 7) {
    const w = Math.floor(nights / 7);
    const t = w * weekly + nightlySum(nightly.slice(w * 7));
    if (t < accommodation) { accommodation = t; plan = 'weekly'; }
  }

  const lines = [];
  const rates = [...new Set(nightly.map((n) => n.rate))];
  if (plan !== 'nightly') lines.push({ label: `${nights} nights (${plan} rate)`, amount: accommodation });
  else if (rates.length === 1) lines.push({ label: `${money(rates[0], sym)} × ${nights} night${nights > 1 ? 's' : ''}`, amount: accommodation });
  else lines.push({ label: `${nights} nights (varying rates)`, amount: accommodation });

  let extras = 0;
  const included = Number(suite.includedGuests) || maxGuests;
  if (guests > included && Number(suite.extraGuestFee) > 0) {
    const amt = (guests - included) * Number(suite.extraGuestFee) * nights;
    extras += amt;
    lines.push({ label: `Additional guest × ${guests - included}`, amount: amt });
  }
  const extraBeds = Math.max(0, parseInt(input.extraBeds, 10) || 0);
  if (extraBeds && Number(suite.extraBedFee) > 0) {
    const amt = extraBeds * Number(suite.extraBedFee) * nights;
    extras += amt;
    lines.push({ label: `Extra bed × ${extraBeds}`, amount: amt });
  }

  let discount = 0;
  const dp = Number(suite.discountPercent) || 0;
  if (dp > 0) {
    const d = Math.round(((accommodation + extras) * dp) / 100);
    discount += d;
    lines.push({ label: `Suite discount (${dp}%)`, amount: -d });
  }

  // Promotions
  const code = (input.promoCode || '').trim().toUpperCase();
  let promo = null;
  let promoMessage = '';
  const applicable = promotions.filter((p) => promoApplies(p, { suiteId: suite.id, checkIn, nights, code }));
  if (code && !applicable.length) promoMessage = 'That promo code is not valid for these dates or this suite.';
  const base = accommodation + extras - discount;
  let best = null;
  applicable.forEach((p) => {
    const amt = p.type === 'amount' ? Math.min(Number(p.value) || 0, base) : Math.round((base * (Number(p.value) || 0)) / 100);
    if (!best || amt > best.amt) best = { p, amt };
  });
  if (best && best.amt > 0) {
    promo = { name: best.p.name, code: best.p.code || '', amount: best.amt };
    discount += best.amt;
    lines.push({ label: `Promo: ${best.p.name}`, amount: -best.amt });
  }

  const cleaning = Number(suite.cleaningFee) || 0;
  if (cleaning > 0) lines.push({ label: 'Cleaning fee', amount: cleaning });
  const taxable = Math.max(0, accommodation + extras - discount + cleaning);
  const taxPct = Number(pricing.taxPercent) || 0;
  const tax = Math.round((taxable * taxPct) / 100);
  if (tax > 0) lines.push({ label: `Taxes (${taxPct}%)`, amount: tax });
  const total = taxable + tax;
  const depositDue = rules.depositRequired ? Math.round((total * (Number(rules.depositPercent) || 0)) / 100) : 0;

  return {
    ok: true, suiteId: suite.id, suiteName: suite.name, checkIn, checkOut, nights, guests, extraBeds,
    nightly, avgRate: Math.round(accommodation / nights), plan,
    lines, accommodation, extras, discount, cleaningFee: cleaning, tax, total,
    securityDeposit: Number(suite.securityDeposit) || 0, depositDue,
    promo, promoMessage, symbol: sym, currency: pricing.currency || 'PHP',
  };
}

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newRef(crypto) {
  const b = crypto.randomBytes(6);
  return 'BNS-' + Array.from(b, (x) => REF_ALPHABET[x % REF_ALPHABET.length]).join('');
}

module.exports = { isDate, addDays, diffDays, nightsList, todayStr, busyNights, quote, newRef, money, BLOCKING };

return module.exports;
})();
