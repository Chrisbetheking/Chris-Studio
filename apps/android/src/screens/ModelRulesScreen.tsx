import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { getDefaultFileRoutingRules } from '@shared/fileRouter';
import { SectionCard } from '../components/SectionCard';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export function ModelRulesScreen() {
  const rules = getDefaultFileRoutingRules();
  return (
    <ScrollView style={styles.c}>
      <Text style={styles.title}>Model Rules</Text>
      <Text style={styles.sub}>File-type based model routing configuration</Text>
      <SectionCard title="Active Rules">
        {rules.filter(r=>r.enabled).map((r)=>(
          <View key={r.id} style={styles.rule}>
            <View style={styles.ruleLeft}>
              <Text style={styles.ruleCat}>{r.fileCategory.toUpperCase()}</Text>
              <Text style={styles.ruleDesc}>{r.description}</Text>
            </View>
            <View style={styles.ruleRight}>
              <Text style={styles.ruleProvider}>{r.provider}</Text>
              <Text style={styles.ruleModel}>{r.model}</Text>
            </View>
          </View>
        ))}
      </SectionCard>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  c:{flex:1,backgroundColor:colors.background,padding:spacing.lg},
  title:{fontSize:24,fontWeight:'700',color:colors.text,marginBottom:4},
  sub:{fontSize:14,color:colors.textSecondary,marginBottom:spacing.lg},
  rule:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:12,borderBottomWidth:1,borderBottomColor:colors.border},
  ruleLeft:{flex:1},
  ruleCat:{fontSize:13,fontWeight:'700',color:colors.primary},
  ruleDesc:{fontSize:13,color:colors.textSecondary,marginTop:2},
  ruleRight:{alignItems:'flex-end'},
  ruleProvider:{fontSize:14,fontWeight:'600',color:colors.text},
  ruleModel:{fontSize:11,fontFamily:'monospace',color:colors.textMuted,marginTop:2},
});
