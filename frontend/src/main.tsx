import React from 'react';
import ReactDOM from 'react-dom/client';
import ThemeController from './ThemeController';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeController>
      <App />
    </ThemeController>
  </React.StrictMode>,
);
