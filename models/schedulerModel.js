import mongoose from 'mongoose';

// Lightweight mirror of the scrape repo's SchedulerSettings — same MongoDB
// collection (schedulersettings), but the play scraper only needs the few
// fields it actually consumes during scraping. The scrape dashboard owns
// the full schema and writes; play just reads.
const schedulerSettingsSchema = new mongoose.Schema({
  descriptionExclusions: {
    type: [String],
    default: [],
  },
}, {
  strict: false,
  timestamps: true,
});

export const SchedulerSettings =
  mongoose.models.SchedulerSettings ||
  mongoose.model('SchedulerSettings', schedulerSettingsSchema);
