import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView as RNWebView, WebViewMessageEvent } from 'react-native-webview';

// react-native-webview's iOS and Android prop types conflict under React 19 /
// RN 0.88 typings and collapse to `never`. Describe only the props used here.
type Handle = { injectJavaScript: (script: string) => void };
type WebProps = {
  ref?: React.Ref<Handle>;
  source: { html: string };
  originWhitelist: string[];
  javaScriptEnabled: boolean;
  onMessage: (e: WebViewMessageEvent) => void;
  onError: (e: { nativeEvent: { description?: string } }) => void;
  onContentProcessDidTerminate: () => void;
};
const WebView = RNWebView as unknown as React.ComponentType<WebProps>;

// pdf.js legacy build (UMD, global `pdfjsLib`). Loading the worker script on
// the page too makes pdf.js run its worker on the main thread, which avoids
// the cross-origin Worker restriction in a WebView.
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build';

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script src="${PDFJS}/pdf.min.js"></script>
<script src="${PDFJS}/pdf.worker.min.js"></script>
</head><body><script>
function send(m) { window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
window.onerror = function (msg) { send({ type: 'error', message: String(msg) }); };
window.extract = async function (b64) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS}/pdf.worker.min.js';
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    bin = null;
    var doc = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
    var pages = [];
    for (var p = 1; p <= doc.numPages; p++) {
      var page = await doc.getPage(p);
      var tc = await page.getTextContent();
      var t = '';
      tc.items.forEach(function (it) {
        if (typeof it.str === 'string') t += it.str + (it.hasEOL ? '\\n' : '');
      });
      pages.push(t.replace(/[ \\t]+\\n/g, '\\n').replace(/[ \\t]{2,}/g, ' ').replace(/\\n{3,}/g, '\\n\\n').trim());
      page.cleanup();
      send({ type: 'progress', page: p, total: doc.numPages });
    }
    send({ type: 'done', pages: pages, pageCount: doc.numPages });
  } catch (e) {
    send({ type: 'error', name: e && e.name, message: (e && e.message) || String(e) });
  }
};
send({ type: 'ready', ok: typeof pdfjsLib !== 'undefined' });
</script></body></html>`;

type Props = {
  base64: string;
  onProgress: (page: number, total: number) => void;
  onDone: (pages: string[], pageCount: number) => void;
  onError: (message: string) => void;
};

const LOAD_TIMEOUT_MS = 30_000;

/** Invisible WebView that extracts the text of each page of a PDF. Mount it to start. */
export default function PdfExtractor({ base64, onProgress, onDone, onError }: Props) {
  const web = useRef<Handle>(null);
  const started = useRef(false);
  const finished = useRef(false);

  const fail = (msg: string) => {
    if (finished.current) return;
    finished.current = true;
    onError(msg);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (!started.current) fail("Couldn't load the PDF reader. PDF import needs an internet connection.");
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  function onMessage(e: WebViewMessageEvent) {
    if (finished.current) return;
    let m: any;
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === 'ready') {
      if (!m.ok) return fail("Couldn't load the PDF reader. PDF import needs an internet connection.");
      if (started.current) return;
      started.current = true;
      web.current?.injectJavaScript(`window.extract("${base64}"); true;`);
    } else if (m.type === 'progress') {
      onProgress(m.page, m.total);
    } else if (m.type === 'done') {
      finished.current = true;
      onDone(m.pages ?? [], m.pageCount ?? 0);
    } else if (m.type === 'error') {
      fail(m.name === 'PasswordException'
        ? 'This PDF is password-protected, which isn\'t supported.'
        : m.name === 'InvalidPDFException'
          ? "This file doesn't look like a valid PDF."
          : `Couldn't read the PDF. ${m.message ?? ''}`.trim());
    }
  }

  return (
    <View style={st.hidden} pointerEvents="none">
      <WebView
        ref={web}
        source={{ html: HTML }}
        originWhitelist={['*']}
        javaScriptEnabled
        onMessage={onMessage}
        onError={e => fail(`Couldn't load the PDF reader. ${e.nativeEvent.description ?? ''}`.trim())}
        onContentProcessDidTerminate={() => fail('The PDF reader ran out of memory. Try a smaller PDF.')}
      />
    </View>
  );
}

const st = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, left: -10, top: -10, overflow: 'hidden' },
});
