import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const Tab = createBottomTabNavigator();

function Screen({ title }: { title: string }) {
  return (
    <View style={s.c}>
      <Text style={s.t}>{title}</Text>
      <Text style={s.sub}>Tab nav works</Text>
    </View>
  );
}
const s = StyleSheet.create({
  c: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  t: { fontSize: 24, fontWeight: '700', color: '#3b82f6' },
  sub: { fontSize: 14, color: '#666', marginTop: 8 },
});

export function RootNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Home" component={() => <Screen title="Home" />} />
      <Tab.Screen name="Guard" component={() => <Screen title="Guard" />} />
    </Tab.Navigator>
  );
}