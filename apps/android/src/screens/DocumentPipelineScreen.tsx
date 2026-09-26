import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { spacing, radius } from '../theme/spacing';
import { SectionCard } from '../components/SectionCard';

const STEPS = [
  { icon: '\u{1F4C4}', label: 'Upload', desc: 'Select a document to process' },
  { icon: '\u{1F50D}', label: 'Scan', desc: 'Detect sensitive data patterns' },
  { icon: '\u{1F6E1}', label: 'Redact', desc: 'Sanitize detected findings' },
  { icon: '\u{1F4E4}', label: 'Export', desc: 'Download sanitized document' },
];

export function DocumentPipelineScreen() {
  return (
    <ScrollView style={styles.c}>
      <Text style={styles.title}>Document Pipeline</Text>
      <Text style={styles.sub}>Process documents through redaction before AI analysis</Text>
      <SectionCard title="Pipeline Steps">
        {STEPS.map((step, i) => (
          <View key={i} style={styles.step}>
            <Text style={styles.stepIcon}>{step.icon}</Text>
            <View style={styles.stepText}>
              <Text style={styles.stepLabel}>{step.label}</Text>
              <Text style={styles.stepDesc}>{step.desc}</Text>
            </View>
            {i < STEPS.length - 1 && <View style={styles.connector} />}
          </View>
        ))}
      </SectionCard>
      <SectionCard title="Supported Formats">
        <Text style={styles.fmt}>TXT, MD, CSV, JSON, PDF, DOCX</Text>
      </SectionCard>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  c:{flex:1,backgroundColor:colors.background,padding:spacing.lg},
  title:{fontSize:24,fontWeight:'700',color:colors.text,marginBottom:4},
  sub:{fontSize:14,color:colors.textSecondary,marginBottom:spacing.lg},
  step:{flexDirection:'row',alignItems:'center',paddingVertical:12,gap:12},
  stepIcon:{fontSize:24},
  stepText:{flex:1},
  stepLabel:{fontSize:15,fontWeight:'600',color:colors.text},
  stepDesc:{fontSize:13,color:colors.textSecondary,marginTop:2},
  connector:{position:'absolute',left:11,top:48,width:2,height:24,backgroundColor:colors.border},
  fmt:{fontSize:14,color:colors.textSecondary},
});
