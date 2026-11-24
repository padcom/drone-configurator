// ArduPilot's renamed parameters (#202): which name a later firmware gives a parameter, since which release, for which vehicles,
// and how the value changes with the name. Facts written for this app from ArduPilot's own conversion rules, each with the file
// and line of the firmware that converts it (`AP_Param::convert_old_parameters`, `convert_old_parameters_scaled`,
// `convert_parameter_width`, `convert_centi_parameter`, a table renamed in place) in the release named, and its release notes.
// Only what the firmware itself carries over from the old name is here: a parameter dropped without a conversion (SRn_ stream
// rates, AROT_, CAM_RC_) or split into several (RELAY_PIN and its function) is not. No ArduPilot code is copied.
//
// Releases read: Copter-4.5.7, Plane-4.5.7, Copter-4.6.3, Copter-4.7.3 (= Plane-4.7.3 = Rover-4.7.3, d9c5097) and master at
// 2a54162 (what will be 4.8). The units are those of ArduPilot's parameter definitions of the release before and the release of
// the rename. This module is loaded when a review needs it, not with the app (it is data, and only a review reads it).
import type { RenameGroup } from './renames'

/** The renames, a conversion site of the firmware at a time. */
export const RENAME_GROUPS: readonly RenameGroup[] = [
  {
    since: '4.5', vehicles: ['copter', 'plane', 'rover'],
    release: 'Copter-4.5.7', file: 'libraries/AP_Compass/AP_Compass.cpp',
    renames: [
      ['COMPASS_TYPEMASK', 'COMPASS_DISBLMSK', 516],
    ],
  },
  {
    since: '4.5', vehicles: ['plane'], scale: 0.01,
    release: 'Plane-4.5.7', file: 'ArduPlane/Parameters.cpp',
    renames: [
      ['TRIM_PITCH_CD', 'PTCH_TRIM_DEG', 1555, 'cdeg', 'deg'],
      ['TRIM_ARSPD_CM', 'AIRSPEED_CRUISE', 1556, 'cm/s', 'm/s'],
      ['MIN_GNDSPD_CM', 'MIN_GROUNDSPEED', 1557, 'cm/s', 'm/s'],
      ['ALT_HOLD_RTL', 'RTL_ALTITUDE', 1558, 'cm', 'm'],
      ['ALT_HOLD_FBWCM', 'CRUISE_ALT_FLOOR', 1559, 'cm', 'm'],
      ['LIM_PITCH_MAX', 'PTCH_LIM_MAX_DEG', 1560, 'cdeg', 'deg'],
      ['LIM_PITCH_MIN', 'PTCH_LIM_MIN_DEG', 1561, 'cdeg', 'deg'],
      ['LIM_ROLL_CD', 'ROLL_LIMIT_DEG', 1562, 'cdeg', 'deg'],
    ],
  },
  {
    since: '4.5', vehicles: ['plane'],
    release: 'Plane-4.5.7', file: 'ArduPlane/Parameters.cpp',
    renames: [
      ['ARSPD_FBW_MIN', 'AIRSPEED_MIN', 289],
      ['ARSPD_FBW_MAX', 'AIRSPEED_MAX', 298],
    ],
  },
  {
    since: '4.5', vehicles: ['plane'], scale: 0.01,
    release: 'Plane-4.5.7', file: 'libraries/AP_Landing/AP_Landing.cpp',
    renames: [
      ['LAND_PITCH_CD', 'LAND_PITCH_DEG', 719, 'cdeg', 'deg'],
    ],
  },
  {
    since: '4.5', vehicles: ['plane'], scale: 0.01,
    release: 'Plane-4.5.7', file: 'ArduPlane/quadplane.cpp',
    renames: [
      ['Q_LAND_SPEED', 'Q_LAND_FINAL_SPD', 836, 'cm/s', 'm/s'],
      ['Q_VELZ_MAX', 'Q_PILOT_SPD_UP', 837, 'cm/s', 'm/s'],
      ['Q_VELZ_MAX_DN', 'Q_PILOT_SPD_DN', 838, 'cm/s', 'm/s'],
      ['Q_ACCEL_Z', 'Q_PILOT_ACCEL_Z', 839, 'cm/s/s', 'm/s/s'],
    ],
  },
  {
    since: '4.6', vehicles: ['copter', 'plane', 'rover'],
    release: 'Copter-4.6.3', file: 'libraries/AP_GPS/AP_GPS.cpp',
    renames: [
      ['GPS_TYPE', 'GPS1_TYPE', 373],
      ['GPS_TYPE2', 'GPS2_TYPE', 374],
      ['GPS_GNSS_MODE', 'GPS1_GNSS_MODE', 375],
      ['GPS_GNSS_MODE2', 'GPS2_GNSS_MODE', 376],
      ['GPS_RATE_MS', 'GPS1_RATE_MS', 377],
      ['GPS_RATE_MS2', 'GPS2_RATE_MS', 378],
      ['GPS_POS1_X', 'GPS1_POS_X', 379],
      ['GPS_POS1_Y', 'GPS1_POS_Y', 379],
      ['GPS_POS1_Z', 'GPS1_POS_Z', 379],
      ['GPS_POS2_X', 'GPS2_POS_X', 380],
      ['GPS_POS2_Y', 'GPS2_POS_Y', 380],
      ['GPS_POS2_Z', 'GPS2_POS_Z', 380],
      ['GPS_DELAY_MS', 'GPS1_DELAY_MS', 381],
      ['GPS_DELAY_MS2', 'GPS2_DELAY_MS', 382],
      ['GPS_COM_PORT', 'GPS1_COM_PORT', 384],
      ['GPS_COM_PORT2', 'GPS2_COM_PORT', 385],
      ['GPS_CAN_NODEID1', 'GPS1_CAN_NODEID', 389],
      ['GPS_CAN_NODEID2', 'GPS2_CAN_NODEID', 390],
    ],
  },
  {
    since: '4.6', vehicles: ['copter', 'plane', 'rover'],
    release: 'Copter-4.6.3', file: 'libraries/AP_GPS/AP_GPS.cpp',
    renames: [
      ['GPS_MB1_TYPE', 'GPS1_MB_TYPE', 403],
      ['GPS_MB1_OFS_X', 'GPS1_MB_OFS_X', 403],
      ['GPS_MB1_OFS_Y', 'GPS1_MB_OFS_Y', 403],
      ['GPS_MB1_OFS_Z', 'GPS1_MB_OFS_Z', 403],
      ['GPS_MB2_TYPE', 'GPS2_MB_TYPE', 403],
      ['GPS_MB2_OFS_X', 'GPS2_MB_OFS_X', 403],
      ['GPS_MB2_OFS_Y', 'GPS2_MB_OFS_Y', 403],
      ['GPS_MB2_OFS_Z', 'GPS2_MB_OFS_Z', 403],
    ],
  },
  {
    since: '4.6', vehicles: ['copter'],
    release: 'Copter-4.6.3', file: 'libraries/AP_Motors/AP_MotorsHeli.cpp',
    renames: [
      ['H_RSC_AROT_MN_EN', 'H_RSC_AROT_ENBL', 642],
      ['H_RSC_AROT_ENG_T', 'H_RSC_AROT_RAMP', 643],
    ],
  },
  {
    since: '4.6', vehicles: ['rover'],
    release: 'Copter-4.6.3', file: 'Rover/Parameters.cpp',
    renames: [
      ['TRQD_TYPE', 'TRQ1_TYPE', 813],
      ['TRQD_ONOFF_PIN', 'TRQ1_ONOFF_PIN', 814],
      ['TRQD_DE_PIN', 'TRQ1_DE_PIN', 815],
      ['TRQD_OPTIONS', 'TRQ1_OPTIONS', 816],
      ['TRQD_POWER', 'TRQ1_POWER', 817],
      ['TRQD_SLEW_TIME', 'TRQ1_SLEW_TIME', 818],
      ['TRQD_DIR_DELAY', 'TRQ1_DIR_DELAY', 819],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'],
    release: 'Copter-4.7.3', file: 'ArduCopter/Parameters.cpp',
    renames: [
      ['SYSID_THISMAV', 'MAV_SYSID', 1296],
      ['SYSID_MYGCS', 'MAV_GCS_SYSID', 1297],
      ['SYSID_ENFORCE', 'MAV_OPTIONS', 1298],
      ['TELEM_DELAY', 'MAV_TELEM_DELAY', 1299],
    ],
  },
  {
    since: '4.7', vehicles: ['plane'],
    release: 'Copter-4.7.3', file: 'ArduPlane/Parameters.cpp',
    renames: [
      ['SYSID_THISMAV', 'MAV_SYSID', 1559],
      ['SYSID_MYGCS', 'MAV_GCS_SYSID', 1560],
      ['SYSID_ENFORCE', 'MAV_OPTIONS', 1561],
      ['TELEM_DELAY', 'MAV_TELEM_DELAY', 1562],
    ],
  },
  {
    since: '4.7', vehicles: ['rover'],
    release: 'Copter-4.7.3', file: 'Rover/Parameters.cpp',
    renames: [
      ['SYSID_THISMAV', 'MAV_SYSID', 911],
      ['SYSID_MYGCS', 'MAV_GCS_SYSID', 912],
      ['SYSID_ENFORCE', 'MAV_OPTIONS', 913],
      ['TELEM_DELAY', 'MAV_TELEM_DELAY', 914],
    ],
  },
  {
    since: '4.7', vehicles: ['copter', 'plane', 'rover'], convert: 'skipChecks',
    release: 'Copter-4.7.3', file: 'libraries/AP_Arming/AP_Arming.cpp',
    renames: [
      ['ARMING_CHECK', 'ARMING_SKIPCHK', 228],
    ],
  },
  {
    since: '4.7', vehicles: ['copter', 'plane', 'rover'],
    release: 'Copter-4.7.3', file: 'libraries/AP_NavEKF3/AP_NavEKF3.cpp',
    renames: [
      ['EK3_MAX_FLOW', 'EK3_FLOW_MAX', 312],
    ],
  },
  {
    since: '4.7', vehicles: ['copter', 'plane', 'rover'], scale: 0.01,
    release: 'Copter-4.7.3', file: 'libraries/AP_RangeFinder/AP_RangeFinder_Params.cpp',
    renames: [
      ['RNGFND1_MIN_CM', 'RNGFND1_MIN', 200, 'cm', 'm'],
      ['RNGFND1_MAX_CM', 'RNGFND1_MAX', 199, 'cm', 'm'],
      ['RNGFND1_GNDCLEAR', 'RNGFND1_GNDCLR', 201, 'cm', 'm'],
      ['RNGFND2_MIN_CM', 'RNGFND2_MIN', 200, 'cm', 'm'],
      ['RNGFND2_MAX_CM', 'RNGFND2_MAX', 199, 'cm', 'm'],
      ['RNGFND2_GNDCLEAR', 'RNGFND2_GNDCLR', 201, 'cm', 'm'],
      ['RNGFND3_MIN_CM', 'RNGFND3_MIN', 200, 'cm', 'm'],
      ['RNGFND3_MAX_CM', 'RNGFND3_MAX', 199, 'cm', 'm'],
      ['RNGFND3_GNDCLEAR', 'RNGFND3_GNDCLR', 201, 'cm', 'm'],
      ['RNGFND4_MIN_CM', 'RNGFND4_MIN', 200, 'cm', 'm'],
      ['RNGFND4_MAX_CM', 'RNGFND4_MAX', 199, 'cm', 'm'],
      ['RNGFND4_GNDCLEAR', 'RNGFND4_GNDCLR', 201, 'cm', 'm'],
      ['RNGFND5_MIN_CM', 'RNGFND5_MIN', 200, 'cm', 'm'],
      ['RNGFND5_MAX_CM', 'RNGFND5_MAX', 199, 'cm', 'm'],
      ['RNGFND5_GNDCLEAR', 'RNGFND5_GNDCLR', 201, 'cm', 'm'],
      ['RNGFND6_MIN_CM', 'RNGFND6_MIN', 200, 'cm', 'm'],
      ['RNGFND6_MAX_CM', 'RNGFND6_MAX', 199, 'cm', 'm'],
      ['RNGFND6_GNDCLEAR', 'RNGFND6_GNDCLR', 201, 'cm', 'm'],
      ['RNGFND7_MIN_CM', 'RNGFND7_MIN', 200, 'cm', 'm'],
      ['RNGFND7_MAX_CM', 'RNGFND7_MAX', 199, 'cm', 'm'],
      ['RNGFND7_GNDCLEAR', 'RNGFND7_GNDCLR', 201, 'cm', 'm'],
      ['RNGFND8_MIN_CM', 'RNGFND8_MIN', 200, 'cm', 'm'],
      ['RNGFND8_MAX_CM', 'RNGFND8_MAX', 199, 'cm', 'm'],
      ['RNGFND8_GNDCLEAR', 'RNGFND8_GNDCLR', 201, 'cm', 'm'],
      ['RNGFND9_MIN_CM', 'RNGFND9_MIN', 200, 'cm', 'm'],
      ['RNGFND9_MAX_CM', 'RNGFND9_MAX', 199, 'cm', 'm'],
      ['RNGFND9_GNDCLEAR', 'RNGFND9_GNDCLR', 201, 'cm', 'm'],
      ['RNGFNDA_MIN_CM', 'RNGFNDA_MIN', 200, 'cm', 'm'],
      ['RNGFNDA_MAX_CM', 'RNGFNDA_MAX', 199, 'cm', 'm'],
      ['RNGFNDA_GNDCLEAR', 'RNGFNDA_GNDCLR', 201, 'cm', 'm'],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'], scale: 0.01,
    release: 'Copter-4.7.3', file: 'ArduCopter/mode_rtl.cpp',
    renames: [
      ['RTL_ALT', 'RTL_ALT_M', 65, 'cm', 'm'],
      ['RTL_SPEED', 'RTL_SPEED_MS', 66, 'cm/s', 'm/s'],
      ['RTL_ALT_FINAL', 'RTL_ALT_FINAL_M', 67, 'cm', 'm'],
      ['RTL_CLIMB_MIN', 'RTL_CLIMB_MIN_M', 68, 'cm', 'm'],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'], scale: 0.01,
    release: 'Copter-4.7.3', file: 'ArduCopter/mode_land.cpp',
    renames: [
      ['LAND_SPEED', 'LAND_SPD_MS', 54, 'cm/s', 'm/s'],
      ['LAND_SPEED_HIGH', 'LAND_SPD_HIGH_MS', 55, 'cm/s', 'm/s'],
      ['LAND_ALT_LOW', 'LAND_ALT_LOW_M', 56, 'cm', 'm'],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'], scale: 0.01,
    release: 'Copter-4.7.3', file: 'ArduCopter/Parameters.cpp',
    renames: [
      ['PILOT_SPEED_UP', 'PILOT_SPD_UP', 1327, 'cm/s', 'm/s'],
      ['PILOT_ACCEL_Z', 'PILOT_ACC_Z', 1328, 'cm/s/s', 'm/s/s'],
      ['PILOT_TKOFF_ALT', 'PILOT_TKO_ALT_M', 1329, 'cm', 'm'],
      ['PILOT_SPEED_DN', 'PILOT_SPD_DN', 1330, 'cm/s', 'm/s'],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'], scale: 0.01,
    release: 'Copter-4.7.3', file: 'ArduCopter/mode_poshold.cpp',
    renames: [
      ['PHLD_BRAKE_ANGLE', 'PHLD_BRK_ANGLE', 65, 'cdeg', 'deg'],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'],
    release: 'Copter-4.7.3', file: 'ArduCopter/Parameters.cpp',
    renames: [
      ['PHLD_BRAKE_RATE', 'PHLD_BRK_RATE', 257],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'], scale: 0.01,
    release: 'Copter-4.7.3', file: 'libraries/AC_AttitudeControl/AC_AttitudeControl.cpp',
    renames: [
      ['ANGLE_MAX', 'ATC_ANGLE_MAX', 1193, 'cdeg', 'deg'],
      ['ATC_SLEW_YAW', 'ATC_RATE_WPY_MAX', 1194, 'cdeg/s', 'deg/s'],
      ['ATC_ACCEL_Y_MAX', 'ATC_ACC_Y_MAX', 1195, 'cdeg/s/s', 'deg/s/s'],
      ['ATC_ACCEL_R_MAX', 'ATC_ACC_R_MAX', 1196, 'cdeg/s/s', 'deg/s/s'],
      ['ATC_ACCEL_P_MAX', 'ATC_ACC_P_MAX', 1197, 'cdeg/s/s', 'deg/s/s'],
    ],
  },
  {
    since: '4.7', vehicles: ['plane'], scale: 0.01,
    release: 'Copter-4.7.3', file: 'libraries/AC_AttitudeControl/AC_AttitudeControl.cpp',
    renames: [
      ['Q_ANGLE_MAX', 'Q_A_ANGLE_MAX', 1177, 'cdeg', 'deg'],
      ['Q_A_SLEW_YAW', 'Q_A_RATE_WPY_MAX', 1178, 'cdeg/s', 'deg/s'],
      ['Q_A_ACCEL_Y_MAX', 'Q_A_ACC_Y_MAX', 1179, 'cdeg/s/s', 'deg/s/s'],
      ['Q_A_ACCEL_R_MAX', 'Q_A_ACC_R_MAX', 1180, 'cdeg/s/s', 'deg/s/s'],
      ['Q_A_ACCEL_P_MAX', 'Q_A_ACC_P_MAX', 1181, 'cdeg/s/s', 'deg/s/s'],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'], scale: 0.01,
    release: 'Copter-4.7.3', file: 'libraries/AC_Avoidance/AC_Avoid.cpp',
    renames: [
      ['AVOID_ANGLE_MAX', 'AVOID_ANG_MAX', 150, 'cdeg', 'deg'],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'], scale: 0.01,
    release: 'Copter-4.7.3', file: 'libraries/AC_WPNav/AC_Circle.cpp',
    renames: [
      ['CIRCLE_RADIUS', 'CIRCLE_RADIUS_M', 484, 'cm', 'm'],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'], scale: 0.01,
    release: 'Copter-4.7.3', file: 'libraries/AC_WPNav/AC_Loiter.cpp',
    renames: [
      ['LOIT_SPEED', 'LOIT_SPEED_MS', 291, 'cm/s', 'm/s'],
      ['LOIT_ACC_MAX', 'LOIT_ACC_MAX_M', 292, 'cm/s/s', 'm/s/s'],
      ['LOIT_BRK_ACCEL', 'LOIT_BRK_ACC_M', 293, 'cm/s/s', 'm/s/s'],
      ['LOIT_BRK_JERK', 'LOIT_BRK_JRK_M', 294, 'cm/s/s/s', 'm/s/s/s'],
    ],
  },
  {
    since: '4.7', vehicles: ['plane'], scale: 0.01,
    release: 'Copter-4.7.3', file: 'libraries/AC_WPNav/AC_Loiter.cpp',
    renames: [
      ['Q_LOIT_SPEED', 'Q_LOIT_SPEED_MS', 275, 'cm/s', 'm/s'],
      ['Q_LOIT_ACC_MAX', 'Q_LOIT_ACC_MAX_M', 276, 'cm/s/s', 'm/s/s'],
      ['Q_LOIT_BRK_ACCEL', 'Q_LOIT_BRK_ACC_M', 277, 'cm/s/s', 'm/s/s'],
      ['Q_LOIT_BRK_JERK', 'Q_LOIT_BRK_JRK_M', 278, 'cm/s/s/s', 'm/s/s/s'],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'], scale: 0.01,
    release: 'Copter-4.7.3', file: 'libraries/AC_WPNav/AC_WPNav.cpp',
    renames: [
      ['WPNAV_SPEED', 'WP_SPD', 152, 'cm/s', 'm/s'],
      ['WPNAV_RADIUS', 'WP_RADIUS_M', 153, 'cm', 'm'],
      ['WPNAV_SPEED_UP', 'WP_SPD_UP', 154, 'cm/s', 'm/s'],
      ['WPNAV_SPEED_DN', 'WP_SPD_DN', 155, 'cm/s', 'm/s'],
      ['WPNAV_ACCEL', 'WP_ACC', 156, 'cm/s/s', 'm/s/s'],
      ['WPNAV_ACCEL_Z', 'WP_ACC_Z', 157, 'cm/s/s', 'm/s/s'],
      ['WPNAV_ACCEL_C', 'WP_ACC_CNR', 158, 'cm/s/s', 'm/s/s'],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'],
    release: 'Copter-4.7.3', file: 'ArduCopter/Parameters.cpp',
    renames: [
      ['WPNAV_RFND_USE', 'WP_RFND_USE', 369],
      ['WPNAV_JERK', 'WP_JERK', 369],
      ['WPNAV_TER_MARGIN', 'WP_TER_MARGIN', 369],
    ],
  },
  {
    since: '4.7', vehicles: ['plane'], scale: 0.01,
    release: 'Copter-4.7.3', file: 'libraries/AC_WPNav/AC_WPNav.cpp',
    renames: [
      ['Q_WP_SPEED', 'Q_WP_SPD', 130, 'cm/s', 'm/s'],
      ['Q_WP_RADIUS', 'Q_WP_RADIUS_M', 131, 'cm', 'm'],
      ['Q_WP_SPEED_UP', 'Q_WP_SPD_UP', 132, 'cm/s', 'm/s'],
      ['Q_WP_SPEED_DN', 'Q_WP_SPD_DN', 133, 'cm/s', 'm/s'],
      ['Q_WP_ACCEL', 'Q_WP_ACC', 134, 'cm/s/s', 'm/s/s'],
      ['Q_WP_ACCEL_Z', 'Q_WP_ACC_Z', 135, 'cm/s/s', 'm/s/s'],
      ['Q_WP_ACCEL_C', 'Q_WP_ACC_CNR', 136, 'cm/s/s', 'm/s/s'],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'],
    release: 'Copter-4.7.3', file: 'libraries/AC_AttitudeControl/AC_PosControl.cpp',
    renames: [
      ['PSC_VELZ_P', 'PSC_D_VEL_P', 1852],
      ['PSC_VELZ_I', 'PSC_D_VEL_I', 1853],
      ['PSC_VELZ_D', 'PSC_D_VEL_D', 1854],
      ['PSC_VELZ_FLTE', 'PSC_D_VEL_FLTE', 1855],
      ['PSC_VELZ_FLTD', 'PSC_D_VEL_FLTD', 1856],
      ['PSC_VELZ_FF', 'PSC_D_VEL_FF', 1857],
      ['PSC_ACCZ_FF', 'PSC_D_ACC_FF', 1858],
      ['PSC_ACCZ_FLTT', 'PSC_D_ACC_FLTT', 1859],
      ['PSC_ACCZ_FLTE', 'PSC_D_ACC_FLTE', 1860],
      ['PSC_ACCZ_FLTD', 'PSC_D_ACC_FLTD', 1861],
      ['PSC_ACCZ_SMAX', 'PSC_D_ACC_SMAX', 1862],
      ['PSC_ACCZ_PDMX', 'PSC_D_ACC_PDMX', 1863],
      ['PSC_ACCZ_D_FF', 'PSC_D_ACC_D_FF', 1864],
      ['PSC_ACCZ_NEF', 'PSC_D_ACC_NEF', 1865],
      ['PSC_ACCZ_NTF', 'PSC_D_ACC_NTF', 1866],
      ['PSC_VELXY_P', 'PSC_NE_VEL_P', 1867],
      ['PSC_VELXY_I', 'PSC_NE_VEL_I', 1868],
      ['PSC_VELXY_D', 'PSC_NE_VEL_D', 1869],
      ['PSC_VELXY_FLTE', 'PSC_NE_VEL_FLTE', 1870],
      ['PSC_VELXY_FLTD', 'PSC_NE_VEL_FLTD', 1871],
      ['PSC_VELXY_FF', 'PSC_NE_VEL_FF', 1872],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'], scale: 0.1,
    release: 'Copter-4.7.3', file: 'libraries/AC_AttitudeControl/AC_PosControl.cpp',
    renames: [
      ['PSC_ACCZ_P', 'PSC_D_ACC_P', 1886],
      ['PSC_ACCZ_I', 'PSC_D_ACC_I', 1887],
      ['PSC_ACCZ_D', 'PSC_D_ACC_D', 1888],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'], scale: 0.01,
    release: 'Copter-4.7.3', file: 'libraries/AC_AttitudeControl/AC_PosControl.cpp',
    renames: [
      ['PSC_VELZ_IMAX', 'PSC_D_VEL_IMAX', 1904],
      ['PSC_VELXY_IMAX', 'PSC_NE_VEL_IMAX', 1905, 'cm/s/s', 'm/s/s'],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'], scale: 0.001,
    release: 'Copter-4.7.3', file: 'libraries/AC_AttitudeControl/AC_PosControl.cpp',
    renames: [
      ['PSC_ACCZ_IMAX', 'PSC_D_ACC_IMAX', 1915],
    ],
  },
  {
    since: '4.7', vehicles: ['copter'],
    release: 'Copter-4.7.3', file: 'libraries/AC_AttitudeControl/AC_PosControl.cpp',
    renames: [
      ['PSC_POSZ_P', 'PSC_D_POS_P', 102],
      ['PSC_POSXY_P', 'PSC_NE_POS_P', 114],
      ['PSC_JERK_XY', 'PSC_NE_JERK', 136],
      ['PSC_JERK_Z', 'PSC_D_JERK', 145],
    ],
  },
  {
    since: '4.7', vehicles: ['plane'],
    release: 'Copter-4.7.3', file: 'libraries/AC_AttitudeControl/AC_PosControl.cpp',
    renames: [
      ['Q_P_VELZ_P', 'Q_P_D_VEL_P', 1828],
      ['Q_P_VELZ_I', 'Q_P_D_VEL_I', 1829],
      ['Q_P_VELZ_D', 'Q_P_D_VEL_D', 1830],
      ['Q_P_VELZ_FLTE', 'Q_P_D_VEL_FLTE', 1831],
      ['Q_P_VELZ_FLTD', 'Q_P_D_VEL_FLTD', 1832],
      ['Q_P_VELZ_FF', 'Q_P_D_VEL_FF', 1833],
      ['Q_P_ACCZ_FF', 'Q_P_D_ACC_FF', 1834],
      ['Q_P_ACCZ_FLTT', 'Q_P_D_ACC_FLTT', 1835],
      ['Q_P_ACCZ_FLTE', 'Q_P_D_ACC_FLTE', 1836],
      ['Q_P_ACCZ_FLTD', 'Q_P_D_ACC_FLTD', 1837],
      ['Q_P_ACCZ_SMAX', 'Q_P_D_ACC_SMAX', 1838],
      ['Q_P_ACCZ_PDMX', 'Q_P_D_ACC_PDMX', 1839],
      ['Q_P_ACCZ_D_FF', 'Q_P_D_ACC_D_FF', 1840],
      ['Q_P_ACCZ_NEF', 'Q_P_D_ACC_NEF', 1841],
      ['Q_P_ACCZ_NTF', 'Q_P_D_ACC_NTF', 1842],
      ['Q_P_VELXY_P', 'Q_P_NE_VEL_P', 1843],
      ['Q_P_VELXY_I', 'Q_P_NE_VEL_I', 1844],
      ['Q_P_VELXY_D', 'Q_P_NE_VEL_D', 1845],
      ['Q_P_VELXY_FLTE', 'Q_P_NE_VEL_FLTE', 1846],
      ['Q_P_VELXY_FLTD', 'Q_P_NE_VEL_FLTD', 1847],
      ['Q_P_VELXY_FF', 'Q_P_NE_VEL_FF', 1848],
    ],
  },
  {
    since: '4.7', vehicles: ['plane'], scale: 0.1,
    release: 'Copter-4.7.3', file: 'libraries/AC_AttitudeControl/AC_PosControl.cpp',
    renames: [
      ['Q_P_ACCZ_P', 'Q_P_D_ACC_P', 1880],
      ['Q_P_ACCZ_I', 'Q_P_D_ACC_I', 1881],
      ['Q_P_ACCZ_D', 'Q_P_D_ACC_D', 1882],
    ],
  },
  {
    since: '4.7', vehicles: ['plane'], scale: 0.01,
    release: 'Copter-4.7.3', file: 'libraries/AC_AttitudeControl/AC_PosControl.cpp',
    renames: [
      ['Q_P_VELZ_IMAX', 'Q_P_D_VEL_IMAX', 1899],
      ['Q_P_VELXY_IMAX', 'Q_P_NE_VEL_IMAX', 1900, 'cm/s/s', 'm/s/s'],
    ],
  },
  {
    since: '4.7', vehicles: ['plane'], scale: 0.001,
    release: 'Copter-4.7.3', file: 'libraries/AC_AttitudeControl/AC_PosControl.cpp',
    renames: [
      ['Q_P_ACCZ_IMAX', 'Q_P_D_ACC_IMAX', 1913],
    ],
  },
  {
    since: '4.7', vehicles: ['plane'],
    release: 'Copter-4.7.3', file: 'libraries/AC_AttitudeControl/AC_PosControl.cpp',
    renames: [
      ['Q_P_POSZ_P', 'Q_P_D_POS_P', 102],
      ['Q_P_POSXY_P', 'Q_P_NE_POS_P', 114],
      ['Q_P_JERK_XY', 'Q_P_NE_JERK', 136],
      ['Q_P_JERK_Z', 'Q_P_D_JERK', 145],
    ],
  },
  {
    since: '4.7', vehicles: ['plane'],
    release: 'Copter-4.7.3', file: 'ArduPlane/Parameters.cpp',
    renames: [
      ['GLIDE_SLOPE_MIN', 'ALT_SLOPE_MIN', 80],
      ['GLIDE_SLOPE_THR', 'ALT_SLOPE_MAXHGT', 89],
    ],
  },
  {
    since: '4.8', vehicles: ['copter'],
    release: 'master 2a54162', file: 'libraries/AP_Motors/AP_MotorsHeli_Single.cpp',
    renames: [
      ['H_SW_H3_PHANG', 'H_SW_PHANG', 645],
    ],
  },
  {
    since: '4.8', vehicles: ['copter'],
    release: 'master 2a54162', file: 'libraries/AP_Motors/AP_MotorsHeli_Dual.cpp',
    renames: [
      ['H_SW2_H3_PHANG', 'H_SW2_PHANG', 602],
    ],
  },
]
