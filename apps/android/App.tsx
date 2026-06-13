import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationProvider, useNavigation } from './src/navigation/NavigationContext';
import { TabBar, MoreSheet } from './src/navigation/TabShell';
import { ScreenShell } from './src/screens/ScreenShell';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { MORE_ROUTES } from './src/navigation/routeRegistry';

function AppContent() {
  const { currentScreen, navigate } = useNavigation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreScreen = MORE_ROUTES.includes(currentScreen) || currentScreen === 'Settings';
  const tabScreen = isMoreScreen ? 'More' as const : currentScreen;

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <ErrorBoundary key={currentScreen}>
          <ScreenShell name={currentScreen} />
        </ErrorBoundary>
      </View>
      <TabBar currentScreen={tabScreen} onMorePress={() => setMoreOpen(true)} />
      <MoreSheet visible={moreOpen} onClose={() => setMoreOpen(false)} />
    </View>
  );
}

export default function App() {
  return (
    <NavigationProvider>
      <StatusBar style="dark" />
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </NavigationProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  body: { flex: 1 },
});