// A small `apm.pdef.json` in the shape ArduPilot's param_metadata/jsonemit.py writes (the same keys and the same quirks:
// numbers are text, `RebootRequired` is "True", the first key is `json`, a group is a vehicle or a library). For tests.

/** A few parameters of ArduCopter and its libraries, in ArduPilot's own definition format. */
export const APM_PDEF = {
  json: { version: 0 },
  ArduCopter: {
    RTL_ALT: {
      Increment: '1',
      Range: { high: '300000', low: '30' },
      Units: 'cm',
      UnitText: 'centimeters',
      description: 'The minimum alt above home the vehicle will climb to before returning.',
      displayName: 'RTL Altitude',
      user: 'Standard',
    },
    FRAME_CLASS: {
      RebootRequired: 'True',
      Values: { 0: 'Undefined', 1: 'Quad', 2: 'Hexa', 3: 'Octa' },
      description: 'Controls major frame class for multicopter component',
      displayName: 'Frame Class',
      user: 'Standard',
    },
    ARMING_CHECK: {
      Bitmask: { 0: 'All', 1: 'Barometer', 2: 'Compass', 3: 'GPS lock' },
      description: 'Allows enabling or disabling of pre-arming checks',
      displayName: 'Arm Checks to Perform (bitmask)',
      user: 'Standard',
    },
  },
  BATT_: {
    BATT_CAPACITY: {
      Increment: '50',
      Units: 'mAh',
      UnitText: 'milliampere hour',
      description: 'Capacity of the battery in mAh when full',
      displayName: 'Battery capacity',
      user: 'Standard',
    },
    // The same name in a second group: the first group's wins.
    RTL_ALT: { description: 'From a library', displayName: 'Library RTL' },
  },
}
