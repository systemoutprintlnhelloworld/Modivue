// Verification requires a completed answer; TTFT observations alone do not prove completion.
export function verificationStream(wireApi) {
  let text = "", complete = false, failure = null, responseId = null, stopReason = null;
  let started = false;
  const blocks = new Map();
  return {
    feed(event) {
      if (!event || typeof event !== "object") { failure = "invalid_stream"; return; }
      if (wireApi === "responses") {
        const id = event.response?.id;
        if (id && id !== responseId) {
          responseId = id; text = ""; complete = false; failure = null;
        }
        if (["response.failed", "response.incomplete", "response.refusal.delta"].includes(event.type)) failure = event.type;
        if (event.type === "response.completed") {
          complete = event.response?.status === "completed";
          text = "";
          for (const item of event.response?.output || []) {
            if (item.type === "function_call") failure = "unexpected_tool";
            for (const part of item.content || []) {
              if (part.type === "refusal") failure = "response_refused";
              if (part.type === "output_text") text += part.text || "";
            }
          }
          if (!complete) failure = "response_incomplete";
        }
      } else if (wireApi === "messages") {
        if (event.type === "message_start") started = true;
        if (event.type === "content_block_start") {
          if (!started || complete || blocks.has(event.index)) failure = "invalid_stream";
          blocks.set(event.index, event.content_block?.type);
          if (event.content_block?.type?.includes("tool")) failure = "unexpected_tool";
          if (event.content_block?.type === "text") text += event.content_block.text || "";
        }
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          if (blocks.get(event.index) !== "text" || complete) failure = "invalid_stream";
          text += event.delta.text || "";
        }
        if (event.type === "content_block_stop") blocks.delete(event.index);
        if (event.type === "message_delta") stopReason = event.delta?.stop_reason;
        if (event.type === "message_stop") complete = started && !blocks.size && ["end_turn", "stop_sequence"].includes(stopReason);
      } else {
        for (const choice of event.choices || []) {
          if (choice.delta?.refusal || choice.delta?.tool_calls) failure = "unexpected_output";
          if (choice.delta?.content) text += choice.delta.content;
          if (choice.finish_reason) complete = choice.finish_reason === "stop";
        }
      }
      if (event.type === "error" || event.error) failure = "upstream_error";
      if (text.length > 65536) { failure = "response_too_large"; text = ""; }
    },
    finish() {
      if (failure || !complete || !text.trim()) throw new Error(failure || (complete ? "empty_answer" : "incomplete_verification_stream"));
      return text;
    }
  };
}
