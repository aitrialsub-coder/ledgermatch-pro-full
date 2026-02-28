/**
 * Re-export all similarity functions for clean imports
 */

export { levenshteinDistance, levenshteinSimilarity, levenshteinSimilarityCI, levenshteinDistanceBounded } from './levenshtein';
export { jaroSimilarity, jaroWinklerSimilarity, jaroWinklerSimilarityCI, jaroWinklerBestMatches } from './jaroWinkler';
export { tokenSortRatio, tokenSetRatio, tokenContainment, descriptionSimilarity, computeDescriptionSimilarity } from './tokenSort';
export { NgramIndex, extractNgrams, ngramSimilarity } from './ngramIndex';