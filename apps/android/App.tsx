import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';

type Screen = 'Home' | 'Guard' | 'Models' | 'Archive' | 'Settings';

function HomeScreen() { return <View style={s.screen}><Text style={s.title}>TokenFence Mobile Lite</Text><Text style={s.sub}>v0.5.15</Text></View>; }
function GuardScreen() { return <View style={s.screen}><Text style={s.title}>Prompt Guard</Text></View>; }
function ModelsScreen() { return <View style={s.screen}><Text style={s.title}>Model Matrix</Text></View>; }
function ArchiveScreen() { return <View style={s.screen}><Text style={s.title}>Local Archive</Text></View>; }
function SettingsScreen() { return <View style={s.screen}><Text style={s.title}>Settings</Text></View>; }

const SCREENS: Record<Screen, React.ComponentType> = {
  Home: HomeScreen, Guard: GuardScreen, Models: ModelsScreen,
  Archive: ArchiveScreen, Settings: SettingsScreen,
};
const LABELS: Screen[] = ['Home', 'Guard', 'Models', 'Archive', 'Settings'];

export default function App() {
  const [screen, setScreen] = useState<Screen>('Home');
  const ActiveScreen = SCREENS[screen];
  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <View style={s.container}>
        <ScrollView style={s.body}>
          <ActiveScreen />
        </ScrollView>
        <View style={s.tabs}>
          {LABELS.map((label) => (
            <TouchableOpacity key={label} style={[s.tab, screen===label&&s.tabActive]} onPress={()=>setScreen(label)}>
              <Text style={[s.tabText, screen===label&&s.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  body: { flex: 1 },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#3b82f6' },
  sub: { fontSize: 14, color: '#666', marginTop: 8 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#f9fafb', paddingBottom: 4 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabActive: { borderTopWidth: 2, borderTopColor: '#3b82f6' },
  tabText: { fontSize: 11, color: '#9ca3af' },
  tabTextActive: { color: '#3b82f6', fontWeight: '600' },
});