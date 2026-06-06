'use client';

import { useState } from 'react';

// Mock auth — always signed in as dev user until Firebase is configured.
const DEV_USER = {
  uid: 'dev-user',
  email: 'dev@local',
  delete: async () => {},
} as const;

export async function signIn() {}
export async function signOut() {}

export async function getSyncToken(_uid: string): Promise<string> {
  return 'dev-sync-token';
}

export function useUser() {
  const [user] = useState(DEV_USER);
  return { user, loading: false };
}
