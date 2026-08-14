export function formatTime(date) {
 return date.toISOString().split('T')[0];
}