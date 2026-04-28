import moment from "moment";
import * as fs from "fs";
// Function to generate unique 10-digit inventory ID

// Global Filters
const GLOBAL_FILTERS = {
  inventoryType: [
    "Primary",
    "Official Platinum",
    "Aisle Seating",
    "Standard",
    "Standard Ticket",
    "resale",
  ], // e.g., ['primary', 'resale'] - empty means no filter, strings to check for (case-insensitive)

  inventoryStatus: ["Available"], // e.g., ['available', 'sold'] - empty means no filter, strings to check for (case-insensitive)

  description: [
    "Standard Ticket",
    "GA Lawn",
    "General Admission Standing",
    "Standard Admission",
    "Reserved",
    "Reserved Ticket",
    "Pit",
    "General Admission Pit",
  ], // e.g., ['obstructed view', 'aisle'] - empty means no filter, strings to check for (case-insensitive)
  accessibility: [
    // Empty array means exclude ALL accessibility seats
  ], // e.g., ['wheelchair', 'hearing'] - empty means no filter, strings to check for (case-insensitive)
  excludeAccessibility: true, // Set to true to exclude ALL accessibility seats
  excludeWheelchair: true, // Set to true to exclude wheelchair accessible seats (sections containing 'WC')
};
//it will break map into seats
function GetMapSeats(data) {
  let seatArray = [];
  if (
    data &&
    data.pages &&
    data.pages.length > 0 &&
    data.pages[0] &&
    data.pages[0].segments
  ) {
    data.pages[0].segments.map((composit) => {
      if (composit?.segments) {
        composit.segments.map((SECTION) => {
          if (SECTION.segments && SECTION.segments.length > 0)
            SECTION.segments.map((ROW) => {
              ROW.placesNoKeys.map((seat) => {
                // TM map tuple: [placeId, seatNumber, x, y, sizeCode, physicalIdx, ?]
                // physicalIdx is the physical position along the row — this is
                // the ground truth for adjacency in odd/even venues where
                // seat numbers skip (e.g. 14,16,18,... in Greek Theatre REAR C).
                const physicalIdx =
                  typeof seat[5] === 'number' && Number.isFinite(seat[5])
                    ? seat[5]
                    : null;
                const xCoord =
                  typeof seat[2] === 'number' && Number.isFinite(seat[2])
                    ? seat[2]
                    : null;
                const yCoord =
                  typeof seat[3] === 'number' && Number.isFinite(seat[3])
                    ? seat[3]
                    : null;
                seatArray.push({
                  section: SECTION?.name,
                  row: ROW?.name,
                  seat: seat[1],
                  seatId: seat[0],
                  physicalIdx,
                  xCoord,
                  yCoord,
                });
              });
            });
          else {
            // GeneralAdmission seats - assuming they might be directly under SECTION or have a different structure
            // This is a placeholder and might need adjustment based on the actual GA data structure
            if (SECTION.placesNoKeys && Array.isArray(SECTION.placesNoKeys)) {
              SECTION.placesNoKeys.map((seat) => {
                seatArray.push({
                  section: SECTION?.name,
                  row: "GA", // General Admission typically doesn't have a specific row
                  seat: seat[1], // Assuming seat number is at index 1
                  seatId: seat[0], // Assuming seat ID is at index 0
                  physicalIdx: null, // GA has no physical layout
                  xCoord: null,
                  yCoord: null,
                });
              });
            } else if (SECTION.name && SECTION.id) {
              // Fallback if placesNoKeys is not present but section has name and id
              seatArray.push({
                section: SECTION?.name,
                row: "GA",
                seat: "GA", // Placeholder for seat number if not available
                seatId: SECTION?.id, // Use section id as seatId if specific seatId is not available
                physicalIdx: null,
                xCoord: null,
                yCoord: null,
              });
            }
            // console.log("Processing General Admission for SECTION:", SECTION);
          }
        });
      }
    });
  }

  return seatArray;
}
/**
 * Split a row of seats into physically-consecutive runs.
 *
 * If `physicalIndices` is provided and its length matches `seats`,
 * adjacency is checked using the physical-position index — this correctly
 * handles odd/even venues (seats 14,16,18,... sitting next to each other).
 * If not provided, falls back to the legacy seat-number ±1 check.
 *
 * Returns an array of { seats: number[], physicalIndices: number[]|null }.
 */
