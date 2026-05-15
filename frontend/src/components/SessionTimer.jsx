import React from "react";
import { formatHMS } from "../utils/timeUtils";

const SessionTimer = ({ seconds }) => {
  return (
    <div
      style={{
        fontSize: 44,
        fontWeight: 800,
        marginTop: 15,
        marginBottom: 10,
      }}
    >
      {formatHMS(seconds)}
    </div>
  );
};

export default SessionTimer;
