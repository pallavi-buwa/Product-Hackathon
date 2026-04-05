import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../../theme';

/** Keep mode — e.g. maintain connections, habits, check-ins. */
export function KeepHomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Keep</Text>
      <Text style={styles.subtitle}>Placeholder — nurture existing bonds & routines.</Text>
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
    color: colors.accentKeep,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 22,
  },
});
