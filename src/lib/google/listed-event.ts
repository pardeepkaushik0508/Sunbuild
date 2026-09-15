export type ListedGoogleEvent = {
  googleEventId: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string | null;
  meetUrl: string | null;
  description: string | null;
  calendarId: string;
  calendarName: string | null;
};
