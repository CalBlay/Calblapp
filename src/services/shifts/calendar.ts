// File: src/services/shifts/calendar.ts
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export type Event = {
  id: string;
  summary: string;
  description?: string;
  code: string;
  start: string;
  end: string;
  location?: string;
  status: 'pending' | 'draft' | 'done';
};

async function getAuthClient(): Promise<OAuth2Client> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Falten GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REFRESH_TOKEN');
  }
  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return client;
}

export async function getEventsByWeek(
  calendarId: string,
  from: string,
  to: string
): Promise<Event[]> {
  // 1) Preparem client OAuth2 o API key
  let calendar;
  const apiKey = process.env.GOOGLE_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    const auth = await getAuthClient();
    calendar = google.calendar({ version: 'v3', auth });
  } else if (apiKey) {
    calendar = google.calendar({ version: 'v3', auth: apiKey });
  } else {
    throw new Error(
      'No hi ha credencials: defineix GOOGLE_REFRESH_TOKEN o GOOGLE_API_KEY / NEXT_PUBLIC_GOOGLE_API_KEY'
    );
  }

  // 2) Petició a l'API
  const res = await calendar.events.list({
    calendarId,
    timeMin: new Date(from).toISOString(),
    timeMax: new Date(to).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const items = res.data.items || [];
  const codeRegex = /#([A-Za-z0-9\-]+)/;

  // 3) Filtrar i mapear només els events confirmats (#CÒDIG en summary o description)
  const events: Event[] = items
    .filter(item => {
      const text = `${item.description ?? ''}\n${item.summary ?? ''}`;
      return codeRegex.test(text);
    })
    .map(item => {
      const text = `${item.description ?? ''}\n${item.summary ?? ''}`;
      const match = text.match(codeRegex)!;   // segur després del filter
      const code = match[1];

      // Aquí podries afegir més lògica per a status segons algun camp,
      // ara deixem tots com a 'done' perquè són confirmats
      const status: Event['status'] = 'done';

      return {
        id: item.id!,
        summary: item.summary || 'Sense títol',
        description: item.description || undefined,
        code,
        start: item.start?.dateTime || item.start?.date || '',
        end:   item.end?.dateTime   || item.end?.date   || '',
        location: item.location || undefined,
        status,
      };
    });

  return events;
}
