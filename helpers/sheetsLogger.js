/**
 * Google Sheets alert logger.
 *
 * Sends alerts to a Google Apps Script web app that expects:
 *   { alerts: [{ at, type, eventName, venue, eventDate, eventUrl,
 *                section, row, seats, seatCount, tag,
 *                oldPrice, newPrice, price, sectionLow,
 *                dropPct, undercutPct }] }
 *
 * Append-only — never reads, modifies, or deletes existing rows.
 * Requires GOOGLE_SHEETS_SCRIPT_URL env var. No-ops if not set.
 */

const SHEETS_URL = process.env.GOOGLE_SHEETS_SCRIPT_URL;

function extractArtist(name) {
  if (!name) return '';
  const m = name.match(/^(.+?)\s+[-–—]\s+|^(.+?):\s+|^(.+?)\s+at\s+/i);
  return (m && (m[1] || m[2] || m[3])?.trim()) || name;
}

function fmtSeats(seats) {
  if (!seats || seats.length === 0) return '';
  return seats.map(s => typeof s === 'object' ? s.number : s).map(String).join(',');
}

export async function logToSheets({ eventName, venue, eventId, eventDate, newStandardSeats, priceDrops, resaleUndercuts }) {
  if (!SHEETS_URL) return;

  const hasNew = newStandardSeats && newStandardSeats.length > 0;
  const hasDrops = priceDrops && priceDrops.length > 0;
  const hasUndercuts = resaleUndercuts && resaleUndercuts.length > 0;
  if (!hasNew && !hasDrops && !hasUndercuts) return;

  const ts = new Date().toISOString();
  const evDate = eventDate ? new Date(eventDate).toISOString().slice(0, 10) : '';
  const evUrl = eventId ? `https://www.ticketmaster.com/event/${eventId}` : '';

  const alerts = [];

  if (hasNew) {
    for (const s of newStandardSeats) {
      alerts.push({
        at: ts,
        type: 'new_standard',
        eventName: eventName || '',
        venue: venue || '',
        eventDate: evDate,
        eventUrl: evUrl,
        section: s.section || '',
        row: s.row || '',
        seats: fmtSeats(s.seats),
        seatCount: s.quantity || 0,
        tag: 'standard',
        oldPrice: '',
        newPrice: '',
        price: s.price || 0,
        sectionLow: '',
        dropPct: '',
        undercutPct: '',
      });
    }
  }

  if (hasDrops) {
    for (const d of priceDrops) {
      const pct = d.oldPrice > 0 ? Math.round((1 - d.newPrice / d.oldPrice) * 100) : 0;
      alerts.push({
        at: ts,
        type: 'price_drop',
        eventName: eventName || '',
        venue: venue || '',
        eventDate: evDate,
        eventUrl: evUrl,
        section: d.section || '',
        row: d.row || '',
        seats: fmtSeats(d.seats),
        seatCount: d.quantity || 0,
        tag: d.inventoryTag || '',
        oldPrice: d.oldPrice || 0,
        newPrice: d.newPrice || 0,
        price: '',
        sectionLow: '',
        dropPct: pct,
        undercutPct: '',
      });
    }
  }

  if (hasUndercuts) {
    for (const u of resaleUndercuts) {
      const pct = u.sectionCheapest > 0 ? Math.round((1 - u.price / u.sectionCheapest) * 100) : 0;
      alerts.push({
        at: ts,
        type: 'resale_undercut',
        eventName: eventName || '',
        venue: venue || '',
        eventDate: evDate,
        eventUrl: evUrl,
        section: u.section || '',
        row: u.row || '',
        seats: fmtSeats(u.seats),
        seatCount: u.quantity || 0,
        tag: 'resale',
        oldPrice: '',
        newPrice: '',
        price: u.price || 0,
        sectionLow: u.sectionCheapest || 0,
        dropPct: '',
        undercutPct: pct,
      });
    }
  }

  if (alerts.length === 0) return;

  try {
    const res = await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alerts }),
    });
    if (!res.ok) {
      console.error(`[Sheets] POST failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error(`[Sheets] POST error: ${err.message}`);
  }
}
