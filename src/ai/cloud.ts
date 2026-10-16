import { KnownConcept } from './prompt';

// Optional: the Express server in /server, for when you want a bigger model.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3001';

export async function generateCloud(text: string, domain: string, known: KnownConcept[]): Promise<any> {
  const res = await fetch(`${API_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, domain, existingConcepts: known }),
  });
  if (!res.ok) throw new Error(`Server returned ${res.status}: ${await res.text()}`);
  return res.json();
}
