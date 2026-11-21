# Remote control with a real radio: what to check by hand

The tests (vitest, the mock backend's pads, and `rc-pad.e2e.ts` with a scripted pad) cannot say how a real radio, the real
Linux input devices and a real simulator behave together. This is the list for that. It takes about 20 minutes, needs a Linux
computer, the radio (a RadioMaster TX16S in "Joystick (HID)" mode, over USB), and the built-in simulator. **No real vehicle,
ever: RC control only flies a simulator.**

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
   If one is reversed, use that row's reverse switch. Press **Confirm this mapping** once: it says "confirmed for this pad".
   Change a row or the style: the confirmation goes, and one press brings it back.
10. On the Fly screen turn **Remote control** on (it asks once what it does). With **a stick off the middle**, it says
    which one and what it reads, and sends nothing; after 10 seconds it turns itself off. With the sticks at rest (and a
    low throttle at the bottom, or a centred throttle in the middle) it starts, and says so.
11. The radio that was used when it started is the one flown with: **plug in a second pad, or choose another in Settings,
    while it is on**: it ends at once ("another gamepad is being read").

## C. Modes and the throttle (simulator)

12. **Centred throttle**: it starts only in Alt Hold, Loiter, PosHold, Sport, Circle, Flow Hold, ZigZag or Autotune. In
    Stabilize it says why it will not start. With it on in Alt Hold, change the mode to Stabilize (from the top bar or the
    simulator): it **ends at once** and every stick is released.
13. A vehicle's `THR_DZ` under 30 refuses a centred throttle (it says to raise it). Alt Hold holds the altitude with the
    throttle in the middle, and the simulator climbs and descends with the stick up and down.
14. **Low throttle**: starts in Stabilize with the throttle at the bottom; it will not start with the throttle up.

## D. Letting go (simulator; for each, the vehicle must stop following the sticks within a moment)

15. Unplug the radio while the control is on: it ends and says the gamepad is not being read.
16. Hide the window (minimise it): it ends and says the window was hidden.
17. Close the lid or put the computer to sleep for a few seconds, and wake it: it must **not** be on when you are back.
18. Stop the backend (end its process): the page shows the link lost; the simulator stops following the sticks within
    300 ms of the last frame, and turning the control on again starts with the rest check.
19. Turn off "Allow remote control" while it is on: it ends.

## E. The yaw and arming (simulator, props off in your head)

20. By default the sticks **cannot arm or disarm**: with the throttle low, push the yaw all the way: the vehicle stays as
    it is (the yaw is held to 80 %). Turn on "The sticks may arm and disarm" in Settings: with the vehicle disarmed, the
    yaw to the right for the time the vehicle asks arms it; while it is flying (not landed) the hold is back.
21. A **centred** throttle holds the yaw to 80 % whatever the throttle is: check that full yaw never arms the vehicle
    with the throttle in the middle.

When all of this is ok, say so, and `rc.padSource` can default to **Automatic** (the plan keeps the browser as the default
until you do).
