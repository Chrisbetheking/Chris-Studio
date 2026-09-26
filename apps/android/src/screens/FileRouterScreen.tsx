import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { detectFileType, recommendModelForFile, getDefaultFileRoutingRules } from '@shared/fileRouter';
import { PROVIDERS } from '@shared/providers';
import type { FileTypeInfo, ProviderModel } from '@shared/types';
import { SectionCard } from '../components/SectionCard';
import { ProviderCard } from '../components/ProviderCard';
import { colors } from '../theme/colors';
import { spacing, radius } from '../theme/spacing';

export function FileRouterScreen() {
  const [fileName, setFileName] = useState('');
  const [fileInfo, setFileInfo] = useState<FileTypeInfo|null>(null);
  const [recommendation, setRecommendation] = useState<ProviderModel|null>(null);

  const handleDetect = () => {
    if (!fileName.trim()) return;
    const info = detectFileType(fileName);
    setFileInfo(info);
    const rec = recommendModelForFile(fileName);
    setRecommendation(rec);
  };

  return (
    <ScrollView style={styles.c}>
      <Text style={styles.title}>File Router</Text>
      <Text style={styles.sub}>Detect file type and get model routing recommendation</Text>
      <View style={styles.inputRow}>
        <TextInput style={styles.input} value={fileName} onChangeText={setFileName}
          placeholder="Enter filename (e.g. report.pdf)" placeholderTextColor={colors.textMuted} />
        <TouchableOpacity style={styles.btn} onPress={handleDetect}><Text style={styles.btnT}>Detect</Text></TouchableOpacity>
      </View>
      {fileInfo && (
        <SectionCard title="Detection Result">
          <Text style={styles.result}><Text style={styles.bold}>Category:</Text> {fileInfo.label}</Text>
          <Text style={styles.result}><Text style={styles.bold}>Type:</Text> {fileInfo.category}</Text>
          <Text style={styles.result}><Text style={styles.bold}>Recommended Model:</Text> {fileInfo.recommendedModel}</Text>
        </SectionCard>
      )}
      {recommendation && <ProviderCard model={recommendation} />}
      <SectionCard title="Default Routing Rules">
        {getDefaultFileRoutingRules().slice(0,5).map((r)=>(
          <View key={r.id} style={styles.rule}>
            <Text style={styles.ruleLabel}>{r.fileCategory}</Text>
            <Text style={styles.ruleDesc}>{r.provider} / {r.model}</Text>
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
  inputRow:{flexDirection:'row',gap:8,marginBottom:spacing.lg},
  input:{flex:1,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,fontSize:14,color:colors.text,backgroundColor:colors.surface},
  btn:{backgroundColor:colors.primary,borderRadius:radius.md,paddingVertical:spacing.md,paddingHorizontal:spacing.lg,justifyContent:'center'},
  btnT:{color:colors.white,fontSize:14,fontWeight:'600'},
  result:{fontSize:14,color:colors.textSecondary,marginBottom:4},
  bold:{fontWeight:'600',color:colors.text},
  rule:{paddingVertical:8,borderBottomWidth:1,borderBottomColor:colors.border},
  ruleLabel:{fontSize:14,fontWeight:'600',color:colors.text},
  ruleDesc:{fontSize:12,color:colors.textSecondary,marginTop:2},
});
