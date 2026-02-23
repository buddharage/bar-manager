// Sling Scheduling API Client (Phase 3)
// Token-based authentication
// Placeholder — will be implemented in Phase 3

const SLING_BASE_URL = "https://api.getsling.com/v1";

async function slingFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${SLING_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: process.env.SLING_API_TOKEN!,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Sling API ${path}: ${response.status}`);
  }

  return response.json();
}

export async function fetchShifts(startDate: string, endDate: string) {
  return slingFetch(`/${process.env.SLING_ORG_ID}/calendar/${startDate}/${endDate}/shifts`);
}

export async function fetchEmployees() {
  return slingFetch(`/${process.env.SLING_ORG_ID}/users`);
}

export async function createShift(_shift: {
  userId: string;
  start: string;
  end: string;
  position?: string;
}) {
  // Phase 3 implementation
  throw new Error("Sling shift creation not yet implemented (Phase 3)");
}
