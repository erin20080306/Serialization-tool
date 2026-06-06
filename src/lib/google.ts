import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

// Google OAuth2 client setup
export function getGoogleOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = process.env.NEXTAUTH_URL + '/api/auth/callback/google';

  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

// Get Google Sheets API client with access token
export async function getSheetsClient(accessToken: string) {
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  return google.sheets({ version: 'v4', auth: oauth2Client as any });
}

// Get spreadsheet metadata
export async function getSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
) {
  const sheets = await getSheetsClient(accessToken);

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  return {
    spreadsheetId: response.data.spreadsheetId,
    title: response.data.properties?.title,
    sheets: response.data.sheets?.map((sheet) => ({
      sheetId: sheet.properties?.sheetId,
      title: sheet.properties?.title,
      index: sheet.properties?.index,
    })),
  };
}

// Read data from a specific sheet
export async function readSheetData(
  spreadsheetId: string,
  sheetName: string,
  accessToken: string
) {
  const sheets = await getSheetsClient(accessToken);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName,
  });

  const values = response.data.values;
  if (!values || values.length === 0) {
    throw new Error('No data found in sheet');
  }

  const headers = values[0];
  const rows = values.slice(1);

  return {
    columns: headers,
    rows,
  };
}

// Write data to a new sheet
export async function writeSheetData(
  spreadsheetId: string,
  sheetName: string,
  data: any[][],
  accessToken: string
) {
  const sheets = await getSheetsClient(accessToken);

  // First, add a new sheet
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetName,
            },
          },
        },
      ],
    },
  });

  // Then write the data
  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: data,
    },
  });

  return response.data;
}

// Extract spreadsheet ID from URL
export function extractSpreadsheetId(url: string): string | null {
  const patterns = [
    /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
    /\/d\/([a-zA-Z0-9-_]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}
