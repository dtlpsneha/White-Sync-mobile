import { useWindowDimensions } from 'react-native';

/**
 * A hook that provides responsive scaling factors based on the current window dimensions.
 * These factors update automatically when the screen size or orientation changes.
 */
export const useResponsive = () => {
    const { width, height } = useWindowDimensions();

    // Guideline sizes are based on standard iPhone 11/12/13/14 screen mobile device
    const guidelineBaseWidth = 375;
    const guidelineBaseHeight = 812;

    /**
     * Scaled width based on device screen width.
     */
    const s = (size: number) => (width / guidelineBaseWidth) * size;

    /**
     * Scaled height based on device screen height.
     */
    const vs = (size: number) => (height / guidelineBaseHeight) * size;

    /**
     * Moderate scale for font sizes and border radii.
     * The 0.5 factor makes the scaling less aggressive.
     */
    const ms = (size: number, factor = 0.5) => size + (s(size) - size) * factor;

    return {
        s,
        vs,
        ms,
        width,
        height,
        isSmallDevice: width < 375,
        isTablet: width >= 768,
    };
};
