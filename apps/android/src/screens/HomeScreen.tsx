import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TaskType } from '@shared/types';
import { TASK_TYPE_LABELS } from '@shared/types';
import { colors } from '../theme/colors';
import { spacing, radius } from '../theme/spacing';

const CURRENT_VERSION = 'v0.5.0-dev';

type Nav = NativeStackNavigationProp<{ Home: undefined; Guard: { prompt: string } }, 'Home'>;

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const [prompt, setPrompt] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('general');

  const handleScan = () => { if (prompt.trim()) navigation.navigate('Guard', { prompt }); };
  const handleClear = () => setPrompt('');

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* ── Header area ── */}
      <Text style={styles.title}>New Safe Prompt</Text>
      <Text style={styles.subtitle}>Compose or paste your prompt below for scanning</Text>

      {/* Task type chips */}
      <View style={styles.chips}>{(Object.entries(TASK_TYPE_LABELS) as [TaskType, string][]).map(([k,v]) => (
        <TouchableOpacity key={k} style={[styles.chip, taskType===k&&styles.chipActive]} onPress={()=>setTaskType(k)}>
          <Text style={[styles.chipText, taskType===k&&styles.chipTextActive]}>{v}</Text>
        </TouchableOpacity>
      ))}</View>

      {/* Prompt input */}
      <View style={styles.inputWrap}>
        <TextInput style={styles.input} value={prompt} onChangeText={setPrompt}
          placeholder="Paste your prompt here..." placeholderTextColor={colors.textMuted}
          multiline textAlignVertical="top" />
        {prompt.length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Scan button */}
      <TouchableOpacity style={[styles.button, !prompt.trim()&&styles.buttonDisabled]}
        onPress={handleScan} disabled={!prompt.trim()}>
        <Text style={styles.buttonText}>Scan Prompt</Text>
      </TouchableOpacity>

      {/* ── Status cards ── */}
      <View style={styles.sectionSpacing}>
        <Text style={styles.sectionTitle}>Status</Text>

        {/* Safety status card */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.statusDot} />
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>Prompt Guard Active</Text>
              <Text style={styles.cardSubtitle}>All prompts scanned and redacted locally</Text>
            </View>
          </View>
        </View>

        {/* Document pipeline card */}
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('DocumentPipeline' as any)}>
          <View style={styles.cardRow}>
            <View style={[styles.statusDot, styles.statusDotAccent]} />
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>Document Pipeline</Text>
              <Text style={styles.cardSubtitle}>Chunk, clean, and prepare documents</Text>
            </View>
            <Text style={styles.cardArrow}>→</Text>
          </View>
        </TouchableOpacity>

        {/* Model routing card */}
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Models' as any)}>
          <View style={styles.cardRow}>
            <View style={[styles.statusDot, styles.statusDotAmber]} />
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>Model Routing</Text>
              <Text style={styles.cardSubtitle}>Multi-provider with fallback</Text>
            </View>
            <Text style={styles.cardArrow}>→</Text>
          </View>
        </TouchableOpacity>

        {/* Archive card */}
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Archive' as any)}>
          <View style={styles.cardRow}>
            <View style={[styles.statusDot, styles.statusDotSlate]} />
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>Local Archive</Text>
              <Text style={styles.cardSubtitle}>Saved prompts and detections</Text>
            </View>
            <Text style={styles.cardArrow}>→</Text>
          </View>
        </TouchableOpacity>

        {/* Provider card */}
        <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Settings' as any)}>
          <View style={styles.cardRow}>
            <View style={[styles.statusDot, styles.statusDotSlate]} />
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>Provider Settings</Text>
              <Text style={styles.cardSubtitle}>Manage API keys and endpoints</Text>
            </View>
            <Text style={styles.cardArrow}>→</Text>
          </View>
        </TouchableOpacity>
      </View>
      {/* ── v0.5.0 Experimental cards ── */}
      <View style={styles.sectionSpacing}>
        <Text style={styles.sectionTitle}>Experimental</Text>

        <TouchableOpacity style={styles.card}>
          <View style={styles.cardRow}>
            <View style={[styles.statusDot, styles.statusDotAmber]} />
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>Agent Lab</Text>
              <Text style={styles.cardSubtitle}>Local agent task workspace (experimental)</Text>
            </View>
            <Text style={styles.cardArrow}>→</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card}>
          <View style={styles.cardRow}>
            <View style={[styles.statusDot, styles.statusDotAmber]} />
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>Plugin Store</Text>
              <Text style={styles.cardSubtitle}>Browse and install plugins (MVP)</Text>
            </View>
            <Text style={styles.cardArrow}>→</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card}>
          <View style={styles.cardRow}>
            <View style={[styles.statusDot, styles.statusDotAmber]} />
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>Output Generation</Text>
              <Text style={styles.cardSubtitle}>Export to MD, HTML, JSON, PDF (MVP)</Text>
            </View>
            <Text style={styles.cardArrow}>→</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card}>
          <View style={styles.cardRow}>
            <View style={[styles.statusDot, styles.statusDotAmber]} />
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>Mind Map Generator</Text>
              <Text style={styles.cardSubtitle}>Mermaid mind maps from output</Text>
            </View>
            <Text style={styles.cardArrow}>→</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.card}>
          <View style={styles.cardRow}>
            <View style={[styles.statusDot, styles.statusDotAmber]} />
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>Model Routing</Text>
              <Text style={styles.cardSubtitle}>Auto-routing with fallback chains</Text>
            </View>
            <Text style={styles.cardArrow}>→</Text>
          </View>
        </TouchableOpacity>
      </View>


      {/* ── Release version card ── */}
      <View style={styles.releaseCard}>
        <View style={styles.releaseCardInner}>
          <Text style={styles.releaseLabel}>TokenFence Studio</Text>
          <Text style={styles.releaseVersion}>{CURRENT_VERSION}</Text>
        </View>
        <View style={styles.releaseBadges}>
          <View style={styles.releaseBadge}>
            <Text style={styles.releaseBadgeText}>Android APK</Text>
          </View>
          <View style={[styles.releaseBadge, styles.releaseBadgeGreen]}>
            <Text style={styles.releaseBadgeText}>Available</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.xl },

  /* Chips */
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.lg },
  chip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  chipTextActive: { color: colors.white },

  /* Input */
  inputWrap: { position: 'relative', marginBottom: spacing.lg },
  input: { minHeight: 180, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: 14, fontFamily: 'monospace', color: colors.text, backgroundColor: colors.surface },
  clearBtn: { position: 'absolute', top: 8, right: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  clearBtnText: { fontSize: 11, color: colors.textSecondary },

  /* Button */
  button: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '600' },

  /* Sections */
  sectionSpacing: { marginTop: spacing.xl },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: spacing.md },

  /* Status cards */
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTextWrap: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  cardSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  cardArrow: { fontSize: 16, color: colors.textMuted },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.riskSafe },
  statusDotAccent: { backgroundColor: colors.primary },
  statusDotAmber: { backgroundColor: colors.riskLow },
  statusDotSlate: { backgroundColor: colors.textMuted },

  /* Release card */
  releaseCard: { marginTop: spacing.xl, marginBottom: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  releaseCardInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  releaseLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  releaseVersion: { fontSize: 13, fontWeight: '700', color: colors.primary },
  releaseBadges: { flexDirection: 'row', gap: 8 },
  releaseBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: colors.surfaceAlt },
  releaseBadgeGreen: { backgroundColor: colors.riskSafe + '20' as any }, // Light green bg
  releaseBadgeText: { fontSize: 11, fontWeight: '500', color: colors.textSecondary },
});
