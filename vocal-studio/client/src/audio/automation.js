export function scheduleAutomation(param, points = [], fallback = 0, startAt = 0, fromTime = 0) {
  if (!param) return;
  const sorted = [...points].filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
    .sort((a, b) => a.time - b.time)
    .reduce((unique, point) => {
      if (unique.length && unique[unique.length - 1].time === point.time) unique[unique.length - 1] = point;
      else unique.push(point);
      return unique;
    }, []);
  const prior = sorted.filter((point) => point.time <= fromTime);
  const current = prior.length ? prior[prior.length - 1].value : fallback;
  param.cancelScheduledValues(startAt);
  param.setValueAtTime(current, startAt);
  for (const point of sorted) {
    if (point.time <= fromTime) continue;
    param.linearRampToValueAtTime(point.value, startAt + point.time - fromTime);
  }
}
