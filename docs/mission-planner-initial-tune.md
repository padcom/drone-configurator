# Mission Planner "Initial Parameter Setup": how it computes the initial tune

Read on 2026-11-15 from a checkout of https://github.com/ArduPilot/MissionPlanner (read-only). Every line below is quoted from
`GCSViews/ConfigurationView/ConfigInitialParams.cs` (called **CIP** here), the Config > Initial Parameter Setup page. Nothing is from memory.
`plugins/InitialParamsCalculator.cs` (called **PLUGIN**) is an older copy of the same calculator (an Alt+A plugin); it differs, see the end.

## Inputs (CIP)

- `CIP:15-18` `prop_size`, `batt_cells`, `batt_cell_max_voltage`, `batt_cell_min_voltage`.
- `CIP:56-57` page defaults: `double prop = 9; double cellcount = 4;`; `CIP:66` battery type index 0 (LiPo).
- `CIP:128-131` read from the text boxes; `CIP:133-139` "Prop size must be larger than zero."; `CIP:141-145` "Battery cell count must be at least 1."
- Battery types, `CIP:257-275` (cell max / cell min): LiPo 4.2 / 3.3 (`:258-259`), LiPoHV 4.35 / 3.3 (`:263-264`), LiIon 4.1 / 2.8 (`:268-269`); default 4.2 / 3.3 (`:272-273`).

## Formulas (`calc_values`, CIP:89-121)

| Parameter (as MP names it) | Formula | Line |
| --- | --- | --- |
| `atc_accel_y_max` (centi-deg/s/s) | `Math.Max(8000, RoundTo(-900 * prop_size + 36000, -2))` | 91 |
| `acro_yaw_p` | `0.5 * atc_accel_y_max / 4500` | 93 |
| `atc_accel_p_max` | `Math.Max(10000, RoundTo(-2.613267 * Math.Pow(prop_size, 3) + 343.39216 * Math.Pow(prop_size, 2) - 15083.7121 * prop_size + 235771, -2))` | 95 |
| `atc_accel_r_max` | `= atc_accel_p_max` | 96 |
| `ins_gyro_filter` | `Math.Max(20, Math.Round((289.22 * Math.Pow(prop_size, -0.838)), 0))` | 98 |
| `atc_rat_pit_fltd`, `_fltt`, `atc_rat_rll_fltd`, `_fltt` | `Math.Max(10, ins_gyro_filter / 2)` | 100, 102, 103, 105 |
| `atc_rat_pit_flte`, `atc_rat_rll_flte` | `0` | 101, 104 |
| `atc_rat_yaw_fltd` | `0` | 106 |
| `atc_rat_yaw_flte` | `2` | 107 |
| `atc_rat_yaw_fltt` | `Math.Max(10, ins_gyro_filter / 2)` | 108 |
| `atc_thr_mix_man` | `0.1` | 110 |
| `ins_accel_filter` | `10` | 111 |
| `mot_thst_expo` | `Math.Min(Math.Round(0.15686 * Math.Log(prop_size) + 0.23693, 2),0.80)` | 112 |
| `mot_thst_hover` | `0.2` | 113 |
| `batt_arm_volt` | `(batt_cells - 1) * 0.1 + (batt_cell_min_voltage+0.3) * batt_cells` | 115 |
| `batt_crt_volt` | `(batt_cell_min_voltage + 0.2) * batt_cells` | 116 |
| `batt_low_volt` | `(batt_cell_min_voltage + 0.3) * batt_cells` | 117 |
| `mot_bat_volt_max` | `batt_cell_max_voltage * batt_cells` | 118 |
| `mot_bat_volt_min` | `batt_cell_min_voltage * batt_cells` | 119 |

`RoundTo(value, -2)` (`CIP:74-86`): `precision = 100; value = value + (5 * 100 / 10); return Math.Round(value - (value % 100), 0)`, so it rounds to the nearest hundred, half up (`:82-84`).

## Which parameters are written, and in which unit (CIP:153-228)

