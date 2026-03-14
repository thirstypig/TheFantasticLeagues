/**
 * Baseball utilities — re-exports position constants from sportConfig
 * and adds eligibility helpers specific to roster slot logic.
 */
export { POS_ORDER, POS_SCORE, getPrimaryPosition, sortByPosition } from "./sportConfig";

/**
 * Returns true if a player's positions make them eligible for CI (Corner Infield: 1B or 3B).
 */
export function isCIEligible(positions: string | undefined): boolean {
    if (!positions) return false;
    const posList = positions.split(',').map(p => p.trim());
    return posList.some(p => p === '1B' || p === '3B');
}

/**
 * Extracts the last name from a full name string for sorting purposes.
 * "Shohei Ohtani" -> "Ohtani", "Mike Trout" -> "Trout", "Ronald Acuna Jr." -> "Acuna Jr."
 */
export function getLastName(fullName: string | undefined): string {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    if (parts.length <= 1) return parts[0] || '';
    const last = parts[parts.length - 1];
    if (/^(Jr\.?|Sr\.?|II|III|IV|V)$/i.test(last) && parts.length > 2) {
        return parts[parts.length - 2] + ' ' + last;
    }
    return last;
}

/**
 * Returns true if a player's positions make them eligible for MI (Middle Infield: 2B or SS).
 */
export function isMIEligible(positions: string | undefined): boolean {
    if (!positions) return false;
    const posList = positions.split(',').map(p => p.trim());
    return posList.some(p => p === '2B' || p === 'SS');
}
