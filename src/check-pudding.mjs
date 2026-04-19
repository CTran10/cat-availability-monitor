import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULTS = {
  animalType: "Cat",
  matchName: "Pudding",
  stateFile: ".data/seen-listings.json",
  targetUrl: "https://animalshelter.adcogov.org/animal-adoption",
  timeZone: "America/Denver"
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

export function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeName(value) {
  return normalizeWhitespace(value).toLowerCase();
}

export function isExactNameMatch(candidate, target = DEFAULTS.matchName) {
  return normalizeName(candidate) === normalizeName(target);
}

export function extractListingFromCardText(cardText, detailUrl = null) {
  const lines = String(cardText ?? "")
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const animalIdLine = lines.find((line) => /\bA\d{4,}\b/i.test(line));
  if (!animalIdLine || lines.length === 0) {
    return null;
  }

  const animalId = animalIdLine.match(/\bA\d{4,}\b/i)?.[0]?.toUpperCase() ?? null;
  const idIndex = lines.findIndex((line) => line === animalIdLine);
  const rawName = idIndex > 0 ? lines[idIndex - 1] : lines[0];
  const name = rawName.replace(/^[^A-Za-z0-9]+/, "").trim();

  if (!animalId || !name) {
    return null;
  }

  return {
    animalId,
    detailUrl,
    name
  };
}

export function findNewMatches(listings, seenAnimalIds) {
  const seen = new Set((seenAnimalIds ?? []).map((value) => String(value).toUpperCase()));
  const newMatches = [];

  for (const listing of listings) {
    const animalId = String(listing?.animalId ?? "").toUpperCase();
    if (!animalId || seen.has(animalId)) {
      continue;
    }

    seen.add(animalId);
    newMatches.push({
      animalId,
      detailUrl: listing.detailUrl ?? null,
      name: normalizeWhitespace(listing.name)
    });
  }

  return {
    newMatches,
    updatedSeenAnimalIds: Array.from(seen).sort()
  };
}

export function formatTimestamp(date = new Date(), timeZone = DEFAULTS.timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "long",
    timeZone
  }).format(date);
}

