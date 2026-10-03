// Persisted schedule slots use local calendar days, including across DST changes.
function dueSlot(now, time) {
  const due = new Date(now);
  const [hours, minutes] = time.split(':').map(Number);
  due.setHours(hours, minutes, 0, 0);
  if (due > now) due.setDate(due.getDate() - 1);
  return due;
}
function slotKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function pending(state, now, time) {
  return (!state.completedSlot || state.completedSlot < slotKey(dueSlot(now, time))) && (!state.nextRetry || now.getTime() >= state.nextRetry);
}
function failed(state, now, error) {
  const failures = (state.failures || 0) + 1;
  // 5, 15, 30, then 60 minutes; never retry on every polling tick.
  const minutes = [5, 15, 30, 60][Math.min(failures - 1, 3)];
  return { ...state, failures, lastError: String(error.message || error), lastAttempt: now.toISOString(), nextRetry: now.getTime() + minutes * 60000 };
}
function succeeded(state, now, slot) {
  return { ...state, ...(slot ? { completedSlot: slot } : {}), failures: 0, lastError: '', nextRetry: 0, lastSuccess: now.toISOString() };
}
module.exports = { dueSlot, slotKey, pending, failed, succeeded };
