export const formatHMS = (secs = 0) => {
  const s = Math.max(0, Number(secs) || 0);
  const hrs = String(Math.floor(s / 3600)).padStart(2, "0");
  const mins = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${hrs}:${mins}:${sec}`;
};
