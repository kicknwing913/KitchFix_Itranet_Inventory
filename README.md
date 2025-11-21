# Personnel Action Web App

A lightweight web app for site managers to submit personnel action requests to HR. Submissions are written to a Google Sheet and notification emails are sent to configured recipients.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template and fill in your values:

   ```bash
   cp .env.example .env
   ```

   Required values:

   - `GOOGLE_SHEETS_SPREADSHEET_ID`: Destination spreadsheet ID.
   - `GOOGLE_LOCATIONS_SPREADSHEET_ID` + `GOOGLE_LOCATIONS_TAB`: Source sheet/tab for the locations dropdown (defaults are set to the OpsHub data sheet and `accounts` tab).
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY`: Service account credentials with Sheets access. If your private key includes literal `\n`, keep them as `\n`; the app converts them to real newlines at runtime.
   - `SMTP_*` + `EMAIL_FROM` + `EMAIL_TO`: SMTP host/credentials and sender/recipient addresses. `EMAIL_TO` supports comma-separated addresses.

3. Start the server:

   ```bash
   npm start
   ```

   The form is available at http://localhost:3000.

## How it works

- **Front-end**: `/public/index.html` provides a responsive form that mirrors the Google Form fields.
- **API**: `POST /api/personnel-actions` validates required fields (including separation-specific details when that action is chosen), appends a row to the configured Google Sheet, and sends notification emails.
- **Email**: Uses Nodemailer with your SMTP settings. If email env vars are missing, the app skips sending without failing the request.
- **Email fallbacks**: Submissions still succeed if email is partially configured (e.g., `EMAIL_TO`/`EMAIL_FROM` are set but `SMTP_HOST` is missing); the app logs that notification emails were skipped.
- **Identity helper**: `GET /api/me` will return `{ email }` when the request contains headers from your Google identity provider (e.g., `x-goog-authenticated-user-email`).
- **Location helper**: `GET /api/locations` reads `teamkey` + `teamname` from the configured sheet to populate the Location dropdown.

## Deployment notes

- Run behind HTTPS and secure the route if the form is only for intranet use.
- Store secrets as environment variables (not in source control).
- Adjust the sheet range in `src/server.js` (`Personnel Actions!A:Z`) to match your tab name.
