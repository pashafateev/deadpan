import { MotionConfig } from 'motion/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Live } from './live/Live';
import { Playground } from './playground/Playground';
import './styles/tokens.css';
import './styles/global.css';

// Keep visual development independent of the local game server.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      {window.location.pathname === '/live' ? <Live /> : <Playground />}
    </MotionConfig>
  </StrictMode>,
);
