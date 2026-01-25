// ui/src/hooks/useWorkGuardData.js
import { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron'); 
// Note: 'window.require' is a trick to use Electron in React

export function useWorkGuardData() {
  const [status, setStatus] = useState("Waiting...");
  const [ear, setEar] = useState(0);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    // Listen for data from Main Process
    ipcRenderer.on('python-data', (event, dataString) => {
      try {
        const data = JSON.parse(dataString);
        
        if (data.type === 'biometrics') {
          setStatus(data.status);
          setEar(data.ear);
          
          // Add to history graph (Keep last 50 points)
          setHistory(prev => {
            const newHistory = [...prev, { time: new Date().toLocaleTimeString(), value: data.ear }];
            if (newHistory.length > 50) newHistory.shift();
            return newHistory;
          });
        }
      } catch (e) {
        console.error("Parse Error", e);
      }
    });

    // Cleanup listener on unmount
    return () => {
      ipcRenderer.removeAllListeners('python-data');
    };
  }, []);

  return { status, ear, history };
}