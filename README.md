# Pudding Shelter Monitor

This project checks the Adams County animal shelter adoption page every hour, looks for a cat whose displayed name is exactly `Pudding`, and sends a first-seen email alert for each matching animal ID.

## How it works

- `src/check-pudding.mjs` uses Playwright to load the shelter page, select `Cat`, and extract visible listing cards from the client-rendered grid.
- Matching is case-insensitive exact-name matching on the displayed card name.
- Seen animal IDs are stored in `.data/seen-listings.json` so the same listing is not alerted twice.
- `.github/workflows/pudding-monitor.yml` runs the check hourly and can also be launched manually with `workflow_dispatch`.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   npx playwright install chromium
   ```

2. Create a local env file:

   ```bash
   cp .env.example .env
   ```

3. Fill in the SMTP settings and recipient email in `.env`.

4. Run the checker:

   ```bash
   npm run check
   ```

## Safe local test run

The script supports fixture-driven testing without hitting the shelter site or sending email.

```bash
DRY_RUN=true MOCK_LISTINGS_FILE=test/fixtures/mock-listings.json npm run check
```

`DRY_RUN=true` skips both email sending and state writes.

## GitHub Actions setup

Push this project to a GitHub repository, then add these repository secrets:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `NOTIFY_TO`
- `NOTIFY_FROM` (optional, defaults to `SMTP_USER`)

Once Actions are enabled, the workflow will:

- run every hour
- allow manual runs from the Actions tab
- commit `.data/seen-listings.json` back to the repository only when a new matching listing was successfully alerted

## Tests

Run the pure-logic tests with:

```bash
npm test
```

These tests cover exact-name matching, listing parsing, dedupe behavior, and alert message formatting.
