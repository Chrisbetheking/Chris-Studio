import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <View style={s.c}>
        <Text style={s.t}>SafeArea 4.8.2 Test</Text>
        <Text style={s.sub}>If you see this, fix works</Text>
      </View>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  t: { fontSize: 24, fontWeight: '700', color: '#3b82f6' },
  sub: { fontSize: 14, color: '#666', marginTop: 8 },
});