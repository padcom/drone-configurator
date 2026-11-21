# Remote control with a real radio: what to check by hand

The tests (vitest, the mock backend's pads, and `rc-pad.e2e.ts` with a scripted pad) cannot say how a real radio, the real
Linux input devices and a real simulator behave together. This is the list for that. It takes about 20 minutes, needs a Linux
computer, the radio (a RadioMaster TX16S in "Joystick (HID)" mode, over USB), and the built-in simulator (step 18 also needs
ArduPilot SITL). **No real vehicle, ever: RC control only flies a simulator.**

Write the result next to each line (ok / what you saw). Anything that is not "ok" is a bug to report with the line number.

## A. The radio is seen by the backend (no simulator yet)

1. Plug the radio in. Open Settings > Remote control. Under "Where the gamepad is read", choose **The backend**.
2. The radio is shown **at once, without moving a stick** (the browser needs a stick moved first). Its name in the pad
   list is the radio's; with two pads plugged in, a "Gamepad" select appears and the choice is kept after a restart.
3. **CH1 to CH8 are its axes, and all eight move** when you move the sticks, the knobs and the sliders. Look especially at
   **CH4 and CH7**: they are the ones the browser's Gamepad API missed. Each bar moves smoothly from -1 to +1.
4. **CH9 to CH16 are its first buttons** (-1 up, +1 pressed): press the switches and see which channel moves for each.
5. Unplug the radio. Within a second the screen says the backend is not reading the gamepad. Plug it back in: it is
   shown again, and Remote control is **not** turned on by itself.
6. If the radio shows "may not be opened" (permission): the line says to give your user access with a udev rule (uaccess).
   Nothing in this application asks for the `input` group. Choose **The browser** to see that the browser still works.
7. "Automatic" on this computer reads the backend; choose "The browser" again, the radio shows after the first stick move.

## B. The mapping, the confirmation and the rest check (simulator connected)

8. Connect the built-in simulator. Settings > Remote control: **Allow remote control** on. Choose the throttle style your
   stick has: **centred** (springs back to the middle, like a DJI controller) or **low** (rests at the bottom).
9. The four sticks (roll, pitch, throttle, yaw) are mapped to the radio's sticks. Move each: its bar moves as it should.
   If one is reversed, turn that row's **Invert** on. Press **Confirm this mapping** once: it says "confirmed for this pad".
   Change a row or the style: the confirmation goes, and one press brings it back.
10. On the Fly screen turn **Remote control** on (it asks once what it does). With **a stick off the middle**, it says
    which one and what it reads, and sends nothing; after 10 seconds it turns itself off. With the sticks at rest (and a
    low throttle at the bottom, or a centred throttle in the middle) it starts, and says so.
11. The radio that was used when it started is the one flown with. With **two pads plugged in beforehand**, choose the
    other one in Settings while the control is on: it ends at once, with either "the gamepad is not being read" (the read of
    the first closes) or "another gamepad is being read than the one it was flown with". Plugging in a second pad while it
    is on changes nothing unless the new pad takes the first place in the backend's list (the first pad is the one read
    when none is chosen in Settings): then it ends the same way.

## C. Modes and the throttle (simulator)

12. **Centred throttle**: it starts only in Alt Hold, Loiter, PosHold, Sport, Circle, Flow Hold, ZigZag or Autotune. In
    Stabilize it says why it will not start. With it on in Alt Hold, change the mode to Stabilize **from the top bar**: the
    backend refuses it (`BUSY`: that mode would take the middle of the stick for thrust) and the control stays on. Change
    the mode **from outside the app** (the simulator's own console, or another ground station): the control **ends at
    once** with the reason "the flight mode does not take a centred throttle", and every stick is released.
13. A vehicle's `THR_DZ` under 30 refuses a centred throttle (it says to raise it). Alt Hold holds the altitude with the
    throttle in the middle, and the simulator climbs and descends with the stick up and down.
14. **Low throttle**: starts in Stabilize with the throttle at the bottom. With the throttle up it starts and **waits**: it
    says which stick is not at rest and sends nothing, and turns itself off after 10 seconds (as in step 10).

## D. Letting go (simulator or SITL; step 18 SITL only; for each, the vehicle must stop following the sticks within a moment)

15. Unplug the radio while the control is on: it ends and says the gamepad is not being read.
16. Hide the window (minimise it): it ends and says the window was hidden.
17. Close the lid or put the computer to sleep for a few seconds, and wake it: it must **not** be on when you are back.
18. **Needs ArduPilot SITL (a vehicle in another process), not the built-in simulator** (that one runs inside the backend and
    dies with it, so there is nothing to see). Stop the backend (end its process): the page shows the link lost and the control
    is off; SITL lets go of the sticks when its own `RC_OVERRIDE_TIME` runs out (3 s by default). Starting the backend again
    and turning the control on starts with the rest check. (The backend's 300 ms watchdog is for a page that goes quiet, not for
    a dead backend: to see it, freeze the page, e.g. pause its JavaScript in the developer tools, and the backend releases
    within 300 ms.)
19. Turn off "Allow remote control" while it is on: it ends.

## E. The yaw and arming (simulator only, nothing with propellers)

20. By default the sticks **cannot arm or disarm**: with the throttle low, push the yaw all the way: the vehicle stays as
    it is (the yaw is held to 80 %). Turn on "The sticks may arm and disarm" in Settings, **then turn the control off and on
    again**: the option is read once, when a control begins, so a control that was already on does not change. Then, with the
    vehicle disarmed, **the throttle at the bottom** and `ARMING_RUDDER` on in the vehicle (the setting's own help says so),
    the yaw to the right for the time the vehicle asks arms it. While it is flying (not landed) the hold is back.
21. First turn "The sticks may arm and disarm" **off** again (and the control off and on, as in step 20). A **centred**
    throttle holds the yaw to 80 % whatever the throttle is: check that full yaw never arms the vehicle with the throttle in
    the middle.

When all of this is ok, say so, and `rc.padSource` can default to **Automatic** (the plan keeps the browser as the default
until you do).