export function breakArray(seats, physicalIndices = null) {
  if (!seats || seats.length === 0) return [];

  const useIdx =
    Array.isArray(physicalIndices) && physicalIndices.length === seats.length;
  const adjacencyArr = useIdx ? physicalIndices : seats;

  const result = [];
  let currentSeats = [seats[0]];
  let currentIdx = useIdx ? [physicalIndices[0]] : null;

  for (let i = 0; i < seats.length - 1; i++) {
    if (adjacencyArr[i] + 1 !== adjacencyArr[i + 1]) {
      result.push({ seats: currentSeats, physicalIndices: currentIdx });
      currentSeats = [seats[i + 1]];
      currentIdx = useIdx ? [physicalIndices[i + 1]] : null;
    } else {
      currentSeats.push(seats[i + 1]);
      if (useIdx) currentIdx.push(physicalIndices[i + 1]);
    }
  }

  result.push({ seats: currentSeats, physicalIndices: currentIdx });
  return result;
}

/**
 * Merge groups whose seats sit physically adjacent to each other.
 *
 * Adjacency is checked using `physicalIndices` (the position-along-row
 * index from TM's map response) when available, so odd/even venues
 * produce correct block sizes. Falls back to seat-number ±1 for legacy
 * groups where physicalIndices aren't populated.
 *
 * The internal arrays `seats` and `physicalIndices` are kept in lockstep
 * — same length, same ordering (by physicalIdx ascending when present).
 */
