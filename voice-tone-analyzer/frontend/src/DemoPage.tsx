import React from "react";
import VoiceTurnRecorder from "./components/VoiceTurnRecorder";

export default function DemoPage() {
  return (
    <div style={{ padding: 24 }}>
      <VoiceTurnRecorder
        analyzerUrl="http://localhost:3010"
        sessionId="session_demo_001"
        employeeId="employee_demo_001"
      />
    </div>
  );
}
