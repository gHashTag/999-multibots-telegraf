import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import theme from '../../theme';

interface GlowCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  glowColor?: string;
}

export const GlowCard: React.FC<GlowCardProps> = ({
  children,
  style,
  glowColor = theme.colors.brand.DEFAULT
}) => {
  return (
    <View style={[styles.container, style]}>
      {/* Glow Effect Layer */}
      <View style={[styles.glowLayer, { shadowColor: glowColor }]} />

      {/* Card Content */}
      <View style={styles.cardContent}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginBottom: theme.spacing.lg,
  },
  glowLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: theme.borderRadius.xl,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  cardContent: {
    backgroundColor: theme.colors.background.card,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border.brown,
    padding: theme.spacing.lg,
    overflow: 'hidden',
  },
});
