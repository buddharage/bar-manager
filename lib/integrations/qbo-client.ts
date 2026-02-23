// QuickBooks Online API Client (Phase 2)
// OAuth2 Authorization Code flow
// Placeholder — will be implemented in Phase 2

const QBO_BASE_URL = "https://quickbooks.api.intuit.com/v3";

interface QBOTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export function getAuthorizationUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID!,
    redirect_uri: process.env.QBO_REDIRECT_URI!,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    state: crypto.randomUUID(),
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params}`;
}

export async function exchangeCodeForTokens(code: string): Promise<QBOTokens> {
  const response = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.QBO_REDIRECT_URI!,
    }),
  });

  if (!response.ok) {
    throw new Error(`QBO token exchange failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

export async function createJournalEntry(
  _tokens: QBOTokens,
  _entry: { date: string; lines: Array<{ account: string; amount: number; type: "debit" | "credit" }> }
) {
  // Phase 2 implementation
  void QBO_BASE_URL;
  throw new Error("QBO journal entry creation not yet implemented (Phase 2)");
}
