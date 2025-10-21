export function useRoomSlug(): string | null {
  const path = window.location.pathname.replace(/^\//, "");
  return path || null;
}