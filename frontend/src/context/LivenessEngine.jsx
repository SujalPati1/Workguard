import React, { createContext, useContext, useState } from "react";

const LivenessContext = createContext();

export const useLiveness = () => useContext(LivenessContext);

export const LivenessProvider = ({ children }) => {
  const [checksDone, setChecksDone] = useState(0);
  const MAX_CHECKS = 3;

  return (
    <LivenessContext.Provider value={{ checksDone, setChecksDone, MAX_CHECKS }}>
      {children}
    </LivenessContext.Provider>
  );
};
