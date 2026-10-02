/**
 * True while a More-stack feature was opened from a Home tile rather than from the More menu.
 * Set by the Home screen; cleared when the More menu itself is shown. more/_layout.tsx reads it so
 * that Back from such a feature returns to Home, not to the More menu the user never visited.
 */
export const homeOrigin = { current: false };
