/**
 * How a screen hands something to the assistant. In the middle of a session she may say something that is not an
 * answer to what was asked ("my back hurts" when asked to name a danger sign). The session passes the meaning here
 * and the assistant opens on top with it, then she is returned to where she was.
 */
export interface About {
  meaning: string;
  attrs?: Record<string, string>;
}
let open: ((about: About) => void) | undefined;
export const onAskAbout = (fn: typeof open) => void (open = fn);
export const askAbout = (about: About) => open?.(about);
