import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../../theme';

interface GradientCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  gradientColors?: string[];
}

export const GradientCard: React.FC<GradientCardProps> = ({
  children,
  style,
  gradientColors = ['rgba(246, 255, 0, 0.1)', 'rgba(246, 255, 0, 0.05)', 'transparent']
}) => {
  return (
    <View style={[styles.container, style]}>
      {/* Gradient Border Effect */}
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBorder}
      >
        <View style={styles.innerCard}>
          {children}
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.lg,
  },
  gradientBorder: {
    borderRadius: theme.borderRadius.xl,
    padding: 1.5, // Border width
  },
  innerCard: {
    backgroundColor: theme.colors.background.card,
    borderRadius: theme.borderRadius.xl - 1,
    padding: theme.spacing.lg,
  },
});
