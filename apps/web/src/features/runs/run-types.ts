export type RunView = {
  run: {
    id: string;
    kind: string;
    status: string;
    summary: string | null;
    focus_prompt: string | null;
    error: string | null;
    progress: {
      phase?: string;
      message?: string;
      screenshotId?: string;
      bootSteps?: { name: string; status: string; detail?: string }[];
    };
  };
  blockers: { id: string; kind: string; message: string }[];
  flows: { flow_id: string; name: string; result: string; confidence: string; explanation: string | null; healed: boolean }[];
  evidence: { id: string; kind: string }[];
};
