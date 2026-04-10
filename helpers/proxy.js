// Proxies are loaded from MongoDB via ProxyManager.
// This file provides an empty fallback so the import doesn't break
// if the database has no proxies yet.
const proxies = [];

console.log(`[PROXY] No hardcoded proxies — ProxyManager loads from database`);

export default {
  proxies: proxies
};
