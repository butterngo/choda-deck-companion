import { Colors, type Palette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function usePalette(): Palette {
  const scheme = useColorScheme();
  return Colors[scheme ?? 'light'];
}
