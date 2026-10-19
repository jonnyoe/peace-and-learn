import * as DocumentPicker from 'expo-document-picker';
import * as FS from 'expo-file-system/legacy';
import { chunk } from '../ai/prompt';

export type FileKind = 'pdf' | 'txt' | 'md';
export type PickedFile = { uri: string; name: string; title: string; kind: FileKind };

// About this many characters per "page" for plain text and Markdown.
export const TEXT_PAGE_CHARS = 3000;

const kindOf = (name: string): FileKind | null => {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'txt' || ext === 'text') return 'txt';
  if (ext === 'md' || ext === 'markdown') return 'md';
  return null;
};

/**
 * Opens the system file picker. Returns null if the user cancels.
 * The picker is not filtered by type, because iOS doesn't always map Markdown
 * to a selectable type; the extension is checked here instead.
 */
export async function pickFile(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  const kind = kindOf(a.name);
  if (!kind) throw new Error(`"${a.name}" isn't a PDF, .txt or .md file.`);
  const title = a.name.replace(/\.[^.]+$/, '').trim() || a.name;
  return { uri: a.uri, name: a.name, title, kind };
}

/** Reads a .txt or .md file and splits it into ~3,000-character pages on paragraph boundaries. */
export async function readTextPages(uri: string): Promise<string[]> {
  const raw = await FS.readAsStringAsync(uri, { encoding: FS.EncodingType.UTF8 });
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) return [];
  return chunk(text, TEXT_PAGE_CHARS).map(p => p.trim()).filter(Boolean);
}

export async function readBase64(uri: string): Promise<string> {
  return FS.readAsStringAsync(uri, { encoding: FS.EncodingType.Base64 });
}

/** True if a PDF yielded almost no text, which usually means it's scanned images. */
export function looksScanned(pages: string[]): boolean {
  const chars = pages.reduce((n, p) => n + p.replace(/\s+/g, '').length, 0);
  return chars < 200 || chars / Math.max(1, pages.length) < 30;
}
