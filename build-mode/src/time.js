const DAY_NAME_TO_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

function normalizeMinuteWindow(startMinutes, endMinutes) {
  if (endMinutes >= startMinutes) {
    return { start: startMinutes, end: endMinutes };
  }

  return { start: startMinutes, end: endMinutes + 1440 };
}

function overlapMinutes(a, b) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

export function timeStringToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours * 60 + minutes) % 1440;
}

export function dayMatches(daysOfWeek, date) {
  if (!Array.isArray(daysOfWeek) || !daysOfWeek.length) {
    return true;
  }

  const dayIndex = date.getDay();

  return daysOfWeek.some((day) => {
    if (typeof day === "number") {
      return day === dayIndex;
    }

    return DAY_NAME_TO_INDEX[String(day).toLowerCase()] === dayIndex;
  });
}

export function computeTemporalMatchScore(date, timeWindow) {
  if (!timeWindow?.start || !timeWindow?.end) {
    return 0;
  }

  const startMinutes = date.getHours() * 60 + date.getMinutes();
  const postWindow = normalizeMinuteWindow(startMinutes - 30, startMinutes + 30);
  const routineWindow = normalizeMinuteWindow(
    timeStringToMinutes(timeWindow.start),
    timeStringToMinutes(timeWindow.end)
  );

  const routineAlternates = [
    routineWindow,
    { start: routineWindow.start - 1440, end: routineWindow.end - 1440 },
    { start: routineWindow.start + 1440, end: routineWindow.end + 1440 }
  ];

  const bestOverlap = routineAlternates.reduce((best, candidate) => {
    return Math.max(best, overlapMinutes(postWindow, candidate));
  }, 0);

  const baseDuration = Math.max(60, routineWindow.end - routineWindow.start);
  return Number((bestOverlap / baseDuration).toFixed(2));
}
