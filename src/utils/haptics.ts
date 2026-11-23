// Lightweight native tactile feedback for Android devices (graceful no-op on iOS & desktop)

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore browser/permission restrictions
    }
  }
}

export const haptics = {
  lightTap: () => vibrate(10),
  sectorPass: () => vibrate(18),
  countdownTick: () => vibrate(22),
  countdownGo: () => vibrate([35, 30, 55]),
  finishLap: () => vibrate([25, 35, 25]),
  errorBuzz: () => vibrate([40, 25, 40])
};
