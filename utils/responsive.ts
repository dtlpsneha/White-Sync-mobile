import { Dimensions, PixelRatio } from 'react-native';

const { width, height } = Dimensions.get('window');

// Guideline sizes are based on standard iPhone 11/12/13/14 screen mobile device
const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;

/**
 * Scaled width based on device screen width.
 */
export const s = (size: number) => (width / guidelineBaseWidth) * size;

/**
 * Scaled height based on device screen height.
 */
export const vs = (size: number) => (height / guidelineBaseHeight) * size;

/**
 * Moderate scale for font sizes and border radii.
 * The 0.5 factor makes the scaling less aggressive.
 */
export const ms = (size: number, factor = 0.5) => size + (s(size) - size) * factor;

/**
 * Device dimensions for direct usage.
 */
export const device = {
    width,
    height,
    isSmallDevice: width < 375,
    pixelRatio: PixelRatio.get(),
};
