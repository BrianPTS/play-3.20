/**
 * Discord webhook notifier for inventory alerts.
 *
 * Fires when:
 *  - Standard seats increase on an event
 *  - An existing listing (standard or resale) drops in price
 *
 * Matching for resale uses section+row+seats (rowKey) since TM can
 * change the inventoryId when a resale listing is re-posted.
 */

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

export async function sendInventoryAlert({ eventName, venue, eventId, eventDate, newStandardSeats, priceDrops }) {
  if (!WEBHOOK_URL) return;

  const hasNew = newStandardSeats && newStandardSeats.length > 0;
  const hasDrops = priceDrops && priceDrops.length > 0;
  if (!hasNew && !hasDrops) return;

  const embeds = [];

  const dateLine = eventDate
    ? new Date(eventDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  const footerText = [eventName, venue, dateLine].filter(Boolean).join(' · ');

  const fmtSeats = (seats) => {
    if (!seats || seats.length === 0) return '';
    const nums = seats.map(s => typeof s === 'object' ? s.number : s).map(String);
    return ` · Seats ${nums.join(',')}`;
  };

  if (hasNew) {
    const totalNew = newStandardSeats.reduce((s, x) => s + (x.quantity || 0), 0);
    const lines = newStandardSeats.slice(0, 15).map(s =>
      `**${s.section}** Row ${s.row}${fmtSeats(s.seats)} · ${s.quantity} seat${s.quantity > 1 ? 's' : ''} · $${s.price.toFixed(2)}`
    );
    if (newStandardSeats.length > 15) lines.push(`_...and ${newStandardSeats.length - 15} more_`);

    embeds.push({
      title: `🟢 +${totalNew} New Standard Seats`,
      description: lines.join('\n'),
      color: 0x22c55e,
      footer: { text: footerText },
      timestamp: new Date().toISOString(),
    });
  }

  if (hasDrops) {
    const lines = priceDrops.slice(0, 15).map(d => {
      const tag = d.inventoryTag === 'standard' ? '🔵 STD' : '🟠 RSL';
      const arrow = `$${d.oldPrice.toFixed(2)} → **$${d.newPrice.toFixed(2)}**`;
      const pct = Math.round((1 - d.newPrice / d.oldPrice) * 100);
      return `${tag} **${d.section}** Row ${d.row}${fmtSeats(d.seats)} · ${d.quantity} seat${d.quantity > 1 ? 's' : ''} · ${arrow} (−${pct}%)`;
    });
    if (priceDrops.length > 15) lines.push(`_...and ${priceDrops.length - 15} more_`);

    embeds.push({
      title: `🔴 ${priceDrops.length} Price Drop${priceDrops.length > 1 ? 's' : ''}`,
      description: lines.join('\n'),
      color: 0xe11d48,
      footer: { text: footerText },
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds }),
    });
    if (!res.ok) {
      console.error(`[Discord] Webhook failed: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error(`[Discord] Webhook error: ${err.message}`);
  }
}
