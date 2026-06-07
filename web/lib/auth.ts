'use client';

import { useState } from 'react';

type User = {
  uid: string,
  email: string,
  delete: () => void
}
// Mock auth — always signed in as dev user until Firebase is configured.
const DEV_USER = {
  uid: null,
  email: 'dev@local',
  delete: async () => {},
} as const;

export async function signIn() {}
export async function signOut() {}

export async function getSyncToken(_uid: string): Promise<string> {
  return 'dev-sync-token';
}

export function useUser() {
  const [user] = useState<User | undefined>();
  return { user, loading: false };
}
