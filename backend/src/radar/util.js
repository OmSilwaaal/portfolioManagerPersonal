// Run fn over items with at most `limit` in flight — parallel without hammering a rate-limited API.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i], i); } catch (e) { out[i] = { error: e }; }
    }
  });
  await Promise.all(workers);
  return out;
}

const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { mapLimit, now, sleep };
