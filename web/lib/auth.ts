'use client';

import { useState } from 'react';

type User = {
  uid: string,
  email: string,
  delete: () => void
}

// Stub auth — user is always undefined until Firebase is wired up.
export async function signIn() {}
export async function signOut() {}

export async function getSyncToken(_uid: string): Promise<string> {
  console.log(_uid)
  return 'dev-sync-token';
}

export function useUser() {
  const [user] = useState<User | undefined>();
  return { user, loading: false };
}