- Prefixes `ATC` / `MOT` (`:153-154`); `Q_A` / `Q_M` for ArduPlane QuadPlane (`:155-159`): not used by the configurator (Copter only).
- `ACRO_YAW_P` always (`:164`).
- If the vehicle has `ATC_ACCEL_P_MAX` (`:165`): `ATC_ACCEL_P_MAX`, `_R_MAX`, `_Y_MAX` get the values as computed, i.e. **centi-degrees** (`:167-169`). Otherwise `ATC_ACC_P_MAX`, `_R_MAX`, `_Y_MAX` get the values **divided by 100** (`:173-175`), i.e. deg/s/s.
- Major version 4 (`:179`): `ATC_RAT_PIT/RLL/YAW_` `FLTD`, `FLTE`, `FLTT` (`:182-190`). Else (3.x) only `*_FILT` (`:194-196`): not used.
- Always: `ATC_THR_MIX_MAN`, `INS_ACCEL_FILTER`, `INS_GYRO_FILTER`, `MOT_THST_EXPO`, `MOT_THST_HOVER`, `BATT_ARM_VOLT`, `BATT_CRT_VOLT`, `BATT_LOW_VOLT`, `MOT_BAT_VOLT_MAX`, `MOT_BAT_VOLT_MIN` (`:200-209`).
- "T-Motor" box (`:150`, `:211-216`): `MOT_THST_EXPO = 0.2` (`:150`), `MOT_PWM_MIN 1100`, `MOT_PWM_MAX 1940` (`:213-214`).
- "Suggested" box (`:218-228`, version 4, not ArduPlane): `BATT_FS_CRT_ACT 1`, `BATT_FS_LOW_ACT 2`, `FENCE_ACTION 3`, `FENCE_ALT_MAX 120`, `FENCE_ENABLE 1`, `FENCE_RADIUS 150`, `FENCE_TYPE 7`.
- The values go to a compare form (`:230`) and the user presses "Write to FC" (`:234`): a review step, as the configurator's staged list.
- After the write, MP tells the user (`:246`): after a test flight (land and disarm first) set `ATC_THR_MIX_MAN` to 0.5 (`:246`), and (`:242-245`) set `PSC_D_ACC_P` to 0.1*`MOT_THST_HOVER` and `PSC_D_ACC_I` to 0.2*`MOT_THST_HOVER` when the vehicle has `PSC_D_ACC_P`, else `PSC_ACCZ_P` = `MOT_THST_HOVER` and `PSC_ACCZ_I` = 2*`MOT_THST_HOVER`.
- The page's help link is https://ardupilot.org/copter/docs/tuning-process-instructions.html (`:283`).

## Worked values for the page defaults (prop 9", 4 cells LiPo), computed from the formulas above

Not read from the source: computed by hand from it; the PR's tests assert these.

- `atc_accel_y_max` = max(8000, round100(-8100 + 36000 = 27900)) = 27900; deg/s/s: 279. `acro_yaw_p` = 0.5 * 27900 / 4500 = 3.1.
- `atc_accel_p_max` = max(10000, round100(-2.613267*729 + 343.39216*81 - 15083.7121*9 + 235771)) = round100(-1905.0 + 27814.76 - 135753.41 + 235771 = 125927.3) = 125900; deg/s/s: 1259.
- `ins_gyro_filter` = max(20, round(289.22 * 9^-0.838)) = max(20, 46) = 46 (9^-0.838 = 0.1585..., 289.22*0.1585 = 45.8); filters 23.
- `mot_thst_expo` = min(round(0.15686*ln 9 + 0.23693, 2), 0.8) = round(0.5816, 2) = 0.58.
- Battery (4S LiPo): arm (3*0.1 + 3.6*4) = 14.7, crit 3.5*4 = 14, low 3.6*4 = 14.4, max 16.8, min 13.2.

## Differences from the older PLUGIN (plugins/InitialParamsCalculator.cs, not used)

