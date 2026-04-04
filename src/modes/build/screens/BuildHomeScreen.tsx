import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../../theme';

/** Build mode — e.g. meet people, try activities, grow social skills. */
export function BuildHomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Build</Text>
      <Text style={styles.subtitle}>Placeholder — grow new connections & experiences.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.accentBuild,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 22,
  },
});
