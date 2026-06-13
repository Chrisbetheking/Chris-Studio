import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from './NavigationContext';
import { TAB_ROUTES, MORE_ROUTES, findRoute, type ScreenName } from './routeRegistry';
import { tk } from '@shared/i18n';

interface TabShellProps {
  currentScreen: ScreenName | 'More';
  onMorePress: () => void;
}

export function TabBar({ currentScreen, onMorePress }: TabShellProps) {
  const { navigate } = useNavigation();
  return (
    <View style={styles.tabBar}>
      {TAB_ROUTES.map(name => {
        const route = findRoute(name);
        const active = currentScreen === name || (name === 'More' && currentScreen === 'More');
        return (
          <TouchableOpacity
            key={name}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => name === 'More' ? onMorePress() : navigate(name)}
          >
            <Text style={styles.tabIcon}>{route.icon}</Text>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
              {tk(route.labelKey)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function MoreSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { navigate } = useNavigation();
  if (!visible) return null;
  return (
    <View style={styles.moreOverlay}>
      <TouchableOpacity style={styles.moreBackdrop} onPress={onClose} />
      <View style={styles.moreSheet}>
        <View style={styles.moreHandle} />
        <Text style={styles.moreTitle}>{tk('android.more')}</Text>
        <ScrollView style={styles.moreList}>
          {MORE_ROUTES.map(name => {
            const route = findRoute(name);
            return (
              <TouchableOpacity
                key={name}
                style={styles.moreItem}
                onPress={() => { navigate(name); onClose(); }}
              >
                <Text style={styles.moreIcon}>{route.icon}</Text>
                <Text style={styles.moreLabel}>{tk(route.labelKey)}</Text>
                <Text style={styles.moreArrow}>&rsaquo;</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingBottom: 20,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabActive: {
    // active indicator handled by label color
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  moreOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  moreBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  moreSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 30,
  },
  moreHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  moreTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    color: '#1f2937',
  },
  moreList: {
    paddingHorizontal: 16,
  },
  moreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  moreIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  moreLabel: {
    flex: 1,
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  moreArrow: {
    fontSize: 22,
    color: '#9ca3af',
  },
});
