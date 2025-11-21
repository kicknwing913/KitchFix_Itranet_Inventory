const express = require('express');
const path = require('path');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const LOCATION_SHEET_ID =
  process.env.GOOGLE_LOCATIONS_SPREADSHEET_ID || '1kurP8R94qgafJU4TENPp1f658GP7dxZSzksC60MJoRg';
const LOCATION_TAB = process.env.GOOGLE_LOCATIONS_TAB || 'accounts';

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const requiredFields = ['name', 'location', 'actionItems'];

const buildSheetsClient = () => {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error('Google Sheets credentials are missing');
  }

  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  return google.sheets({ version: 'v4', auth });
};

const buildTransport = () => {
  if (!process.env.SMTP_HOST) {
    throw new Error('SMTP settings are missing');
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      : undefined
  });
};

const validateBody = (body) => {
  const errors = [];

  requiredFields.forEach((field) => {
    if (!body[field] || (Array.isArray(body[field]) && body[field].length === 0)) {
      errors.push(`${field} is required`);
    }
  });

  if (body.email && !/.+@.+\..+/.test(body.email)) {
    errors.push('A valid submitter email is required when provided');
  }

  if (body.actionItems?.includes('Separation')) {
    if (!body.separationReason) {
      errors.push('Separation reason is required');
    }
    if (!body.lastDay) {
      errors.push("Employee's last day of actual work is required for separation");
    }
    if (!body.eligibleRehire) {
      errors.push('Rehire eligibility must be indicated for separation');
    }
  }

  return errors;
};

const formatRow = (payload) => {
  const timestamp = new Date().toISOString();
  return [
    timestamp,
    payload.name || '',
    payload.email || '',
    payload.location || '',
    (payload.actionItems || []).join(', '),
    payload.reason || '',
    payload.separationReason || '',
    payload.lastDay || '',
    payload.eligibleRehire === undefined ? '' : payload.eligibleRehire,
    payload.effectiveDate || '',
    payload.comeToWork === undefined ? '' : payload.comeToWork,
    payload.hoursWeek || ''
  ];
};

const sendNotificationEmail = async (payload) => {
  if (!process.env.EMAIL_TO || !process.env.EMAIL_FROM) {
    return;
  }

  if (!process.env.SMTP_HOST) {
    console.warn('Skipping notification email: SMTP_HOST is not configured');
    return;
  }

  const transporter = buildTransport();
  const recipients = process.env.EMAIL_TO.split(',').map((email) => email.trim());

  const actionSummary = (payload.actionItems || []).join(', ');
  const html = `
    <h2>Personnel Action Submitted</h2>
    <p><strong>Name:</strong> ${payload.name}</p>
    <p><strong>Email:</strong> ${payload.email || 'N/A'}</p>
    <p><strong>Location:</strong> ${payload.location}</p>
    <p><strong>Action items:</strong> ${actionSummary}</p>
    <p><strong>Reason:</strong> ${payload.reason || 'N/A'}</p>
    ${payload.separationReason ? `<p><strong>Separation reason:</strong> ${payload.separationReason}</p>` : ''}
    ${payload.lastDay ? `<p><strong>Last day of work:</strong> ${payload.lastDay}</p>` : ''}
    ${payload.eligibleRehire ? `<p><strong>Eligible for re-hire:</strong> ${payload.eligibleRehire}</p>` : ''}
    <p><strong>Effective date:</strong> ${payload.effectiveDate || 'N/A'}</p>
    <p><strong>Can employee come to work in the interim?</strong> ${payload.comeToWork || 'N/A'}</p>
    <p><strong>Hours per week:</strong> ${payload.hoursWeek || 'N/A'}</p>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: recipients,
    subject: `Personnel Action for ${payload.name}`,
    html
  });
};

const normalizeActionItems = (items) => {
  if (!items) return [];
  if (Array.isArray(items)) return items.filter(Boolean);
  return [items].filter(Boolean);
};

const extractEmailFromHeaders = (req) => {
  const rawEmail =
    req.get('x-goog-authenticated-user-email') ||
    req.get('x-forwarded-user-email') ||
    req.get('x-user-email');

  if (!rawEmail) return null;
  const parts = rawEmail.split(':');
  return parts.pop() || null;
};

let cachedLocations;
let cachedLocationsFetchedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const getLocationValues = async () => {
  const now = Date.now();
  if (cachedLocations && now - cachedLocationsFetchedAt < CACHE_TTL_MS) {
    return cachedLocations;
  }

  const sheets = buildSheetsClient();
  const range = `${LOCATION_TAB}!A:Z`;
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: LOCATION_SHEET_ID,
    range
  });

  const [header, ...rows] = data.values || [];
  if (!header) {
    throw new Error('Location sheet is missing headers');
  }

  const keyIndex = header.findIndex((col) => col.toLowerCase() === 'teamkey');
  const nameIndex = header.findIndex((col) => col.toLowerCase() === 'teamname');
  if (keyIndex === -1 || nameIndex === -1) {
    throw new Error('Location sheet requires teamkey and teamname columns');
  }

  const parsed = rows
    .map((row) => ({
      value: row[keyIndex],
      label: row[nameIndex]
    }))
    .filter((row) => row.value && row.label);

  cachedLocations = parsed;
  cachedLocationsFetchedAt = now;
  return parsed;
};

app.get('/api/locations', async (req, res) => {
  try {
    const locations = await getLocationValues();
    res.json(locations);
  } catch (error) {
    console.error('Location load error', error.message);
    res.status(500).json({ error: 'Unable to load locations' });
  }
});

app.get('/api/me', (req, res) => {
  const email = extractEmailFromHeaders(req);
  if (!email) {
    return res.status(200).json({});
  }
  res.json({ email });
});

app.post('/api/personnel-actions', async (req, res) => {
  const payload = {
    ...req.body,
    actionItems: normalizeActionItems(req.body.actionItems)
  };

  const errors = validateBody(payload);
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  try {
    const sheets = buildSheetsClient();
    const row = formatRow(payload);

    if (!SPREADSHEET_ID) {
      throw new Error('Spreadsheet ID is missing');
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Personnel Actions!A:Z',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [row]
      }
    });

    await sendNotificationEmail(payload);

    res.status(201).json({ message: 'Personnel action submitted successfully' });
  } catch (error) {
    // Log error details for troubleshooting but avoid leaking secrets
    console.error('Submission error', error.message);
    res.status(500).json({ error: 'Unable to submit personnel action. Please try again later.' });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Personnel Action app running on port ${PORT}`);
});
