/**
 * Google Sheets alert logger.
 *
 * Appends one row per listing to a Google Sheet via a Google Apps Script
 * web app. Append-only — never reads, modifies, or deletes existing rows.
 *
 * Requires GOOGLE_SHEETS_SCRIPT_URL env var (Apps Script deployment URL).
 * Silently no-ops if not set.
 */

const SHEETS_URL = process.env.GOOGLE_SHEETS_SCRIPT_URL;

function extractArtist(name) {
  if (!name) return '';
  const m = name.match(/^(.+?)\s+[-–—]\s+|^(.+?):\s+|^(.+?)\s+at\s+/i);
  return (m && (m[1] || m[2] || m[3])?.trim()) || name;
}

function computeDaysOut(eventDate) {
  if (!eventDate) return '';
  return Math.round((new Date(eventDate) - new Date()) / 86400000);
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
  const artist = extractArtist(eventName);
  const daysOut = computeDaysOut(eventDate);
  const evDate = eventDate ? new Date(eventDate).toISOString().slice(0, 10) : '';

  const rows = [];

  if (hasNew) {
    for (const s of newStandardSeats) {
      rows.push([
        ts, 'new_standard', artist, eventName, venue || '', evDate, daysOut, eventId || '',
        s.section, s.row, fmtSeats(s.seats), s.quantity, s.price, '', '', 'standard',
      ]);
    }
  }

  if (hasDrops) {
    for (const d of priceDrops) {
      rows.push([
        ts, 'price_drop', artist, eventName, venue || '', evDate, daysOut, eventId || '',
        d.section, d.row, fmtSeats(d.seats), d.quantity, d.newPrice, d.oldPrice, '', d.inventoryTag || '',
      ]);
    }
  }

  if (hasUndercuts) {
    for (const u of resaleUndercuts) {
      rows.push([
        ts, 'resale_undercut', artist, eventName, venue || '', evDate, daysOut, eventId || '',
        u.section, u.row, fmtSeats(u.seats), u.quantity, u.price, '', u.sectionCheapest, 'resale',
      ]);
    }
  }

  if (rows.length === 0) return;

  try {
    const res = await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    if (!res.ok) {
      console.error(`[Sheets] POST failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error(`[Sheets] POST error: ${err.message}`);
  }
}