export function CreateConsicutiveSeats(data) {
  const mergedData = [];

  // Helper: return true iff groupA and groupB are physically adjacent
  // (groupA's last seat is next to groupB's first, in either direction).
  // Uses physicalIndices when both groups have them; falls back to seat numbers.
  const areAdjacent = (a, b) => {
    const useIdx =
      Array.isArray(a.physicalIndices) &&
      Array.isArray(b.physicalIndices) &&
      a.physicalIndices.length === a.seats.length &&
      b.physicalIndices.length === b.seats.length;
    const aArr = useIdx ? a.physicalIndices : a.seats;
    const bArr = useIdx ? b.physicalIndices : b.seats;
    const aLast = Math.max(...aArr);
    const aFirst = Math.min(...aArr);
    const bFirst = Math.min(...bArr);
    const bLast = Math.max(...bArr);
    return aLast + 1 === bFirst || bLast + 1 === aFirst;
  };

  // Helper: merge groupB's seats+physicalIndices into groupA, keeping them
  // sorted by physicalIdx (when available) or seat number.
  const mergeInto = (a, b) => {
    const combined = a.seats.map((s, i) => ({
      seat: s,
      idx: Array.isArray(a.physicalIndices) ? a.physicalIndices[i] : null,
    }));
    b.seats.forEach((s, i) => {
      combined.push({
        seat: s,
        idx: Array.isArray(b.physicalIndices) ? b.physicalIndices[i] : null,
      });
    });
    const allHaveIdx = combined.every(
      (c) => typeof c.idx === 'number' && Number.isFinite(c.idx)
    );
    combined.sort((x, y) => (allHaveIdx ? x.idx - y.idx : x.seat - y.seat));
    a.seats = combined.map((c) => c.seat);
    a.physicalIndices = allHaveIdx ? combined.map((c) => c.idx) : null;
  };

  data.forEach((item) => {
    let merged = false;

    // Try to find an existing group that this item can be merged with
    for (let group of mergedData) {
      if (
        group.section === item.section &&
        group.row === item.row &&
        group.offerId === item.offerId
      ) {
        if (areAdjacent(group, item)) {
          mergeInto(group, item);
          merged = true;
          break;
        }
      }
    }

    if (!merged) {
      // Seed a new group — sort by physicalIdx if we have it.
      const allHaveIdx =
        Array.isArray(item.physicalIndices) &&
        item.physicalIndices.length === item.seats.length;
      let sortedSeats;
      let sortedIdx;
      if (allHaveIdx) {
        const pairs = item.seats.map((s, i) => ({
          seat: s,
          idx: item.physicalIndices[i],
        }));
        pairs.sort((a, b) => a.idx - b.idx);
        sortedSeats = pairs.map((p) => p.seat);
        sortedIdx = pairs.map((p) => p.idx);
      } else {
        sortedSeats = [...item.seats].sort((a, b) => a - b);
        sortedIdx = null;
      }

      mergedData.push({
        amount: item.amount,
        lineItemType: item.lineItemType,
        section: item.section,
        row: item.row,
        seats: sortedSeats,
        physicalIndices: sortedIdx,
        offerId: item.offerId,
        accessibility: item?.accessibility,
        descriptionId: item?.descriptionId,
        attributes: item?.attributes,
      });
    }
  });

  // Second pass: try to merge any remaining consecutive groups
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < mergedData.length; i++) {
      for (let j = i + 1; j < mergedData.length; j++) {
        const group1 = mergedData[i];
        const group2 = mergedData[j];

        if (
          group1.section === group2.section &&
          group1.row === group2.row &&
          group1.offerId === group2.offerId &&
          areAdjacent(group1, group2)
        ) {
          mergeInto(group1, group2);
          mergedData.splice(j, 1); // Remove the merged group
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return mergedData;
}
/**
 * Detect the "pack size" of a TM offer: the quantity the buyer is forced
 * to purchase in one transaction. Returns null if the offer isn't a pack.
 *
 * Examples:
 *   "2 Pack Special Offer"      → 2
 *   "Summer's Live 4 Pack"      → 4
 *   "Me + 3 4-Pack Offer"       → 4
 *   ticketTypeUnsoldQualifier:  "2PACKHOLD" | "4PACKHOLD" | ...
 *   sellableQuantities: [4]     → 4  (single-value means "must buy exactly this many")
 */
function getPackSize(offer) {
  if (!offer) return null;
  const name = offer.name || '';

  // Name-based detection (most reliable — TM labels packs clearly)
  if (/\bMe\s*\+\s*3\b/i.test(name)) return 4;
  if (/4[\s-]*pack|four[\s-]*pack/i.test(name)) return 4;
  if (/3[\s-]*pack|three[\s-]*pack/i.test(name)) return 3;
  if (/2[\s-]*pack|two[\s-]*pack/i.test(name)) return 2;
  if (/6[\s-]*pack|six[\s-]*pack/i.test(name)) return 6;

  // ticketTypeUnsoldQualifier code-based detection
  const q = offer.ticketTypeUnsoldQualifier;
  if (q === '2PACKHOLD' || q === '222PA1HOLD' || q === '22BOGOHOLD') return 2;
  if (q === '4PACKHOLD') return 4;

  // sellableQuantities: single value means "buyer must take exactly this many"
  if (offer.sellableQuantities && offer.sellableQuantities.length === 1) {
    return offer.sellableQuantities[0];
  }

  return null;
}

function getSplitType(arr, offer) {
  var length = arr.length;

  // "No split" detection: if offer has sellableQuantities with only one value,
  // the buyer must purchase exactly that many (e.g. "must purchase all 4").
  // In this case, return just the quantity so it can only be sold as a whole group.
  if (offer?.sellableQuantities && offer.sellableQuantities.length === 1) {
    return String(length);
  }

  // Pack-based split: if this is an N-pack offer, the only valid purchase
  // quantities are multiples of N. e.g. 2-pack on 6 seats → "2,4,6",
  // 4-pack on 8 seats → "4,8", 4-pack on 4 seats → "4".
  const packSize = getPackSize(offer);
  if (packSize) {
    const multiples = [];
    for (let q = packSize; q <= length; q += packSize) {
      multiples.push(q);
    }
    return multiples.length > 0 ? multiples.join(",") : String(length);
  }

  // Non-pack offers: allow single tickets as long as the buyer doesn't
  // leave exactly one behind.
  if (length === 2) {
    return "2";
  } else if (length === 3) {
    return "3";
  } else if (length === 4) {
    return "2,4";
  } else if (length >= 5) {
    var numbers = Array.from({ length: length }, (_, i) => i + 1).filter(
      (x) => x != 1,
    );
    return numbers.join(",");
  } else return "1";
}

function CreateInventoryAndLine(
  data,
  offer,
  event,
  descriptions,
  resaleClassification = new Map(),
) {
  let _descriptions = descriptions.find(
    (x) => x.descriptionId == data?.descriptionId,
  );
  let allDescriptions = "";
  const tags = new Set(); // track what we already appended to avoid duplicates

  // Case-insensitive check on attributes array
  const attrsLower = (data.attributes || []).map((a) => a.toLowerCase());
  if (attrsLower.some((a) => a.includes("obstructed"))) {
    allDescriptions += ", Obstructed View";
    tags.add("obstructed");
  }

  if (
    data?.accessibility.includes("sight") ||
    data?.accessibility.includes("hearing")
  ) {
    allDescriptions += ", deaf/hard, blind/low";
    tags.add("accessibility");
  }

  // Check offer name (case-insensitive)
  const offerNameLower = offer?.name?.toLowerCase() || "";
  if (offerNameLower.includes("limited/obstructed")) {
    if (!tags.has("obstructed")) {
      allDescriptions += ", Limited/Obstructed View";
      tags.add("obstructed");
    }
    if (!tags.has("limited")) {
      allDescriptions += ", Limited View";
      tags.add("limited");
    }
  } else {
    if (offerNameLower.includes("obstructed") && !tags.has("obstructed")) {
      allDescriptions += ", Obstructed View";
      tags.add("obstructed");
    }
    if (offerNameLower.includes("limited view") && !tags.has("limited")) {
      allDescriptions += ", Limited View";
      tags.add("limited");
    }
  }

  // Always check descriptions for anything not yet tagged
  if (_descriptions) {
    _descriptions.descriptions.map((x) => {
      const xl = x.toLowerCase();
      if (xl.includes("obstructed") && !tags.has("obstructed")) {
        allDescriptions += ", Obstructed View";
        tags.add("obstructed");
      }
      if (xl.includes("limited") && !tags.has("limited")) {
        allDescriptions += ", Limited View";
        tags.add("limited");
      }
      if (xl.includes("side view") && !tags.has("side")) {
        allDescriptions += ", Side View";
        tags.add("side");
      }
      if (xl.includes("behind") && !tags.has("behind")) {
        allDescriptions += ", Behind The Stage";
        tags.add("behind");
      }
      if (xl.includes("rear") && !tags.has("rear")) {
        allDescriptions += ", Rear View Seating";
        tags.add("rear");
      }
      if (xl.includes("partial") && !tags.has("partial")) {
        allDescriptions += ", Partial View";
        tags.add("partial");
      }
      if (
        (xl.includes("deaf") || xl.includes("blind")) &&
        !tags.has("accessibility")
      ) {
        allDescriptions += ", deaf/hard, blind/low";
        tags.add("accessibility");
      }
    });
  }

  // Classify charges using TM's fee_type field when available, falling back to reason-based logic.
  // TM charge objects can include: { reason, type, amount, fee_type }
  //   fee_type: "PER ORDER" (split across seats) or "PER TICKET" (applied to each seat)
  //   Known reasons: order_processing, service, facility, delivery, service_tax, face_value_tax, service_tax_2
  const charges = offer?.charges || [];

  // Per-order fees: use fee_type if present, otherwise fall back to known per-order reasons
  let perOrderTotal = parseFloat(
    charges
      .filter((x) =>
        x?.fee_type
          ? x.fee_type === "PER ORDER"
          : x?.reason === "order_processing" || x?.reason === "delivery",
      )
      .reduce((total, item) => total + item.amount, 0),
  );
  let perOrderPerSeat = perOrderTotal / data?.seats.length;

  // Per-ticket fees: everything that is NOT per-order
  let perTicketTotal = parseFloat(
    charges
      .filter((x) =>
        x?.fee_type
          ? x.fee_type !== "PER ORDER"
          : x?.reason !== "order_processing" && x?.reason !== "delivery",
      )
      .reduce((total, item) => total + item.amount, 0),
  );

  // Face Value (true TM face value before any fees)
  let faceValue = offer?.faceValue;
  let totalFees = perOrderPerSeat + perTicketTotal;
  let totalCost = faceValue + totalFees;

  return {
    inventory: {
      quantity: data?.seats.length,
      section: data?.section,
      hideSeatNumbers: true,
      row: data?.row,
      cost: totalCost,
      seats: data?.seats,
      eventId: event.eventMappingId,
      stockType: "MOBILE_TRANSFER",
      lineType: "PURCHASE",
      seatType: "CONSECUTIVE",
      inHandDate: moment(event?.inHandDate).format("YYYY-MM-DD"), // Format: 2024-12-22
      // "notes": "+stub +geek +tnet +vivid +tevo +pick",
      notes: "-tnow -tmplus -stub",
      tags: "AWS",
      offerId: data?.offerId,
      splitType:
        // No-split offers: sellableQuantities has only one value (e.g. "must purchase all 4")
        offer?.sellableQuantities?.length === 1
          ? "NOSPLIT"
          // Pack offers (2 Pack, 4 Pack, Me+3, etc.): if the whole group matches
          // the pack size, lock as NOSPLIT so buyer must take all. Otherwise
          // NEVERLEAVEONE — and customSplit (below) will enforce multiples of
          // the pack size so a buyer can't leave orphan seats.
          : getPackSize(offer) && data?.seats?.length === getPackSize(offer)
            ? "NOSPLIT"
            : getPackSize(offer)
              ? "NEVERLEAVEONE"
              : offer?.inventoryType?.toLowerCase() === "resale"
                ? "DEFAULT"
                : "NEVERLEAVEONE",
      inventoryTag:
        offer?.inventoryType?.toLowerCase() === "resale" ? "resale" : "standard",
      resaleType:
        offer?.inventoryType?.toLowerCase() === "resale"
          ? resaleClassification.get(data?.offerId) || "unknown"
          : null,
      publicNotes: "xfer" + allDescriptions,
      listPrice: totalCost,
      originalFaceValue: faceValue,
      totalFees: totalFees,
      customSplit: getSplitType(data?.seats, offer),
      tickets: data?.seats.map((y) => {
        return {
          id: 0,
          seatNumber: y,
          notes: "string",
          cost: totalCost,
          faceValue: faceValue,
          taxedCost: totalCost,
          sellPrice: totalCost,
          stockType: "HARD",
          eventId: 0,
          accountId: 0,
          status: "AVAILABLE",
          auditNote: "string",
        };
      }),
    },
    amount: 0,
    lineItemType: "INVENTORY",
    eventId: event?.eventMappingId,
    dbId: `${data?.seats.join("")}-${data?.row}-${data?.section}-${
      event?.eventMappingId
    }`,
    seats: data?.seats,
    row: data?.row,
    section: data?.section,
  };
}

export const AttachRowSection = (
  data,
  mapData,
  offers,
  event,
  descriptions,
  resaleClassification = new Map(),
) => {
  let allAvailableSeats = GetMapSeats(mapData);
  let mapPlacesIndex = allAvailableSeats.map((x) => x.seatId);
  // fs.writeFileSync("debug/allAvailableSeats.json", JSON.stringify(allAvailableSeats));
  let returnData = [];
  //get all seats number by seat id
  let customData = data
    .map((x) => {
      if (!x.places || x.places.length === 0) {
        return undefined;
      }

      // Verify all places belong to the same section
      const sectionMap = {};
      const allPlaces = x.places
        .map((placeId) => {
          const index = mapPlacesIndex.indexOf(placeId);
          if (index === -1) {
            return null;
          }

          const seatInfo = allAvailableSeats[index];
          if (!seatInfo) return null;

          // Track sections for verification
          sectionMap[seatInfo.section] = true;

          return { ...seatInfo, offerId: x.offerId };
        })
        .filter(Boolean);

      // Skip if no valid seats found
      if (allPlaces.length === 0) {
        return undefined;
      }

      // Verify all seats belong to same section
      const sections = Object.keys(sectionMap);
      // if (sections.length > 1) {
      //   console.warn('Mixed sections in seat group:', sections.join(', '));
      // }

      return {
        section: allPlaces[0].section,
        row: "",
        seats: allPlaces,
        eventId: event?.eventMappingId,
        offerId: x.offerId,
        accessibility: x?.accessibility,
        descriptionId: x?.descriptionId,
        attributes: x?.attributes,
      };
    })
    .filter(Boolean);

  //it will check if pair has same row as some events are giving pair of different row
  let groupedSeats = [];
  customData.forEach((seatGroup) => {
    const rows = [...new Set(seatGroup.seats.map((seat) => seat.row))];
    rows.forEach((row) => {
      const seatsInRow = seatGroup.seats.filter((seat) => seat.row === row);
      groupedSeats.push({
        section: seatGroup.section,
        seats: seatsInRow,
        eventId: seatGroup.eventId,
        offerId: seatGroup.offerId,
        accessibility: seatGroup.accessibility,
        descriptionId: seatGroup.descriptionId,
        attributes: seatGroup.attributes,
      });
    });
  });

  //add row and get seats in order
  // NOTE: Seats are sorted by physicalIdx (position along the row) when
  // available, falling back to seat-number order. This matters for
  // odd/even venues (e.g. Greek Theatre LA REAR C, where seats go
  // 14,16,18,... but are physically adjacent) — physicalIdx is the
  // ground truth TM provides for adjacency.
  groupedSeats
    .map((x) => {
      if (x?.seats.length > 0) {
        const allHavePhysical = x.seats.every(
          (y) => typeof y.physicalIdx === 'number' && Number.isFinite(y.physicalIdx)
        );
        const sorted = [...x.seats].sort((a, b) => {
          if (allHavePhysical) return a.physicalIdx - b.physicalIdx;
          return parseInt(a.seat) - parseInt(b.seat);
        });
        return {
          ...x,
          row: sorted[0]?.row,
          seats: sorted.map((y) => parseInt(y.seat)),
          physicalIndices: allHavePhysical
            ? sorted.map((y) => y.physicalIdx)
            : null,
        };
      } else {
        return undefined;
      }
    })
    .filter((x) => x != undefined)

    //break seats if it is not consicutive ex [1,2,3,6,7] => [1,2,3],[6,7]
    //(checks physicalIdx when available — handles odd/even venues)
    .map((x) => {
      let breakOBJ = breakArray(x.seats, x.physicalIndices);

      if (breakOBJ.length > 1) {
        breakOBJ.map((y) => {
          returnData.push({
            ...x,
            seats: y.seats,
            physicalIndices: y.physicalIndices,
          });
        });
      } else {
        returnData.push(x);
      }
    });

  //it will make consicutive seats ex [2],[4],[3] => [2,3,4]
  returnData = CreateConsicutiveSeats(returnData);
  // fs.writeFileSync("debug/consicutive.json", JSON.stringify(returnData));

  //attach offer

  const finalData = returnData
    .map((x) => {
      let offerGet = offers.find((e) => e.offerId == x.offerId);

      // Global filter: exclude any listing where section, offer, or description contains "table" (case-insensitive)
      {
        const _sectionLower = (x.section || '').toLowerCase();
        const _offerNameLower = (offerGet?.name || '').toLowerCase();
        const _offerDescLower = (offerGet?.description || '').toLowerCase();
        const _offerInvTypeLower = (offerGet?.inventoryType || '').toLowerCase();
        let _descTextLower = '';
        if (x.descriptionId && descriptions) {
          const _descDoc = descriptions.find((d) => d.descriptionId === x.descriptionId);
          if (_descDoc && _descDoc.descriptions) {
            _descTextLower = _descDoc.descriptions.join(' ').toLowerCase();
          }
        }
        if (
          _sectionLower.includes('table') ||
          _offerNameLower.includes('table') ||
          _offerDescLower.includes('table') ||
          _offerInvTypeLower.includes('table') ||
          _descTextLower.includes('table')
        ) {
          return undefined;
        }
      }

      // Check accessibility exclusion filters first
      if (GLOBAL_FILTERS.excludeAccessibility) {
        // Check for any accessibility indicators in various fields
        const hasAccessibilityIndicators =
          // Check section name for wheelchair/accessibility indicators
          (x.section &&
            (x.section.toUpperCase().includes("WC") ||
              x.section.toUpperCase().includes("WHEELCHAIR") ||
              x.section.toUpperCase().includes("ACCESSIBLE") ||
              x.section.toUpperCase().includes("ADA") ||
              x.section.toUpperCase().includes("HANDICAP"))) ||
          // Check accessibility field
          (x.accessibility && x.accessibility.length > 0) ||
          // Check attributes for accessibility terms
          (x.attributes &&
            x.attributes.some(
              (attr) =>
                attr.toLowerCase().includes("wheelchair") ||
                attr.toLowerCase().includes("accessible") ||
                attr.toLowerCase().includes("ada") ||
                attr.toLowerCase().includes("handicap") ||
                attr.toLowerCase().includes("sight") ||
                attr.toLowerCase().includes("hearing"),
            )) ||
          // Check offer name for accessibility terms
          (offerGet &&
            offerGet.name &&
            (offerGet.name?.toLowerCase().includes("wheelchair") ||
              offerGet.name?.toLowerCase().includes("accessible") ||
              offerGet.name?.toLowerCase().includes("ada") ||
              offerGet.name?.toLowerCase().includes("handicap")));

        if (hasAccessibilityIndicators) {
          // console.log(`Filtering out accessibility seat. Section: ${x.section}, Accessibility: ${x.accessibility}`);
          return undefined;
        }
      }

      // Legacy wheelchair exclusion filter (kept for backward compatibility)
      if (
        GLOBAL_FILTERS.excludeWheelchair &&
        x.section &&
        x.section.toUpperCase().includes("WC")
      ) {
        // console.log(`Filtering out wheelchair seat. Section: ${x.section}`);
        return undefined;
      }

      // New Global Filtering Logic: Item must match at least one active global filter category.
      let keepItemBasedOnGlobalFilters = false;
      const inventoryFilterActive = GLOBAL_FILTERS.inventoryType.length > 0;
      const descriptionFilterActive = GLOBAL_FILTERS.description.length > 0;
      const accessibilityFilterActive = GLOBAL_FILTERS.accessibility.length > 0;

      const anyGlobalFilterActive =
        inventoryFilterActive ||
        descriptionFilterActive ||
        accessibilityFilterActive;

      if (!anyGlobalFilterActive) {
        keepItemBasedOnGlobalFilters = true; // No global filters are active, so item passes this stage
      } else {
        // Check Inventory Type Filter
        if (inventoryFilterActive) {
          if (
            offerGet &&
            GLOBAL_FILTERS.inventoryType.some((filterType) =>
              offerGet.inventoryType
                ?.toLowerCase()
                .includes(filterType.toLowerCase()),
            )
          ) {
            keepItemBasedOnGlobalFilters = true;
          }
        }

        // Check Description Filter (only if not already marked to keep)
        if (!keepItemBasedOnGlobalFilters && descriptionFilterActive) {
          let descriptionMatched = false;
          const offerNameLower = offerGet?.name?.toLowerCase() || "";
          const offerDescriptionLower =
            offerGet?.description?.toLowerCase() || "";

          if (
            GLOBAL_FILTERS.description.some(
              (filterTerm) =>
                offerNameLower.includes(filterTerm.toLowerCase()) ||
                offerDescriptionLower.includes(filterTerm.toLowerCase()),
            )
          ) {
            descriptionMatched = true;
          }

          if (!descriptionMatched && descriptions) {
            const relevantDescriptionDoc = descriptions.find(
              (d) => d.descriptionId === x.descriptionId,
            );
            if (relevantDescriptionDoc && relevantDescriptionDoc.descriptions) {
              const descriptionsTextLower = relevantDescriptionDoc.descriptions
                .join(" ")
                .toLowerCase();
              if (
                GLOBAL_FILTERS.description.some((filterTerm) =>
                  descriptionsTextLower.includes(filterTerm.toLowerCase()),
                )
              ) {
                descriptionMatched = true;
              }
            }
          }

          if (!descriptionMatched && x.attributes && x.attributes.length > 0) {
            const attributesTextLower = x.attributes.join(" ").toLowerCase();
            if (
              GLOBAL_FILTERS.description.some((filterTerm) =>
                attributesTextLower.includes(filterTerm.toLowerCase()),
              )
            ) {
              descriptionMatched = true;
            }
          }

          if (descriptionMatched) {
            keepItemBasedOnGlobalFilters = true;
          }
        }

        // Check Accessibility Filter (only if not already marked to keep)
        if (!keepItemBasedOnGlobalFilters && accessibilityFilterActive) {
          if (x.accessibility) {
            const accessibilityLower = x.accessibility.toLowerCase();
            if (
              GLOBAL_FILTERS.accessibility.some((filterTerm) =>
                accessibilityLower.includes(filterTerm.toLowerCase()),
              )
            ) {
              keepItemBasedOnGlobalFilters = true;
            }
          }
        }
      }

      if (!keepItemBasedOnGlobalFilters) {
        // console.log(`Filtering out by global filters combination. Item: ${x.section}-${x.row}-${x.seats}, Offer: ${offerGet?.name}`);
        return undefined;
      }

      // Original offer filtering logic
      if (offerGet) {
        if (offerGet.name == "Special Offers") {
          return undefined;
        }
        if (offerGet?.protected == true) {
          return undefined;
        } else {
          return CreateInventoryAndLine(
            x,
            offerGet,
            event,
            descriptions,
            resaleClassification,
          );
        }
      } else {
        return undefined;
      }
    })
    .filter((x) => x != undefined)
    .filter((obj, index, self) => {
      // Convert dbId value to string to compare
      var dbId = obj.dbId.toString();

      // Check if the current dbId is the first occurrence in the array
      return index === self.findIndex((o) => o.dbId.toString() === dbId);
    })
    // .filter((x) => x.inventory.quantity > 1) // Commented out to prevent losing single seats

    //remove duplicate
    .filter((obj, index, self) => {
      // Check if any other object has the same row and section
      const hasDuplicate = self.some((otherObj, otherIndex) => {
        return (
          index !== otherIndex && // Exclude the current object from comparison
          obj.row === otherObj.row &&
          obj.section === otherObj.section &&
          obj.seats.some((seat) => otherObj.seats.includes(seat))
        );
      });

      return !hasDuplicate || index === 0; // Keep the first object or objects without duplicates
    });

  // ── GA/Lawn Processing ──
  // GA facets have no individual places (places: []) — they only have a count.
  // Each GA facet = one listing group. Bypass the map-join/consecutive-seat pipeline entirely.
  const gaEntries = data.filter(x => x.isGA === true);
  gaEntries.forEach(ga => {
    const offerGet = offers.find(e => e.offerId == ga.offerId);
    if (!offerGet) return;

    // Apply same offer filters as regular seats
    if (offerGet.name == "Special Offers") return;
    if (offerGet?.protected == true) return;

    // Apply accessibility filter
    if (GLOBAL_FILTERS.excludeAccessibility && ga.accessibility && ga.accessibility.length > 0) return;

    // Apply inventory type filter
    if (GLOBAL_FILTERS.inventoryType.length > 0) {
      if (!GLOBAL_FILTERS.inventoryType.some(ft =>
        offerGet.inventoryType?.toLowerCase().includes(ft.toLowerCase())
      )) return;
    }

    // Build synthetic seats array (1, 2, 3, ... count)
    const syntheticSeats = Array.from({ length: ga.count }, (_, i) => i + 1);

    const gaData = {
      section: ga.section,
      row: ga.section,       // use section name as row (GA1, GA2, etc.)
      seats: syntheticSeats,
      offerId: ga.offerId,
      accessibility: ga.accessibility || "",
      descriptionId: ga.descriptionId,
      attributes: ga.attributes || [],
    };

    const line = CreateInventoryAndLine(gaData, offerGet, event, descriptions, resaleClassification);
    if (line) finalData.push(line);
  });

  // Venue capacity = total number of seats in the map API data
  const venueCapacity = allAvailableSeats.length;

  // Per-section breakdown for dashboard verification.
  // total comes from the venue map; forSale sums quantities from facets.
  const sectionTotals = new Map();
  for (const seat of allAvailableSeats) {
    const sec = seat.section;
    if (!sec) continue;
    sectionTotals.set(sec, (sectionTotals.get(sec) || 0) + 1);
  }
  const sectionForSale = new Map();
  for (const item of finalData) {
    const sec = item.section;
    if (!sec) continue;
    sectionForSale.set(sec, (sectionForSale.get(sec) || 0) + (item.inventory?.quantity || 0));
  }
  const allSections = new Set([...sectionTotals.keys(), ...sectionForSale.keys()]);
  const sectionStats = [...allSections].map(section => ({
    section,
    total: sectionTotals.get(section) || 0,
    forSale: sectionForSale.get(section) || 0,
  }));

  return { listings: finalData, venueCapacity, sectionStats };
};