export function buildAlertMessage(matches, config, detectedAt = new Date()) {
  const timestamp = formatTimestamp(detectedAt, config.timeZone);
  const subject =
    matches.length === 1
      ? `Pudding found at the shelter (${matches[0].animalId})`
      : `${matches.length} Pudding matches found at the shelter`;

  const textLines = [
    "A cat named Pudding was detected on the Adams County shelter site.",
    "",
    `Detected: ${timestamp}`,
    `Shelter page: ${config.targetUrl}`,
    ""
  ];

  const htmlItems = matches
    .map((match) => {
      const detailLine = match.detailUrl
        ? `<li><strong>${escapeHtml(match.name)}</strong> (${escapeHtml(match.animalId)}) - <a href="${escapeHtml(
            match.detailUrl
          )}">View listing</a></li>`
        : `<li><strong>${escapeHtml(match.name)}</strong> (${escapeHtml(match.animalId)})</li>`;

      textLines.push(`- ${match.name} (${match.animalId})`);
      if (match.detailUrl) {
        textLines.push(`  ${match.detailUrl}`);
      }

      return detailLine;
    })
    .join("");

  textLines.push("");
  textLines.push("This alert is sent only the first time each animal ID is seen.");

  const html = [
    "<p>A cat named <strong>Pudding</strong> was detected on the Adams County shelter site.</p>",
    `<p><strong>Detected:</strong> ${escapeHtml(timestamp)}<br />`,
    `<strong>Shelter page:</strong> <a href="${escapeHtml(config.targetUrl)}">${escapeHtml(config.targetUrl)}</a></p>`,
    `<ul>${htmlItems}</ul>`,
    "<p>This alert is sent only the first time each animal ID is seen.</p>"
  ].join("");

  return {
    html,
    subject,
    text: textLines.join("\n")
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveFromRoot(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
}

async function fileExists(filePath) {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function loadEnvFile(envPath = resolveFromRoot(".env")) {
  if (!(await fileExists(envPath))) {
    return;
  }

  const contents = await readFile(envPath, "utf8");

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const unquoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;

    if (!(key in process.env)) {
      process.env[key] = unquoted;
    }
  }
}

export function getConfig() {
  return {
    animalType: process.env.ANIMAL_TYPE || DEFAULTS.animalType,
    dryRun: /^(1|true|yes)$/i.test(process.env.DRY_RUN || ""),
    headless: !/^(0|false|no)$/i.test(process.env.HEADLESS || "true"),
    matchName: process.env.MATCH_NAME || DEFAULTS.matchName,
    mockListingsFile: process.env.MOCK_LISTINGS_FILE || "",
    notifyFrom: process.env.NOTIFY_FROM || process.env.SMTP_USER || "",
    notifyTo: process.env.NOTIFY_TO || "",
    smtpHost: process.env.SMTP_HOST || "",
    smtpPass: process.env.SMTP_PASS || "",
    smtpPort: Number.parseInt(process.env.SMTP_PORT || "587", 10),
    smtpUser: process.env.SMTP_USER || "",
    stateFile: resolveFromRoot(process.env.STATE_FILE || DEFAULTS.stateFile),
    targetUrl: process.env.TARGET_URL || DEFAULTS.targetUrl,
    timeZone: process.env.TIME_ZONE || DEFAULTS.timeZone
  };
}

export async function loadSeenAnimalIds(stateFile) {
  if (!(await fileExists(stateFile))) {
    return [];
  }

  const rawState = await readFile(stateFile, "utf8");
  const parsed = JSON.parse(rawState);

  if (!Array.isArray(parsed?.seenAnimalIds)) {
    return [];
  }

  return parsed.seenAnimalIds;
}

export async function saveSeenAnimalIds(stateFile, seenAnimalIds) {
  await writeFile(
    stateFile,
    `${JSON.stringify({ seenAnimalIds }, null, 2)}\n`,
    "utf8"
  );
}

export async function loadMockListings(mockListingsFile) {
  const raw = await readFile(resolveFromRoot(mockListingsFile), "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("MOCK_LISTINGS_FILE must contain a JSON array.");
  }

  return parsed
    .map((listing) => ({
      animalId: String(listing?.animalId ?? "").toUpperCase(),
      detailUrl: listing?.detailUrl ?? null,
      name: normalizeWhitespace(listing?.name ?? "")
    }))
    .filter((listing) => listing.animalId && listing.name);
}

export async function selectAnimalType(page, animalType) {
  await page.waitForSelector("select", { timeout: 45000 });

  const selects = page.locator("select");
  const total = await selects.count();

  for (let index = 0; index < total; index += 1) {
    const select = selects.nth(index);
    const options = (await select.locator("option").allTextContents()).map((option) =>
      normalizeWhitespace(option)
    );

    const matchingIndex = options.findIndex((option) => normalizeName(option) === normalizeName(animalType));
    if (matchingIndex === -1) {
      continue;
    }

    try {
      await select.selectOption({ label: options[matchingIndex] });
    } catch {
      await select.selectOption({ index: matchingIndex });
    }

    return;
  }

  throw new Error(`Unable to find an animal type selector option for "${animalType}".`);
}

export async function extractListingsFromPage(page) {
  return page.evaluate(() => {
    const idPattern = /\bA\d{4,}\b/i;

    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };

    const getLines = (element) =>
      (element.innerText || "")
        .split("\n")
        .map((line) => normalize(line))
        .filter(Boolean);

    const scoreCandidate = (element) => {
      const lines = getLines(element);
      const hasImage = element.querySelector("img") ? 1 : 0;
      return { hasImage, lines };
    };

    const results = new Map();
    const nodes = Array.from(document.querySelectorAll("body *")).filter((element) => {
      if (!(element instanceof HTMLElement) || !isVisible(element)) {
        return false;
      }

      return idPattern.test(element.innerText || "");
    });

    for (const node of nodes) {
      let candidate = node;
      let best = node;

      while (candidate && candidate !== document.body) {
        const { hasImage, lines } = scoreCandidate(candidate);
        if (hasImage && lines.length >= 2 && lines.length <= 18) {
          best = candidate;
          break;
        }

        candidate = candidate.parentElement;
      }

      const lines = getLines(best);
      const idIndex = lines.findIndex((line) => idPattern.test(line));
      if (idIndex === -1) {
        continue;
      }

      const animalId = lines[idIndex].match(idPattern)?.[0]?.toUpperCase();
      const rawName = idIndex > 0 ? lines[idIndex - 1] : lines[0];
      const name = rawName.replace(/^[^A-Za-z0-9]+/, "").trim();

      if (!animalId || !name) {
        continue;
      }

      const detailLink = best.closest("a[href]") || best.querySelector("a[href]");
      const current = results.get(animalId);
      const candidateResult = {
        animalId,
        detailUrl: detailLink ? detailLink.href : null,
        lineCount: lines.length,
        name
      };

      if (!current || candidateResult.lineCount < current.lineCount) {
        results.set(animalId, candidateResult);
      }
    }

    return Array.from(results.values()).map(({ lineCount, ...listing }) => listing);
  });
}

export async function fetchLiveListings(config) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: config.headless
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(45000);

    await page.goto(config.targetUrl, {
      waitUntil: "domcontentloaded"
    });

    await selectAnimalType(page, config.animalType);
    await page.waitForFunction(
      () => /\bA\d{4,}\b/i.test(document.body.innerText || "") || !(document.body.innerText || "").includes("Loading animals..."),
      { timeout: 30000 }
    );
    await page.waitForTimeout(1500);

    const listings = await extractListingsFromPage(page);
    if (listings.length === 0) {
      throw new Error("No listings were extracted from the adoption page.");
    }

    return listings;
  } catch (error) {
    const page = (await browser.contexts()[0]?.pages?.())?.[0];
    if (page) {
      await writeDebugArtifacts(page);
    }

    throw error;
  } finally {
    await browser.close();
  }
}

