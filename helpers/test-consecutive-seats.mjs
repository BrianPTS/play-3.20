/**
 * Test: odd/even venue consecutive-seat grouping.
 *
 * Fixture: Greek Theatre, Los Angeles — REAR C row, 10 physically
 * adjacent even-numbered seats. Captured from a real TM map response
 * (gist 5afc30a82ef7275378521dea42b880d9).
 *
 * Run:  node helpers/test-consecutive-seats.mjs
 *
 * This exercises the public grouping helpers `breakArray` and
 * `CreateConsicutiveSeats`. Both the happy path (physicalIdx provided)
 * and the legacy fallback (no physicalIdx) are covered.
 */

import { breakArray, CreateConsicutiveSeats } from './seatBatch.js';

let passed = 0;
let failed = 0;

function assertEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}`);
    console.log(`      expected: ${e}`);
    console.log(`      actual:   ${a}`);
    failed++;
  }
}

// ────────────────────────────────────────────────────────────
// Real fixture from the Greek Theatre map response (REAR C, one row):
// Each tuple is [placeId, seatNumber, x, y, sizeCode, physicalIdx, ?]
// ────────────────────────────────────────────────────────────
const greekRearCRow = [
  ['KNCUGICDHJATUMZS', '32', 6447.82, 2337.48, '50', 15, 0],
  ['KNCUGICDHJATUMZQ', '30', 6459.73, 2377.76, '50', 14, 0],
  ['KNCUGICDHJATUMRY', '28', 6470.94, 2417.92, '50', 13, 0],
  ['KNCUGICDHJATUMRW', '26', 6482.20, 2458.38, '50', 12, 0],
  ['KNCUGICDHJATUMRU', '24', 6492.76, 2498.72, '50', 11, 0],
  ['KNCUGICDHJATUMRS', '22', 6503.37, 2539.35, '50', 10, 0],
  ['KNCUGICDHJATUMRQ', '20', 6513.66, 2580.08, '50', 9, 0],
  ['KNCUGICDHJATUMJY', '18', 6523.25, 2620.65, '50', 8, 0],
  ['KNCUGICDHJATUMJW', '16', 6532.88, 2661.53, '50', 7, 0],
  ['KNCUGICDHJATUMJU', '14', 6541.82, 2702.26, '50', 6, 0],
];

// ────────────────────────────────────────────────────────────
// Test 1: breakArray with physicalIdx — all 10 stride-2 seats
// sit at physicalIdx 6..15 (consecutive), so they MUST stay as one run.
// ────────────────────────────────────────────────────────────
console.log('Test 1 — breakArray: Greek Theatre even-only row (physicalIdx)');
{
  // Sort by physicalIdx ascending, then extract parallel arrays.
  const sorted = [...greekRearCRow].sort((a, b) => a[5] - b[5]);
  const seats = sorted.map((t) => parseInt(t[1], 10));
  const indices = sorted.map((t) => t[5]);

  const runs = breakArray(seats, indices);
  assertEqual(runs.length, 1, 'stride-2 seats with physicalIdx → 1 run');
  assertEqual(
    runs[0].seats,
    [14, 16, 18, 20, 22, 24, 26, 28, 30, 32],
    'single run contains all 10 even seats in physical order'
  );
  assertEqual(
    runs[0].physicalIndices,
    [6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    'physicalIndices stay parallel to seats'
  );
}

// ────────────────────────────────────────────────────────────
// Test 2: breakArray LEGACY fallback (no physicalIdx) — must
// still break the stride-2 row apart exactly as before. This
// proves we didn't regress the old behavior.
// ────────────────────────────────────────────────────────────
console.log('\nTest 2 — breakArray: legacy fallback (no physicalIdx)');
{
  const seats = [14, 16, 18, 20, 22, 24, 26, 28, 30, 32];
  const runs = breakArray(seats);
  assertEqual(runs.length, 10, 'stride-2 without physicalIdx → 10 runs (legacy)');
  assertEqual(runs[0].seats, [14], 'first run is [14]');
  assertEqual(runs[9].seats, [32], 'last run is [32]');
}

// ────────────────────────────────────────────────────────────
// Test 3: breakArray on a normal stride-1 row — should ALWAYS
// produce 1 run, regardless of whether physicalIdx is supplied.
// ────────────────────────────────────────────────────────────
console.log('\nTest 3 — breakArray: normal stride-1 row (both modes)');
{
  const seats = [1, 2, 3, 4, 5];
  const noIdxRuns = breakArray(seats);
  assertEqual(noIdxRuns.length, 1, 'stride-1 no physicalIdx → 1 run');
  assertEqual(noIdxRuns[0].seats, [1, 2, 3, 4, 5], 'all 5 seats in one run');

  const withIdxRuns = breakArray(seats, [0, 1, 2, 3, 4]);
  assertEqual(withIdxRuns.length, 1, 'stride-1 with physicalIdx → 1 run');
  assertEqual(withIdxRuns[0].physicalIndices, [0, 1, 2, 3, 4], 'indices preserved');
}

// ────────────────────────────────────────────────────────────
// Test 4: breakArray with a real gap — two adjacent blocks
// separated by unavailable seats. physicalIdx=[6,7,9,10] (seat 8
// at idx=8 is sold), seat numbers = [14,16,20,22]. Expected:
// TWO runs, [14,16] and [20,22].
// ────────────────────────────────────────────────────────────
console.log('\nTest 4 — breakArray: genuine gap splits into 2 runs');
{
  const seats = [14, 16, 20, 22];
  const indices = [6, 7, 9, 10];
  const runs = breakArray(seats, indices);
  assertEqual(runs.length, 2, 'gap of 1 physical slot → 2 runs');
  assertEqual(runs[0].seats, [14, 16], 'first run is [14, 16]');
  assertEqual(runs[0].physicalIndices, [6, 7], 'first run idx [6, 7]');
  assertEqual(runs[1].seats, [20, 22], 'second run is [20, 22]');
  assertEqual(runs[1].physicalIndices, [9, 10], 'second run idx [9, 10]');
}

// ────────────────────────────────────────────────────────────
// Test 5: CreateConsicutiveSeats merges two pre-split groups
// that sit physically adjacent (odd/even venue).
// Group A = seats [14, 16] at idx [6, 7]
// Group B = seats [18, 20] at idx [8, 9]
// Expected: one merged group [14, 16, 18, 20] at [6, 7, 8, 9].
// ────────────────────────────────────────────────────────────
console.log('\nTest 5 — CreateConsicutiveSeats: merges adjacent odd/even groups');
{
  const input = [
    {
      section: 'REAR C',
      row: 'V',
      offerId: 'GJ6DC7BVG4',
      seats: [14, 16],
      physicalIndices: [6, 7],
    },
    {
      section: 'REAR C',
      row: 'V',
      offerId: 'GJ6DC7BVG4',
      seats: [18, 20],
      physicalIndices: [8, 9],
    },
  ];
  const result = CreateConsicutiveSeats(input);
  assertEqual(result.length, 1, 'two adjacent groups → merged into 1');
  assertEqual(
    result[0].seats,
    [14, 16, 18, 20],
    'merged seats in physical order'
  );
  assertEqual(
    result[0].physicalIndices,
    [6, 7, 8, 9],
    'merged physicalIndices stay lockstepped'
  );
}

// ────────────────────────────────────────────────────────────
// Test 6: CreateConsicutiveSeats does NOT merge groups in
// different rows or different offers.
// ────────────────────────────────────────────────────────────
console.log('\nTest 6 — CreateConsicutiveSeats: does not merge across rows/offers');
{
  const input = [
    {
      section: 'REAR C',
      row: 'V',
      offerId: 'GJ6DC7BVG4',
      seats: [14, 16],
      physicalIndices: [6, 7],
    },
    {
      section: 'REAR C',
      row: 'N',
      offerId: 'GJ6DC7BVG4',
      seats: [18, 20],
      physicalIndices: [8, 9],
    },
    {
      section: 'REAR C',
      row: 'V',
      offerId: 'DIFFERENT_OFFER',
      seats: [18, 20],
      physicalIndices: [8, 9],
    },
  ];
  const result = CreateConsicutiveSeats(input);
  assertEqual(result.length, 3, 'different row or offer → no merge');
}

// ────────────────────────────────────────────────────────────
// Test 7: End-to-end replay of the 10-seat Greek Theatre row.
// Feed each seat as its own single-seat group (mimicking how
// GenerateNanoPlaces emits one item per placeCode) and verify
// they ALL merge into one group of 10.
// ────────────────────────────────────────────────────────────
console.log('\nTest 7 — End-to-end: 10 single-seat groups → 1 block of 10');
{
  const input = greekRearCRow.map((tuple) => ({
    section: 'REAR C',
    row: 'V',
    offerId: 'GJ6DC7BVG4',
    seats: [parseInt(tuple[1], 10)],
    physicalIndices: [tuple[5]],
  }));
  const result = CreateConsicutiveSeats(input);
  assertEqual(result.length, 1, '10 singletons → 1 merged group');
  assertEqual(
    result[0].seats,
    [14, 16, 18, 20, 22, 24, 26, 28, 30, 32],
    'all 10 even seats in physical order'
  );
  assertEqual(
    result[0].physicalIndices,
    [6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    'all 10 physicalIndices lockstepped'
  );
}

// ────────────────────────────────────────────────────────────
// Test 8: Legacy path still works — input without physicalIndices
// gets the old seat-number ±1 treatment.
// ────────────────────────────────────────────────────────────
console.log('\nTest 8 — CreateConsicutiveSeats: legacy (no physicalIndices)');
{
  const input = [
    {
      section: 'ORCH',
      row: 'A',
      offerId: 'OFFER_X',
      seats: [1, 2],
    },
    {
      section: 'ORCH',
      row: 'A',
      offerId: 'OFFER_X',
      seats: [3, 4],
    },
  ];
  const result = CreateConsicutiveSeats(input);
  assertEqual(result.length, 1, 'legacy stride-1 merges');
  assertEqual(result[0].seats, [1, 2, 3, 4], 'merged legacy group');
}

// ────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`  PASSED: ${passed}`);
console.log(`  FAILED: ${failed}`);
console.log(`${'─'.repeat(60)}`);
process.exit(failed > 0 ? 1 : 0);
