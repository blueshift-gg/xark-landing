export const easings = {
    anticipate: [1, -0.4, 0.35, 0.95] as const,
    anticipateNoDrawback: [1, 0, 0.35, 0.95] as const,
    smooth: [0.25, 0.2, 0.25, 1] as const,
  } as const;
  
  // Export individual easings for convenience
  export const { anticipate, anticipateNoDrawback, smooth } = easings;
  
  // Type for easing values
  export type Easing = (typeof easings)[keyof typeof easings];
  