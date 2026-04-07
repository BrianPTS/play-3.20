import express from "express";
import {
  getScraperStatus,
  startScraper,
  stopScraper,
  reloadProxies,
} from "../controllers/scraperController.js";

const router = express.Router();

router.get("/status", getScraperStatus);
router.post("/start", startScraper);
router.post("/stop", stopScraper);
router.post("/reload-proxies", reloadProxies);

export default router;
