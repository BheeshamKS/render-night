use proptest::prelude::*;
use rn_core::ranges::*;

proptest! {
    // 1. Strict Ascending Order and Deduplication Invariant
    #[test]
    fn test_custom_range_always_strictly_sorted_and_deduped(
        starts in prop::collection::vec(-1000..1000i32, 1..10),
        ends in prop::collection::vec(-1000..1000i32, 1..10),
        steps in prop::collection::vec(1..20i32, 1..10),
    ) {
        let count = starts.len().min(ends.len()).min(steps.len());
        let mut segments = Vec::new();
        for i in 0..count {
            segments.push(format!("{}-{}x{}", starts[i], ends[i], steps[i]));
        }
        let expr = segments.join(", ");
        let frames = parse_custom_range(&expr).unwrap();

        prop_assert!(!frames.is_empty());

        for w in frames.windows(2) {
            prop_assert!(w[0] < w[1], "Output not strictly monotonic: {} >= {}", w[0], w[1]);
        }
    }

    // 2. Reverse Bounds Invariance: "A-BxS" == "B-AxS"
    #[test]
    fn test_custom_range_reverse_bounds_identical(
        a in -5000..5000i32,
        b in -5000..5000i32,
        step in 1..50i32,
    ) {
        let fwd = format!("{}-{}x{}", a, b, step);
        let rev = format!("{}-{}x{}", b, a, step);
        let frames_fwd = parse_custom_range(&fwd).unwrap();
        let frames_rev = parse_custom_range(&rev).unwrap();
        prop_assert_eq!(frames_fwd, frames_rev);
    }

    // 3. Bound Containment: min(a, b) <= f <= max(a, b)
    #[test]
    fn test_custom_range_single_segment_bounds(
        a in -10_000..10_000i32,
        b in -10_000..10_000i32,
        step in 1..100i32,
    ) {
        let expr = format!("{}-{}x{}", a, b, step);
        let frames = parse_custom_range(&expr).unwrap();
        let low = std::cmp::min(a, b);
        let high = std::cmp::max(a, b);

        prop_assert_eq!(frames[0], low);
        prop_assert!(*frames.last().unwrap() <= high);
        for &f in &frames {
            prop_assert!(f >= low && f <= high);
            prop_assert_eq!((f - low) % step, 0);
        }
    }

    // 4. Robustness / Crash-Freedom Invariant
    #[test]
    fn test_custom_range_never_panics_on_arbitrary_string(s in "\\PC*") {
        let _ = parse_custom_range(&s);
    }
}
