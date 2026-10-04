import { render } from 'preact';
import { App } from './app.tsx';
import { AssistantShell } from './assistant.tsx';
import './styles.css';

render(<AssistantShell><App /></AssistantShell>, document.getElementById('app')!);

// When a new version has been installed in the background, the page is still running the old one.
// It is reloaded at the next quiet moment (the home screen), never in the middle of a session.
if ('serviceWorker' in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // first install: nothing to replace
    (window as unknown as { ammaUpdateReady?: boolean }).ammaUpdateReady = true;
    window.dispatchEvent(new Event('amma-update'));
  });
}

