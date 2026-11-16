// The two lines about the vehicle's state that the question of a write may have (the English words of `question.armed` and
// `question.unknown`), for the window specs that match the question. No imports: a test of the interface checks them against
// the locale (`src/i18n/say.test.ts`).

/** The line a vehicle that is armed has in the question of a write. */
export const ARMED_LINE = 'The vehicle is armed: changes take effect now.'

/** The line a vehicle whose state is not known has. */
export const UNKNOWN_LINE = 'The vehicle\'s state is not known (it may be armed): changes take effect now.'
