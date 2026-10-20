import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { getSetting, initDb, setSetting, WebKey } from './src/db';
import HomeScreen from './src/screens/HomeScreen';
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

// Where the Webs tab is: null is the home screen (all subjects), otherwise
// one web. Remembered between launches.
function loadPlace(): WebKey | null {
  try { return JSON.parse(getSetting('web_place') ?? 'null'); } catch { return null; }
}

export default function App() {
  const fontsReady = useThemeFonts();
  const [tab, setTab] = useState<Tab>('web');
  const [place, setPlaceState] = useState<WebKey | null>(loadPlace);

  function setPlace(p: WebKey | null) {
    setSetting('web_place', JSON.stringify(p));
    setPlaceState(p);
  }

  if (!fontsReady) return <View style={st.root} />;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={st.root} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        {/* Screens remount on tab change, so Review always reflects new cards. */}
        <View style={st.body}>
          {tab === 'web' && (place
            ? <WebScreen webKey={place} onOpen={setPlace} onHome={() => setPlace(null)} />
            : <HomeScreen onOpen={setPlace} />)}
          {tab === 'review' && <ReviewScreen onGoImport={() => setTab('add')} />}
          {tab === 'add' && <ImportScreen onSaved={() => setTab('map')} />}
          {tab === 'map' && <MapScreen />}
          {tab === 'model' && <ModelScreen />}
        </View>
        <View style={st.tabs}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={[st.tab, active && st.tabActive]} accessibilityRole="tab">
                <Text style={[st.tabText, active && st.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
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
