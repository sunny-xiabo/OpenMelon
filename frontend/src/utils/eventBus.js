/**
 * Lightweight pub/sub wrapper around window CustomEvents.
 *
 * Usage:
 *   import { emit, on } from '../utils/eventBus';
 *   import { GRAPH_DATA_UPDATED_EVENT } from '../constants/events';
 *
 *   // subscribe (returns unsubscribe function)
 *   const off = on(GRAPH_DATA_UPDATED_EVENT, () => refresh());
 *   return off; // or call in useEffect cleanup
 *
 *   // publish
 *   emit(GRAPH_DATA_UPDATED_EVENT);
 */

export function emit(eventName) {
  window.dispatchEvent(new CustomEvent(eventName));
}

export function on(eventName, handler) {
  window.addEventListener(eventName, handler);
  return () => window.removeEventListener(eventName, handler);
}
