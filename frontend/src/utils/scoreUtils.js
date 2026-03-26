export const calcFocusScore = (activeTime = 0, totalTime = 0) => {
  const total = Number(totalTime);
  const active = Number(activeTime);

  if (!total || total <= 0) return 0;

  const score = (active / total) * 100;

  return Math.min(100, Math.max(0, Math.round(score)));
};
