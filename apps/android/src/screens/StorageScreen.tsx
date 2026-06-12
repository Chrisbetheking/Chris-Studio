import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { getDefaultStoragePaths } from '@shared/storage';
import { SectionCard } from '../components/SectionCard';
import { colors } from '../theme/colors';
import { spacing, radius } from '../theme/spacing';

export function StorageScreen() {
  const paths = getDefaultStoragePaths();
  const handleSelect = (label: string) => Alert.alert(label, 'Storage path selection available on desktop app.');
  const handleReset = () => Alert.alert('Reset', 'Storage paths reset to defaults.');

  return (
    <ScrollView style={styles.c}>
      <Text style={styles.title}>Storage</Text>
      <Text style={styles.sub}>Configure local storage and workspace paths</Text>
      <SectionCard title="Workspace Paths">
        {([
          { key: 'workspacePath' as const, label: 'Workspace' },
          { key: 'archivePath' as const, label: 'Archive' },
          { key: 'exportPath' as const, label: 'Export' },
          { key: 'contextPacksPath' as const, label: 'Context Packs' },
        ] as const).map((item) => (
          <TouchableOpacity key={item.key} style={styles.row} onPress={()=>handleSelect(item.label)}>
            <Text style={styles.rowLabel}>{item.label} Path</Text>
            <Text style={styles.rowVal} numberOfLines={1}>{paths[item.key] || 'Default'}</Text>
          </TouchableOpacity>
        ))}
      </SectionCard>
      <TouchableOpacity style={styles.resetBtn} onPress={handleReset}><Text style={styles.resetBtnT}>Reset to Default</Text></TouchableOpacity>
      <Text style={styles.note}>Note: Full storage path selection is available on the desktop app with file dialog support.</Text>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  c:{flex:1,backgroundColor:colors.background,padding:spacing.lg},
  title:{fontSize:24,fontWeight:'700',color:colors.text,marginBottom:4},
  sub:{fontSize:14,color:colors.textSecondary,marginBottom:spacing.lg},
  row:{paddingVertical:12,borderBottomWidth:1,borderBottomColor:colors.border},
  rowLabel:{fontSize:14,fontWeight:'600',color:colors.text},
  rowVal:{fontSize:12,color:colors.textMuted,marginTop:2},
  resetBtn:{backgroundColor:colors.surface,borderRadius:radius.md,paddingVertical:spacing.md,alignItems:'center',borderWidth:1,borderColor:colors.border,marginTop:spacing.lg,marginBottom:spacing.md},
  resetBtnT:{fontSize:15,fontWeight:'500',color:colors.textSecondary},
  note:{fontSize:12,color:colors.textMuted,fontStyle:'italic',textAlign:'center'},
});
