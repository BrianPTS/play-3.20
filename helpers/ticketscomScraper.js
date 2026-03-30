/**
 * tickets.com scraper adapter for scraperManager integration.
 *
 * Wraps the standalone ticketscom-scraper to work within the
 * scraperManager's event processing lifecycle.
 */

import { scrapeEvent } from '../ticketscom-scraper/scraper.js';

/**
 * Scrape a tickets.com event and return results in the format
 * scraperManager expects.
 *
 * @param {string} eventUrl - The tickets.com event URL
 * @param {string} eventId - The Event_ID from the database
 * @returns {Promise<{listings: Array, venueCapacity: number, totalSeats: number}>}
 */
export async function scrapeTicketsComEvent(eventUrl, eventId) {
  const { groups, availability } = await scrapeEvent(eventUrl, {
    headless: true,
    saveToDB: true,
    sectionDelay: 1500,
  });

  const venueCapacity = Object.values(availability.sectionInventory)
    .reduce((sum, s) => sum + s.capacity, 0);

  const totalSeats = groups.reduce((sum, g) => sum + g.seatCount, 0);

  return {
    listings: groups,
    venueCapacity,
    totalSeats,
  };
}
