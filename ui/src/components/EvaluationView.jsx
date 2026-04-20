import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, PlusCircle, CheckCircle, XCircle, Focus, Smile, ShieldCheck, Activity } from 'lucide-react';

const CATEGORIES = ["Yawning", "Speaking", "Drowsy", "Distracted"];

const initResults = () => ({
  Yawning: { TP: 0, FP: 0, FN: 0 },
  Speaking: { TP: 0, FP: 0, FN: 0 },
  Drowsy: { TP: 0, FP: 0, FN: 0 },
  Distracted: { TP: 0, FP: 0, FN: 0 },
});

export default function EvaluationView({ data }) {
  const { status, isYawning, isSpeaking } = data;

  const [results, setResults] = useState(initResults());
  const [eventQueue, setEventQueue] = useState([]);

  // Use refs to track previous states so we only trigger ONCE per transition
  const prevStates = useRef({
    Yawning: false,
    Speaking: false,
    Drowsy: false,
    Distracted: false,
  });

  // Cooldown dictionary to prevent double-firing instantly
  const lastFired = useRef({
    Yawning: 0,
    Speaking: 0,
    Drowsy: 0,
    Distracted: 0,
  });

  // ── Edge Detection (Continuous Monitoring) ────────────────────────────────

  useEffect(() => {
    const isDrowsy = !!status?.includes('Drowsy');
    const isDistracted = !!status?.includes('Distracted');

    const checkEdge = (category, isNowTrue) => {
      const wasTrue = prevStates.current[category];
      
      if (isNowTrue && !wasTrue) {
        // Only queue if it's been more than 5 seconds since the last popup
        // to prevent spam from flickering edge detections
        if (Date.now() - lastFired.current[category] > 5000) {
          queueEvent(category);
          lastFired.current[category] = Date.now();
        }
      }
      
      prevStates.current[category] = isNowTrue;
    };

    checkEdge("Yawning", isYawning);
    checkEdge("Speaking", isSpeaking);
    checkEdge("Drowsy", isDrowsy);
    checkEdge("Distracted", isDistracted);

  }, [isYawning, isSpeaking, status]);

  // ── Event Queue Logic ──────────────────────────────────────────────────────

  const queueEvent = (category) => {
    setEventQueue(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      category,
      time: new Date().toLocaleTimeString()
    }]);
  };

  const handlePopupResponse = (eventId, category, isCorrect) => {
    setResults(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      if (isCorrect) {
        next[category].TP += 1;
      } else {
        next[category].FP += 1;
      }
      return next;
    });
    setEventQueue(prev => prev.filter(e => e.id !== eventId));
  };

  const handleManualMiss = (category) => {
    setResults(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next[category].FN += 1;
      return next;
    });
  };

  const resetMetrics = () => {
    setResults(initResults());
    setEventQueue([]);
  };

  // ── Rendering Helpers ──────────────────────────────────────────────────────

  const currentPopup = eventQueue[0];

  const calcMetrics = (c) => {
    const { TP, FP, FN } = c;
    const prec = (TP + FP) > 0 ? TP / (TP + FP) : 0;
    const rec = (TP + FN) > 0 ? TP / (TP + FN) : 0;
    const f1 = (prec + rec) > 0 ? (2 * prec * rec) / (prec + rec) : 0;
    return { prec: prec * 100, rec: rec * 100, f1 };
  };

  return (
    <div className="eval-container rlhf-container">
      <div className="eval-header">
        <h2>Feedback-Driven Continuous Evaluation</h2>
        <p>Leave this page open while you work naturally. When the engine detects a gesture, it will prompt you for ground-truth confirmation.</p>
      </div>

      <div className="rlhf-grid">
        
        {/* LEFT COLUMN: Queue & Miss Reporting */}
        <div className="rlhf-left">
          
          {/* Active Popup */}
          <div className="card popup-card">
            <div className="card-head">
              <AlertCircle size={18} color="#f97316"/>
              <span>Active Detections Queue ({eventQueue.length})</span>
            </div>
            
            {currentPopup ? (
              <div className="popup-active">
                <div className="popup-alert">
                  <Activity className="animate-pulse" size={24} color="#f97316"/>
                  <h3>Engine Detected: <strong>{currentPopup.category}</strong></h3>
                  <span className="popup-time">Detected at {currentPopup.time}</span>
                </div>
                <p>Was this detection correct?</p>
                <div className="popup-actions">
                  <button className="eval-btn primary" onClick={() => handlePopupResponse(currentPopup.id, currentPopup.category, true)}>
                    <CheckCircle size={18}/> YES, Correct (True Positive)
                  </button>
                  <button className="eval-btn secondary" onClick={() => handlePopupResponse(currentPopup.id, currentPopup.category, false)}>
                    <XCircle size={18}/> NO, Incorrect (False Positive)
                  </button>
                </div>
              </div>
            ) : (
              <div className="popup-empty">
                <ShieldCheck size={32} color="#22c55e" style={{opacity: 0.5, marginBottom: '1rem'}}/>
                <p>Listening... Try yawning, closing your eyes, or speaking.</p>
              </div>
            )}
          </div>

          {/* Manual Misses */}
          <div className="card miss-card">
            <div className="card-head">
              <Focus size={18} color="#3b82f6"/>
              <span>Report False Negatives (Misses)</span>
            </div>
            <p className="miss-desc">Did you just do something and the engine failed to detect it? Log it below:</p>
            <div className="miss-buttons">
              {CATEGORIES.map(cat => (
                <button key={cat} className="miss-btn" onClick={() => handleManualMiss(cat)}>
                  <PlusCircle size={16}/> I just <strong>{cat}</strong> (Engine missed it)
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Realtime Matrix */}
        <div className="rlhf-right">
          <div className="card matrix-card">
            <div className="card-head">
              <Activity size={18} color="#a855f7"/>
              <span>Live Evaluation Metrics</span>
            </div>
            
            <div className="metrics-list">
              {CATEGORIES.map(cat => {
                const c = results[cat];
                const m = calcMetrics(c);
                const totalEvents = c.TP + c.FP + c.FN;
                
                return (
                  <div key={cat} className="metric-box rlhf-metric">
                    <div className="rlhf-metric-header">
                      <h4>{cat}</h4>
                      <span className="rlhf-count">{totalEvents} events</span>
                    </div>
                    <div className="confusion-row small">
                      <span>TP: <strong>{c.TP}</strong></span>
                      <span>FP: <strong style={{color:'#ef4444'}}>{c.FP}</strong></span>
                      <span>FN: <strong style={{color:'#f97316'}}>{c.FN}</strong></span>
                    </div>
                    <div className="perf-row inline">
                      <div>P: <strong style={{color: m.prec > 0 ? '#22c55e' : '#cbd5e1'}}>{m.prec.toFixed(1)}%</strong></div>
                      <div>R: <strong style={{color: m.rec > 0 ? '#22c55e' : '#cbd5e1'}}>{m.rec.toFixed(1)}%</strong></div>
                      <div>F1: <strong style={{color: m.f1 > 0 ? '#3b82f6' : '#cbd5e1'}}>{m.f1.toFixed(2)}</strong></div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button className="eval-btn secondary w-full mt-md" onClick={resetMetrics}>Reset All Metrics</button>
          </div>
        </div>

      </div>
    </div>
  );
}
