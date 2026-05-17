import Markdown from 'react-native-markdown-display';

import { Fonts } from '@/constants/theme';
import { usePalette } from '@/lib/theme';

export function MarkdownView({ children }: { children: string }) {
  const p = usePalette();

  const styles = {
    body: { color: p.text, fontSize: 14, lineHeight: 21 },
    heading1: { color: p.text, fontSize: 20, fontWeight: '600' as const, marginTop: 16, marginBottom: 8 },
    heading2: { color: p.text, fontSize: 17, fontWeight: '600' as const, marginTop: 14, marginBottom: 6 },
    heading3: { color: p.text, fontSize: 15, fontWeight: '600' as const, marginTop: 12, marginBottom: 4 },
    paragraph: { marginTop: 0, marginBottom: 10 },
    link: { color: p.inProgress },
    blockquote: {
      backgroundColor: p.surface,
      borderLeftColor: p.border,
      borderLeftWidth: 3,
      paddingLeft: 10,
      paddingVertical: 4,
      marginVertical: 8,
    },
    code_inline: {
      backgroundColor: p.surfaceMuted,
      color: p.text,
      fontFamily: Fonts.mono,
      paddingHorizontal: 4,
      borderRadius: 3,
    },
    code_block: {
      backgroundColor: p.surface,
      borderColor: p.border,
      borderWidth: 1,
      color: p.text,
      fontFamily: Fonts.mono,
      padding: 10,
      borderRadius: 6,
      marginVertical: 8,
    },
    fence: {
      backgroundColor: p.surface,
      borderColor: p.border,
      borderWidth: 1,
      color: p.text,
      fontFamily: Fonts.mono,
      padding: 10,
      borderRadius: 6,
      marginVertical: 8,
    },
    bullet_list: { marginBottom: 8 },
    ordered_list: { marginBottom: 8 },
    list_item: { color: p.text },
    hr: { backgroundColor: p.border, height: 1, marginVertical: 12 },
    table: { borderColor: p.border },
    th: { color: p.text, fontWeight: '600' as const, padding: 6 },
    td: { color: p.text, padding: 6 },
  };

  return <Markdown style={styles}>{children}</Markdown>;
}
