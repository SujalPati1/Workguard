import { useState, useEffect } from 'react';

const { ipcRenderer } = window.require('electron');

export function useWorkGuardData() {
  const [status, setStatus] = useState("Waiting...");
  const [ear, setEar] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isYawning, setIsYawning] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const handler = (event, dataString) => {
      try {
        const data = JSON.parse(dataString);

        if (data.type === 'biometrics') {
          setStatus(data.status || "Unknown");
          setEar(data.ear || 0);
          setIsSpeaking(Boolean(data.is_speaking));
          setIsYawning(Boolean(data.is_yawning));

          // Maintain last 50 points
          setHistory(prev => {
            const newHistory = [
              ...prev,
              {
                time: new Date().toLocaleTimeString(),
                value: data.ear || 0
              }
            ];
            if (newHistory.length > 50) newHistory.shift();
            return newHistory;
          });
        }
      } catch (e) {
        console.error("Parse Error:", e);
      }
    };

    ipcRenderer.on('python-data', handler);

    return () => {
      ipcRenderer.removeListener('python-data', handler);
    };
  }, []);

  return { status, ear, history, isSpeaking, isYawning };
}
