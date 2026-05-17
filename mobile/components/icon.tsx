// Tabler-style icon wrapper.
// Expo Go ships @expo/vector-icons but not Tabler set; map to MaterialCommunityIcons
// outline equivalents (closest aesthetic to Tabler outline per design system spec).

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { type OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type MCIName = ComponentProps<typeof MaterialCommunityIcons>['name'];

// Tabler outline name (spec) → MaterialCommunityIcons outline equivalent.
const MAP: Record<string, MCIName> = {
  // Status
  'clock': 'clock-outline',
  'check': 'check',
  'player-play': 'play',
  'x': 'close',
  'refresh': 'refresh',
  'chevron-right': 'chevron-right',
  'search': 'magnify',

  // Tabs
  'list': 'format-list-bulleted',
  'checklist': 'checkbox-marked-outline',
  'inbox': 'inbox-outline',
  'message-circle': 'message-text-outline',
  'settings': 'cog-outline',
  'book': 'book-outline',
};

export type IconName = keyof typeof MAP;

export function Icon({
  name,
  size = 16,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
}) {
  return <MaterialCommunityIcons name={MAP[name]} size={size} color={color} style={style} />;
}
