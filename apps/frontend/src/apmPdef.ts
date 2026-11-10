// A small `apm.pdef.json` in the shape ArduPilot's param_metadata/jsonemit.py really writes. The generator builds a lower-case
// `displayName` / `description` / `user` for each parameter and then does not use them: what it dumps is the parameter's own
// attributes, so the file has `DisplayName`, `Description` and `User` (capitalised, like `Range`, `Units`, `Increment`,
// `Values` and `Bitmask`), numbers as text, `RebootRequired` as "True", `Range` as { high, low } and `Values` / `Bitmask` as
// { code: label }; the first key is `json`, then one object per vehicle and library (a vehicle's own names have no prefix
// in it, a library's carry the library's: "BATT_CAPACITY"). The keys are sorted, as `json.dump(sort_keys=True)` does. For tests.

/** A few parameters of ArduCopter and its libraries, in ArduPilot's own definition format. */
export const APM_PDEF = {
  json: { version: 0 },
  ArduCopter: {
    RTL_ALT: {
      Description: 'The minimum alt above home the vehicle will climb to before returning.',
      DisplayName: 'RTL Altitude',
      Increment: '1',
      Range: { high: '300000', low: '30' },
      Units: 'cm',
      UnitText: 'centimeters',
      User: 'Standard',
    },
    FRAME_CLASS: {
      Description: 'Controls major frame class for multicopter component',
      DisplayName: 'Frame Class',
      RebootRequired: 'True',
      User: 'Standard',
      Values: { 0: 'Undefined', 1: 'Quad', 2: 'Hexa', 3: 'Octa' },
    },
    ARMING_CHECK: {
      Bitmask: { 0: 'All', 1: 'Barometer', 2: 'Compass', 3: 'GPS lock' },
      Description: 'Allows enabling or disabling of pre-arming checks',
      DisplayName: 'Arm Checks to Perform (bitmask)',
      User: 'Standard',
    },
  },
  BATT_: {
    BATT_CAPACITY: {
      Description: 'Capacity of the battery in mAh when full',
      DisplayName: 'Battery capacity',
      Increment: '50',
      Units: 'mAh',
      UnitText: 'milliampere hour',
      User: 'Standard',
    },
    // The same name in a second group: the first group's wins.
    RTL_ALT: { Description: 'From a library', DisplayName: 'Library RTL' },
  },
}