- `ins_accel_filter = 20` (PLUGIN:262) vs 10 in CIP:111.
- `mot_thst_expo = Math.Round(0.1405 * Math.Log(prop_size) + 0.3254, 2)` (PLUGIN:263) vs `0.15686 ln + 0.23693`, capped at 0.80, in CIP:112.
- `batt_arm_volt = (batt_cells - 1) * 0.1 + 3.6 * batt_cells` (PLUGIN:266), fixed 3.6, vs CIP:115 which uses the cell minimum + 0.3.
- Fixed names `ATC_ACCEL_*` (no ACC fallback), no Plane prefixes, no options. The rest (accel limits, gyro filter, filters, hover, voltages) is the same.

## Differences from ArduPilot's web page ("Setting the Aircraft Up for Tuning", https://ardupilot.org/copter/docs/setting-up-for-tuning.html)

- Sizes: MP takes any prop size > 0 (a formula), the web page has four sizes (5, 10, 20, 30) and gives no accel limit for 5".
- INS_GYRO_FILTER: 289.22 * size^-0.838, minimum 20 (9": 46); page: 80 / 40 / 20. At 10" MP gives max(20, round(289.22 * 0.1450)) = 42 (computed), the page 40.
- ATC_ACC_P/R_MAX at 10": MP 1167 deg/s/s (computed: round100(116659.8) = 116700 / 100), page 1100. ATC_ACC_Y_MAX: MP 270 at 10", page 200.
- MOT_THST_EXPO: MP 0.15686 ln(size) + 0.23693 (10": 0.60), page 0.65 at 10", 0.55 at 5".
- INS_ACCEL_FILTER: both 10. ATC_RAT_*_FLTD/FLTT: both gyro filter / 2 (MP: at least 10). ATC_RAT_YAW_FLTE 2: both.
- MP also writes (not on the web page): ACRO_YAW_P, ATC_THR_MIX_MAN 0.1, MOT_THST_HOVER 0.2, ATC_RAT_PIT/RLL_FLTE 0, ATC_RAT_YAW_FLTD 0, BATT_ARM_VOLT, BATT_CRT_VOLT, BATT_LOW_VOLT.
- Battery chemistry: MP has LiPo 4.2/3.3, LiPoHV 4.35/3.3, LiIon 4.1/2.8; the page only "standard LiPos" 4.2/3.3.

## What the configurator does with it (`apps/frontend/src/lib/setup/initialTune.ts`)

- The formulas above, for any size from 1 to 60 inches (the bounds are the interface's own) and 1 to 12 cells.
- A value outside the range ArduPilot documents (`@Range`, libraries/AC_AttitudeControl/AC_AttitudeControl.cpp and
  libraries/AP_Motors/AP_MotorsMulticopter.cpp, 4.7.2 and master) is **not offered**, and the page says so: `ATC_ACC_P_MAX` and
  `ATC_ACC_R_MAX` above 1800 (the polynomial gives 1808 at 4 inch, 1935 at 3 inch, 2210 at 1 inch), `ATC_ACC_Y_MAX` above 720,
  `MOT_BAT_VOLT_MAX` outside 6 to 53 V and `MOT_BAT_VOLT_MIN` outside 6 to 42 V (one cell gives 4.2 V and 3.3 V), and
  `INS_GYRO_FILTER` above 256 (libraries/AP_InertialSensor/AP_InertialSensor.cpp: 289 Hz at 1 inch). The older `ATC_ACCEL_*_MAX`
  (centi-degrees) have no range in that source: theirs is INFERRED as the new one x100 (0 to 180000, yaw 72000), because ArduPilot
  converts them to `ATC_ACC_*_MAX` with a scale of 0.01 (AC_AttitudeControl.cpp, `convert_old_parameters_scaled`).
- Suggestions only for parameters the vehicle has; nothing is written without the staged review.
- Not taken: the T-Motor box (`MOT_THST_EXPO` 0.2, `MOT_PWM_MIN/MAX`, CIP:150, 211-216), the "Suggested" box (CIP:218-228), the ArduPlane `Q_` names and the 3.x `*_FILT` names.
