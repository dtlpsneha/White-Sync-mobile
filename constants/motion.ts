/**
 * One set of motions for the whole app ("rise & fade"): short, eased, no bounce.
 * Pages rise from the bottom with a fade (see app/_layout.tsx); cards and rows fade up.
 *
 * Screens used to mix 400–900 ms fades with spring "pops" and delays of up to a
 * second, so pages felt slow and every list row wobbled in. Everything now comes
 * from here: a quick rise-and-fade, a tight stagger for the first few rows only,
 * and a calm layout change. The system "reduce motion" setting is respected.
 */
import {
    Easing,
    FadeIn,
    FadeInUp,
    FadeOut,
    LinearTransition,
    ReduceMotion,
    SlideInDown,
} from 'react-native-reanimated';

const EASE_OUT = Easing.out(Easing.cubic);
const STAGGER_MS = 40;
const MAX_STAGGERED = 6;

/** Rows and cards in a list: rise and fade; only the first few are staggered. */
export function enterItem(index = 0) {
    return FadeInUp.duration(280)
        .delay(Math.min(Math.max(index, 0), MAX_STAGGERED) * STAGGER_MS)
        .easing(EASE_OUT)
        .reduceMotion(ReduceMotion.System);
}

/** List rows far down a long list appear without animation (keeps scrolling smooth). */
export function enterRow(index: number) {
    return index < 10 ? enterItem(index) : undefined;
}

/** Blocks on a detail page or form, in reading order. */
export function enterSection(order = 0) {
    return FadeInUp.duration(280)
        .delay(Math.min(order, MAX_STAGGERED) * 50)
        .easing(EASE_OUT)
        .reduceMotion(ReduceMotion.System);
}

/** Things that just appear in place (results, hints). */
export const appear = FadeIn.duration(200).reduceMotion(ReduceMotion.System);
export const disappear = FadeOut.duration(150).reduceMotion(ReduceMotion.System);

/** Bottom sheets and pickers. */
export const sheetIn = SlideInDown.duration(280).easing(EASE_OUT).reduceMotion(ReduceMotion.System);

/** Size or position changes (a result card growing, a field showing up). */
export const smoothLayout = LinearTransition.duration(220).easing(EASE_OUT).reduceMotion(ReduceMotion.System);
