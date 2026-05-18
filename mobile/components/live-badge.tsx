// Live indicator: 8px green dot (no icon, no text) per design system spec.
// Visible only when SSE detects active run; otherwise tiny muted dot for "open"/"idle".

import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/lib/auth-context';
import { useLiveStatus } from '@/lib/sse';
import { usePalette } from '@/lib/theme';

export function LiveBadge() {
  const p = usePalette();
  const { auth } = useAuth();
  const live = useLiveStatus(auth);

  if (!auth) return null;

  let color: string = p.textSubtle;
  if (live.state.active !== null) color = p.livePulse;
  else if (live.sseStatus === 'error') color = p.danger;
  else if (live.sseStatus === 'open') color = p.queued;

  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
