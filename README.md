# Peace and Learn: demo app

A flashcard app built for e-ink screens. AI turns your material into cards, every new idea gets linked to what you already know, and daily reviews are interleaved across subjects by the balance you set.

## What's in here

```
App.tsx                    tab bar: Review / Add / Map / Model
app.json                   Expo config plugins (llama.rn, sqlite, build props)
src/theme.ts, src/ui.tsx   e-ink design tokens and buttons
src/db.ts                  SQLite: domains, concepts, links, cards, reviews, settings
src/scheduler.ts           FSRS scheduling + weighted interleaving across subjects
src/ai/prompt.ts           shared prompt, JSON schema, validation, chunking
src/ai/models.ts           catalog of downloadable GGUF models
src/ai/local.ts            on-device inference with llama.rn (download, load, generate)
src/ai/cloud.ts            optional: calls the server instead
src/ai/index.ts            picks engine, splits long text, merges parts into one draft
src/screens/               Review, Import, Map, Model
server/index.js            optional Express + Claude backend
```

## Running on device (the default)

Card generation runs fully on the device with [llama.rn](https://github.com/mybigday/llama.rn), the same llama.cpp bindings PocketPal AI uses. Output is grammar-constrained to a JSON schema, so even small models return valid JSON.

Because llama.rn is a native module, **Expo Go will not work**. You need a development build.

```bash
npx create-expo-app@latest peace-and-learn --template blank-typescript
cd peace-and-learn
npx expo install expo-sqlite expo-status-bar react-native-safe-area-context expo-file-system expo-build-properties
npm install ts-fsrs llama.rn
```

Copy `App.tsx`, `app.json` and `src/` from this repo over the generated ones, then:

```bash
npx expo prebuild
npx expo run:android          # with the tablet plugged in over USB, USB debugging on
```

No Android Studio setup? Use EAS instead: `npx eas build -p android --profile development`, then install the APK on the tablet.

In the app, open **Model**, download a model, and go to **Add**.

### Picking a model

| Model | Download | RAM | Notes |
|---|---|---|---|
| Qwen3 1.7B | 1.1 GB | 4 GB | Default. Best balance. |
| Qwen2.5 1.5B | 1.0 GB | 3 GB | Older or low-RAM tablets |
| Llama 3.2 3B | 2.0 GB | 6 GB | Better cards, slower |

Add any other instruction-tuned GGUF by putting its Hugging Face download URL in `src/ai/models.ts`.

Expect a passage to take one to a few minutes on a mid-range e-ink tablet. Long material is split into parts of about 3,500 characters; concepts from earlier parts are passed to later ones so they link together.

## Optional: server mode

Switch to **Server** on the Model tab to use Claude through the Express backend for faster, higher-quality cards.

```bash
cd server
cp .env.example .env        # add your Anthropic API key
npm install
npm start                   # listens on :3001
```

Set `EXPO_PUBLIC_API_URL=http://<your computer's LAN IP>:3001` in the app's `.env`.

## How the knowledge graph grows

When you add material, the server sends Claude your text plus a list of concepts already in your deck. Claude returns new concepts, cards, and links. A link key can point at an existing concept id, so new knowledge attaches to old knowledge instead of sitting in isolation. Link types:

- `prerequisite`: understand A before B
- `related`: A and B illuminate each other

## Boox tips

In the Boox per-app settings, set Peace and Learn's refresh mode to "HD" or "Regal" for the cleanest text. Keep the screen on during long generations.

## Ideas for version 2

- Handwritten answers with a stylus (react-native-skia), graded by Claude's vision
- If you keep failing a card, review its prerequisite concepts first
- Synthesis cards that ask you to connect two linked concepts
- Import from PDFs and photos of book pages
- Sync between devices
