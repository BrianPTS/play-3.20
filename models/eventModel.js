import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    mapping_id: {
      type: String,
      required: true,
      unique: true,
    },
    Event_ID: {
      type: String,
      required: true,
      unique: true,
    },
    Event_Name: {
      type: String,
      required: true,
    },
    Event_DateTime: {
      type: Date,
      required: true,
    },
    Venue: String,
    URL: {
      type: String,
      required: true,
    },
    source: {
      type: String,
      enum: ['ticketmaster', 'ticketscom'],
      default: 'ticketmaster',
    },
    Zone: {
      type: String,
      default: "none",
    },
    Available_Seats: {
      type: Number,
      default: 0,
    },
    Venue_Capacity: {
      type: Number,
      default: 0,
    },
    Availability_Percentage: {
      type: Number,
      default: 0,
    },
    Skip_Scraping: {
      type: Boolean,
      default: true,
    },
    inHandDate: {
      type: Date,
      default: Date.now,
    },
    priceIncreasePercentage: {
      type: Number,
      default: 35, // Default 25% markup
    },
    // A/B pricing strategy: "dynamic" | "static" | "manual"
    pricingStrategy: {
      type: String,
      enum: ["dynamic", "static", "manual"],
      default: "dynamic",
    },
    Last_Updated: {
      type: Date,
      default: Date.now,
    },
    // Dynamic pricing engine
    dynamicPricingEnabled: {
      type: Boolean,
      default: true,
    },
    calculatedMarkup: {
      type: Number,
      default: 30,
    },
    lastMarkupCalcAt: {
      type: Date,
      default: null,
    },
    markupFactors: {
      availability: { type: Number, default: 0 },
      orderVelocity: { type: Number, default: 0 },
      timeToEvent: { type: Number, default: 0 },
      base: { type: Number, default: 30 },
    },
    metadata: {
      lastUpdate: String,
      iterationNumber: Number,
      scrapeStartTime: Date,
      scrapeEndTime: Date,
      inHandDate: Date,
      scrapeDurationSeconds: Number,
      totalRunningTimeMinutes: Number,
      ticketStats: {
        totalTickets: Number,
        ticketCountChange: Number,
        previousTicketCount: Number,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
eventSchema.index({ URL: 1 }, { unique: true });

export const Event = mongoose.model("Event", eventSchema);
