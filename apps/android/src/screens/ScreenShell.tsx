import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ScreenName } from '../navigation/routeRegistry';
import { findRoute } from '../navigation/routeRegistry';
import { tk } from '../shared/i18n';

interface Props { name: ScreenName; }

export function ScreenShell({ name }: Props) {
  const route = findRoute(name);
  const label = tk(route.labelKey);
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>{route.icon}</Text>
        <Text style={styles.headerTitle}>{label}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.placeholder}>{label}</Text>
        <Text style={styles.hint}>Content coming soon</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  headerIcon: { fontSize: 22, marginRight: 10 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  placeholder: { fontSize: 20, fontWeight: '600', color: '#6b7280', marginBottom: 6 },
  hint: { fontSize: 13, color: '#9ca3af' },
});
