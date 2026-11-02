import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { getWeb, initDb, WebKey } from './src/db';
import HomeScreen from './src/home/HomeScreen';
import WebScreen from './src/screens/WebScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import ImportScreen from './src/screens/ImportScreen';
import MapScreen from './src/screens/MapScreen';
import ModelScreen from './src/screens/ModelScreen';
import { color, font, size, useThemeFonts } from './src/theme';

initDb();

type Tab = 'web' | 'review' | 'add' | 'map' | 'model';
const TABS: { key: Tab; label: string }[] = [
  { key: 'web', label: 'Webs' },
  { key: 'review', label: 'Review' },
  { key: 'add', label: 'Add' },
  { key: 'map', label: 'Map' },
  { key: 'model', label: 'Model' },
];

// Where the Webs tab is: null is the Subjects home screen, otherwise one web.
// Not remembered between launches: the app always opens on Subjects.

export default function App() {
  const fontsReady = useThemeFonts();
  const [tab, setTab] = useState<Tab>('web');
  const [place, setPlace] = useState<WebKey | null>(null);

  // Inside a web (browsing or studying) the tab bar is hidden and the
  // breadcrumb is the way out. A web that no longer exists (sample removed,
  // subject deleted) counts as Subjects, so the tab bar can't get stuck hidden.
  const web = tab === 'web' && place ? getWeb(place) : null;
  const inWeb = !!web;

  function openTab(t: Tab) {
    if (t === 'web') setPlace(null); // the Webs tab always opens on Subjects
    setTab(t);
  }

  if (!fontsReady) return <View style={st.root} />;

  return (
    <SafeAreaProvider>
      {/* Inside a web the screen handles the bottom inset itself, so its
          to-do panel or card can reach down behind the home indicator. */}
      <SafeAreaView style={st.root} edges={inWeb ? ['top'] : ['top', 'bottom']}>
        <StatusBar style="dark" />
        {/* Screens remount on tab change, so Review always reflects new cards. */}
        <View style={st.body}>
          {tab === 'web' && (inWeb && place
            ? <WebScreen webKey={place} onOpen={setPlace} onHome={() => setPlace(null)} />
            : <HomeScreen onOpen={setPlace} />)}
          {tab === 'review' && <ReviewScreen onGoImport={() => setTab('add')} />}
          {tab === 'add' && <ImportScreen onSaved={() => setTab('map')} />}
          {tab === 'map' && <MapScreen />}
          {tab === 'model' && <ModelScreen />}
        </View>
        {!inWeb && <View style={st.tabs}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <Pressable key={t.key} onPress={() => openTab(t.key)} style={[st.tab, active && st.tabActive]} accessibilityRole="tab">
                <Text style={[st.tabText, active && st.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  body: { flex: 1 },
  tabs: { flexDirection: 'row', borderTopWidth: 2, borderColor: color.ink },
  tab: { flex: 1, minHeight: size.tap + 8, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: color.ink },
  tabText: { fontFamily: font.ui, fontSize: 16, color: color.ink },
  tabTextActive: { color: color.paper, fontFamily: font.uiBold },
});
