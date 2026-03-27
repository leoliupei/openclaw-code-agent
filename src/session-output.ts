import { appendFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const OUTPUT_BUFFER_MAX = 2000;

export function getSessionOutputFilePath(sessionId: string): string {
  return join(tmpdir(), `openclaw-agent-${sessionId}.txt`);
}

export function appendSessionOutput(outputBuffer: string[], sessionId: string, text: string): string[] {
  outputBuffer.push(text);
  if (outputBuffer.length > OUTPUT_BUFFER_MAX) {
    outputBuffer.splice(0, outputBuffer.length - OUTPUT_BUFFER_MAX);
  }
  try {
    appendFileSync(getSessionOutputFilePath(sessionId), `${text}\n`, "utf-8");
  } catch {
    // best-effort; don't let disk errors interrupt the session
  }
  return outputBuffer;
}
