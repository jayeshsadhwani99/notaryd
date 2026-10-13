export type Account = {
  id: string;
  label: string;
  role: string;
  loginMethod: string;
  dataMode: string;
  email: string | null;
  hasCredential: boolean;
};
