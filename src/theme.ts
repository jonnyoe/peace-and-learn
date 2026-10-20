import { useFonts } from 'expo-font';
import { Literata_400Regular } from '@expo-google-fonts/literata/400Regular';
import { Literata_600SemiBold } from '@expo-google-fonts/literata/600SemiBold';
import { Literata_700Bold } from '@expo-google-fonts/literata/700Bold';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { IBMPlexSans_700Bold } from '@expo-google-fonts/ibm-plex-sans/700Bold';

// Ink on paper (docs/knowledge-web-spec.md, section 7). Warm greys only, no
// colour accents or gradients, so everything still reads in grayscale on
// an e-ink screen. No animation in controls, big targets.
export const color = {
  paper: '#F4F1EA',   // screen background
  panel: '#FFFDF8',   // panels, cards, bubbles
  ink: '#1F1F1F',     // text, lines, solid bubbles
  faint: '#5E5A52',   // secondary text
  fadedLine: '#A9A59C',
  fadedBorder: '#8C887F',
  divider: '#E3DFD5',
};

// Each weight is its own font file, so use these instead of fontWeight:
// a custom font ignores fontWeight on iOS.
export const font = {
  reading: 'Literata_400Regular',     // card text, body copy
  readingSemi: 'Literata_600SemiBold', // titles, bubble labels
  readingBold: 'Literata_700Bold',
  ui: 'IBMPlexSans_400Regular',       // labels and controls
  uiMedium: 'IBMPlexSans_500Medium',
  uiSemi: 'IBMPlexSans_600SemiBold',  // buttons
  uiBold: 'IBMPlexSans_700Bold',
};

/** Loads the fonts above. Render nothing until it returns true. */
export function useThemeFonts(): boolean {
  const [loaded, error] = useFonts({
    [font.reading]: Literata_400Regular,
    [font.readingSemi]: Literata_600SemiBold,
    [font.readingBold]: Literata_700Bold,
    [font.ui]: IBMPlexSans_400Regular,
    [font.uiMedium]: IBMPlexSans_500Medium,
    [font.uiSemi]: IBMPlexSans_600SemiBold,
    [font.uiBold]: IBMPlexSans_700Bold,
  });
  // If loading fails, carry on with system fonts rather than a blank app.
  return loaded || !!error;
}

export const size = {
  card: 26,
  body: 18,
  small: 15,
  tap: 56, // main touch targets; secondary controls go down to 44
  pad: 20,
};