async function writeDebugArtifacts(page) {
  const debugDir = resolveFromRoot(".debug");
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const screenshotPath = path.join(debugDir, `failure-${timestamp}.png`);
  const htmlPath = path.join(debugDir, `failure-${timestamp}.html`);

  await mkdir(debugDir, { recursive: true });
  await page.screenshot({ fullPage: true, path: screenshotPath }).catch(() => {});
  await writeFile(htmlPath, await page.content(), "utf8").catch(() => {});

  console.error(`Saved debug screenshot to ${screenshotPath}`);
  console.error(`Saved debug HTML to ${htmlPath}`);
}

function validateEmailConfig(config) {
  const required = ["notifyTo", "smtpHost", "smtpPass", "smtpUser"];
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required email configuration: ${missing.join(", ")}`);
  }
}

export async function sendAlertEmail(config, matches, detectedAt = new Date()) {
  validateEmailConfig(config);
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.default.createTransport({
    auth: {
      pass: config.smtpPass,
      user: config.smtpUser
    },
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465
  });

  const message = buildAlertMessage(matches, config, detectedAt);

  await transporter.sendMail({
    from: config.notifyFrom,
    html: message.html,
    subject: message.subject,
    text: message.text,
    to: config.notifyTo
  });
}

export async function run() {
  await loadEnvFile();
  const config = getConfig();
  const seenAnimalIds = await loadSeenAnimalIds(config.stateFile);

  const listings = config.mockListingsFile
    ? await loadMockListings(config.mockListingsFile)
    : await fetchLiveListings(config);

  const matchingListings = listings.filter((listing) => isExactNameMatch(listing.name, config.matchName));
  const { newMatches, updatedSeenAnimalIds } = findNewMatches(matchingListings, seenAnimalIds);

  if (matchingListings.length === 0) {
    console.log(`No listing named "${config.matchName}" is currently visible.`);
    return;
  }

  if (newMatches.length === 0) {
    console.log(`A listing named "${config.matchName}" is visible, but all matching animal IDs were already alerted.`);
    return;
  }

  if (config.dryRun) {
    console.log(`DRY_RUN enabled. Would alert for ${newMatches.length} new match(es): ${newMatches.map((match) => match.animalId).join(", ")}`);
    return;
  }

  await sendAlertEmail(config, newMatches);
  await saveSeenAnimalIds(config.stateFile, updatedSeenAnimalIds);
  console.log(`Alert sent for ${newMatches.length} new match(es).`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectRun) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
