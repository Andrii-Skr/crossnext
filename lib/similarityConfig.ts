export const SIMILARITY_CONFIG = {
  // Minimum percent to consider items similar
  nearThreshold: 50,
  // Minimum percent to consider items duplicates
  duplicateThreshold: 70,
  // How many top matches to compute/show by default
  topK: 5,
} as const;

export type SimilarityConfig = typeof SIMILARITY_CONFIG;
